-- Teste grátis do Pro, plano Fundador e números do negócio.
--
-- Tudo segue a regra única de acesso (has_entitlement): o teste é uma cortesia com prazo
-- (entitlement_grants) e o Fundador é mais uma linha em plans. Nenhum job liga ou desliga nada.

-- ---------- 1. Teste grátis: 30 dias de Pro, uma vez por conta, sem cartão ----------
-- A tabela garante "uma vez por conta" mesmo que a cortesia seja apagada depois.
create table if not exists public.trial_claims (
  user_id uuid primary key references auth.users(id) on delete cascade,
  product_id text not null references public.products(id),
  started_at timestamptz not null default now(),
  ends_at timestamptz not null
);
alter table public.trial_claims enable row level security;
revoke all on public.trial_claims from anon, authenticated;

-- Chamado pelo app a cada login; só a primeira chamada de uma conta elegível começa o teste.
-- Não recebe o teste quem já é Pro (assinatura, cortesia ou licença) nem quem já assinou antes.
create or replace function public.claim_trial()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_claim public.trial_claims%rowtype;
  v_fim timestamptz := now() + interval '30 days';
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', 'Entre na sua conta para continuar.');
  end if;
  select * into v_claim from public.trial_claims where user_id = v_uid;
  if found then
    return jsonb_build_object('ok', true, 'status', 'used', 'ends_at', v_claim.ends_at);
  end if;
  if not exists (select 1 from auth.users where id = v_uid and email_confirmed_at is not null) then
    return jsonb_build_object('ok', true, 'status', 'not_eligible');
  end if;
  if public.has_entitlement(v_uid, 'finance', 'cloud')
     or exists (select 1 from public.subscriptions where user_id = v_uid and status <> 'pending') then
    return jsonb_build_object('ok', true, 'status', 'not_eligible');
  end if;

  insert into public.trial_claims (user_id, product_id, ends_at) values (v_uid, 'finance', v_fim)
    on conflict (user_id) do nothing;
  if not found then
    -- Outra aba chegou primeiro.
    select * into v_claim from public.trial_claims where user_id = v_uid;
    return jsonb_build_object('ok', true, 'status', 'used', 'ends_at', v_claim.ends_at);
  end if;
  insert into public.entitlement_grants (user_id, product_id, feature, expires_at, reason)
    values (v_uid, 'finance', 'cloud', v_fim, 'teste grátis de 30 dias');
  return jsonb_build_object('ok', true, 'status', 'started', 'ends_at', v_fim);
end;
$$;
revoke all on function public.claim_trial() from public, anon;
grant execute on function public.claim_trial() to authenticated;

-- ---------- 2. Plano Fundador: preço menor para sempre, vagas limitadas ----------
alter table public.plans add column if not exists max_subscribers integer check (max_subscribers is null or max_subscribers > 0);

-- Nasce desligado: só é ativado quando a oferta existir na Kiwify (KIWIFY_CHECKOUT_URLS).
insert into public.plans (id, name, price_cents, billing_interval, active, max_subscribers)
  values ('pro_fundador', 'Pro Fundador', 990, 'month', false, 100)
on conflict (id) do nothing;
insert into public.plan_entitlements (plan_id, product_id, feature) values
  ('pro_fundador', 'finance', 'use'), ('pro_fundador', 'finance', 'cloud')
on conflict do nothing;

-- Vaga ocupada = conta que chegou a pagar o plano (cancelamento não devolve a vaga: o preço é de
-- quem entrou entre os primeiros).
create or replace function public.plan_slots_left(p_plan_id text)
returns integer language sql stable security definer set search_path = public as $$
  select case when p.max_subscribers is null then null
    else greatest(p.max_subscribers - (
      select count(distinct s.user_id)::integer from public.subscriptions s
      where s.plan_id = p.id and s.status <> 'pending'), 0) end
  from public.plans p where p.id = p_plan_id;
$$;
revoke all on function public.plan_slots_left(text) from public, anon, authenticated;

create or replace function public.list_plans()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'price_cents', price_cents, 'interval', billing_interval,
    'slots_left', public.plan_slots_left(id)
  ) order by price_cents), '[]'::jsonb)
  from public.plans
  where active and billing_interval <> 'none'
    and coalesce(public.plan_slots_left(id), 1) > 0;
$$;
revoke all on function public.list_plans() from public;
grant execute on function public.list_plans() to anon, authenticated;

-- Mesma função de 202610050002, com a recusa de plano esgotado.
create or replace function public.billing_begin_checkout(p_user_id uuid, p_plan_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_plan public.plans%rowtype;
  v_sub public.subscriptions%rowtype;
  v_customer text;
begin
  select * into v_plan from public.plans where id = p_plan_id and active and billing_interval <> 'none';
  if not found then
    return jsonb_build_object('ok', false, 'code', 'PLAN_INVALID', 'message', 'Plano indisponível.');
  end if;
  if coalesce(public.plan_slots_left(p_plan_id), 1) <= 0 then
    return jsonb_build_object('ok', false, 'code', 'PLAN_SOLD_OUT', 'message', 'As vagas deste plano acabaram.');
  end if;
  select provider_customer_id into v_customer from public.billing_customers where user_id = p_user_id;

  select * into v_sub from public.subscriptions
    where user_id = p_user_id and status in ('pending', 'active', 'past_due') for update;
  if found and v_sub.status in ('active', 'past_due') then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_SUBSCRIBED', 'message', 'Esta conta já tem uma assinatura ativa.');
  end if;
  if found and v_sub.plan_id <> p_plan_id then
    update public.subscriptions set status = 'canceled' where id = v_sub.id;
    return jsonb_build_object('ok', true, 'subscription_id', null, 'replaced_provider_subscription_id', v_sub.provider_subscription_id,
      'customer_id', v_customer, 'plan', to_jsonb(v_plan));
  end if;
  if found then
    return jsonb_build_object('ok', true, 'subscription_id', v_sub.id, 'checkout_url', v_sub.checkout_url,
      'provider_subscription_id', v_sub.provider_subscription_id, 'customer_id', v_customer, 'plan', to_jsonb(v_plan));
  end if;
  return jsonb_build_object('ok', true, 'subscription_id', null, 'customer_id', v_customer, 'plan', to_jsonb(v_plan));
end;
$$;
revoke all on function public.billing_begin_checkout(uuid, text) from public, anon, authenticated;
grant execute on function public.billing_begin_checkout(uuid, text) to service_role;

-- ---------- 3. Estado da conta com o teste grátis ----------
create or replace function public.my_entitlements()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_sub public.subscriptions%rowtype;
  v_trial public.trial_claims%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', 'Entre na sua conta para continuar.');
  end if;
  select * into v_sub from public.subscriptions
    where user_id = v_uid order by (status in ('pending', 'active', 'past_due')) desc, created_at desc limit 1;
  select * into v_trial from public.trial_claims where user_id = v_uid;
  return jsonb_build_object(
    'ok', true,
    'entitlements', coalesce((
      select jsonb_agg(jsonb_build_object('product', e.product_id, 'feature', e.feature) order by e.product_id, e.feature)
      from (select distinct product_id, feature from public.plan_entitlements) e
      where public.has_entitlement(v_uid, e.product_id, e.feature)
    ), '[]'::jsonb),
    'subscription', case when v_sub.id is null then null else jsonb_build_object(
      'plan', v_sub.plan_id, 'status', v_sub.status, 'current_period_end', v_sub.current_period_end
    ) end,
    'trial', case when v_trial.user_id is null then null else jsonb_build_object(
      'ends_at', v_trial.ends_at, 'active', v_trial.ends_at > now()
    ) end
  );
end;
$$;
revoke all on function public.my_entitlements() from public, anon;
grant execute on function public.my_entitlements() to authenticated;

-- ---------- 4. Números do negócio (painel de licenças, só service_role) ----------
-- Só contagens: nenhum dado financeiro do cliente existe em claro no servidor.
create or replace function public.admin_metrics()
returns jsonb language sql stable security definer set search_path = public, auth as $$
  with precos as (
    select id, case billing_interval when 'month' then price_cents when 'year' then price_cents / 12.0 else 0 end as mensal
    from public.plans
  ),
  vivas as (
    select s.* from public.subscriptions s
    where s.current_period_end is not null and (
      (s.status in ('active', 'past_due') and now() < s.current_period_end + interval '5 days')
      or (s.status = 'canceled' and now() < s.current_period_end))
  )
  select jsonb_build_object(
    'gerado_em', now(),
    'contas', jsonb_build_object(
      'total', (select count(*) from auth.users),
      'novas_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
      'novas_30d', (select count(*) from auth.users where created_at > now() - interval '30 days'),
      'entraram_7d', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days')
    ),
    'nuvem', jsonb_build_object(
      'cofres', (select count(*) from public.vault_accounts),
      'ativos_7d', (select count(distinct user_id) from public.vault_items where updated_at > now() - interval '7 days')
    ),
    'teste', jsonb_build_object(
      'em_andamento', (select count(*) from public.trial_claims where ends_at > now()),
      'iniciados_30d', (select count(*) from public.trial_claims where started_at > now() - interval '30 days'),
      'terminados', (select count(*) from public.trial_claims where ends_at <= now()),
      'assinaram', (select count(distinct t.user_id) from public.trial_claims t
        join public.subscriptions s on s.user_id = t.user_id and s.status <> 'pending')
    ),
    'assinaturas', jsonb_build_object(
      'pagantes', (select count(distinct user_id) from vivas where status in ('active', 'past_due')),
      'por_plano', coalesce((select jsonb_object_agg(plan_id, n) from (
        select plan_id, count(*) as n from vivas where status in ('active', 'past_due') group by plan_id) x), '{}'::jsonb),
      'em_atraso', (select count(*) from vivas where status = 'past_due'),
      'canceladas_30d', (select count(*) from public.subscriptions where status = 'canceled' and updated_at > now() - interval '30 days'),
      'receita_mensal_cents', (select coalesce(round(sum(p.mensal)), 0) from vivas v join precos p on p.id = v.plan_id where v.status in ('active', 'past_due')),
      'vagas_fundador', public.plan_slots_left('pro_fundador')
    ),
    'pedidos', jsonb_build_object(
      'licencas_30d', (select count(*) from public.license_requests where created_at > now() - interval '30 days'),
      'orcamentos_30d', (select count(*) from public.quote_requests where created_at > now() - interval '30 days')
    )
  );
$$;
revoke all on function public.admin_metrics() from public, anon, authenticated;
grant execute on function public.admin_metrics() to service_role;
