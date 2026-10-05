-- Planos, assinaturas e direitos de acesso.
--
-- Princípio: o código nunca pergunta "qual é o plano?", só "esta conta tem o direito X no produto
-- Y?" (has_entitlement). Plano novo, preço novo ou produto novo é linha nestas tabelas, sem mudar
-- código. A validade sai das datas no momento da consulta: nenhum job liga ou desliga acesso.
--
-- Quem escreve em subscriptions é só o license-manager (webhook do Asaas e checkout), via as
-- funções billing_* com service_role. O cliente apenas lê o próprio estado em my_entitlements().

create table if not exists public.products (
  id text primary key check (id ~ '^[a-z][a-z0-9_]{1,30}$'),
  name text not null,
  status text not null default 'active' check (status in ('active', 'hidden', 'retired'))
);

create table if not exists public.plans (
  id text primary key check (id ~ '^[a-z][a-z0-9_]{1,30}$'),
  name text not null,
  price_cents integer not null check (price_cents >= 0),
  billing_interval text not null check (billing_interval in ('none', 'month', 'year')),
  active boolean not null default true
);

create table if not exists public.plan_entitlements (
  plan_id text not null references public.plans(id) on delete cascade,
  product_id text not null references public.products(id) on delete cascade,
  feature text not null check (feature in ('use', 'cloud')),
  primary key (plan_id, product_id, feature)
);

-- Um cliente no gateway por conta, para não criar cadastros duplicados a cada checkout.
create table if not exists public.billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'asaas' check (provider in ('asaas')),
  provider_customer_id text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null references public.plans(id),
  -- pending: checkout aberto, ainda sem pagamento. Não dá acesso.
  status text not null default 'pending' check (status in ('pending', 'active', 'past_due', 'canceled')),
  current_period_end timestamptz,
  provider text not null default 'asaas' check (provider in ('asaas')),
  provider_subscription_id text unique,
  checkout_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_user_idx on public.subscriptions (user_id);
-- No máximo uma assinatura viva por conta: evita cobrar duas vezes quem clica duas vezes.
create unique index if not exists subscriptions_one_live_per_user
  on public.subscriptions (user_id) where status in ('pending', 'active', 'past_due');

-- Cortesias (testadores, parceiros). Sempre com motivo; sem expires_at, valem até serem apagadas.
create table if not exists public.entitlement_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null references public.products(id),
  feature text not null check (feature in ('use', 'cloud')),
  expires_at timestamptz,
  reason text not null check (char_length(reason) between 3 and 300),
  created_at timestamptz not null default now()
);
create index if not exists entitlement_grants_user_idx on public.entitlement_grants (user_id);

-- Todo aviso do gateway fica registrado. A chave primária torna o processamento idempotente:
-- o Asaas entrega "pelo menos uma vez", então o mesmo evento pode chegar repetido.
create table if not exists public.payment_events (
  id text primary key check (char_length(id) between 1 and 200),
  provider text not null default 'asaas',
  event text not null,
  provider_subscription_id text,
  payload jsonb not null,
  outcome text,
  received_at timestamptz not null default now()
);

alter table public.products enable row level security;
alter table public.plans enable row level security;
alter table public.plan_entitlements enable row level security;
alter table public.billing_customers enable row level security;
alter table public.subscriptions enable row level security;
alter table public.entitlement_grants enable row level security;
alter table public.payment_events enable row level security;
revoke all on public.products, public.plans, public.plan_entitlements, public.billing_customers,
  public.subscriptions, public.entitlement_grants, public.payment_events from anon, authenticated;

drop trigger if exists subscriptions_touch on public.subscriptions;
create trigger subscriptions_touch before update on public.subscriptions
for each row execute function public.touch_vault_updated_at();

-- ---------- Catálogo inicial ----------
-- Preços provisórios: ajuste com UPDATE quando o preço for decidido. Assinaturas já criadas no
-- gateway mantêm o valor com que foram criadas.
insert into public.products (id, name) values ('finance', 'Arqevon Finance') on conflict (id) do nothing;
insert into public.plans (id, name, price_cents, billing_interval) values
  ('free', 'Grátis', 0, 'none'),
  ('pro_mensal', 'Pro mensal', 1490, 'month'),
  ('pro_anual', 'Pro anual', 11900, 'year')
on conflict (id) do nothing;
insert into public.plan_entitlements (plan_id, product_id, feature) values
  ('free', 'finance', 'use'),
  ('pro_mensal', 'finance', 'use'), ('pro_mensal', 'finance', 'cloud'),
  ('pro_anual', 'finance', 'use'), ('pro_anual', 'finance', 'cloud')
on conflict do nothing;

-- ---------- A regra única de acesso ----------
-- Fontes, nesta ordem: plano grátis, assinatura dentro da validade, cortesia, licença do desktop.
--   active/past_due: até current_period_end + 5 dias de carência (atraso de renovação do cartão).
--   canceled: até current_period_end, sem carência (o período pago é respeitado).
--   pending: nada.
create or replace function public.has_entitlement(p_user_id uuid, p_product text, p_feature text)
returns boolean language sql stable security definer set search_path = public as $$
  select
    exists (
      select 1 from public.plan_entitlements
      where plan_id = 'free' and product_id = p_product and feature = p_feature
    )
    or (p_user_id is not null and (
      exists (
        select 1 from public.subscriptions s
        join public.plan_entitlements e on e.plan_id = s.plan_id
        where s.user_id = p_user_id and e.product_id = p_product and e.feature = p_feature
          and s.current_period_end is not null
          and (
            (s.status in ('active', 'past_due') and now() < s.current_period_end + interval '5 days')
            or (s.status = 'canceled' and now() < s.current_period_end)
          )
      )
      or exists (
        select 1 from public.entitlement_grants g
        where g.user_id = p_user_id and g.product_id = p_product and g.feature = p_feature
          and (g.expires_at is null or g.expires_at > now())
      )
      -- Licença do desktop vinculada à conta vale como Pro do Finance enquanto estiver válida.
      or (p_product = 'finance' and p_feature in ('use', 'cloud') and exists (
        select 1 from public.licenses l
        where l.user_id = p_user_id and l.status = 'active'
          and (l.expires_at is null or l.expires_at > now())
      ))
    ));
$$;

-- O cofre passa a seguir a regra única. Mesmo comportamento de antes para licenças vinculadas,
-- agora também liberado por assinatura e cortesia.
create or replace function public.vault_entitled(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_entitlement(p_user_id, 'finance', 'cloud');
$$;

-- Estado da conta logada, para a interface decidir o que mostrar. Quem bloqueia de verdade são
-- as funções do banco; isto só informa.
create or replace function public.my_entitlements()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_sub public.subscriptions%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', 'Entre na sua conta para continuar.');
  end if;
  select * into v_sub from public.subscriptions
    where user_id = v_uid order by (status in ('pending', 'active', 'past_due')) desc, created_at desc limit 1;
  return jsonb_build_object(
    'ok', true,
    'entitlements', coalesce((
      select jsonb_agg(jsonb_build_object('product', e.product_id, 'feature', e.feature) order by e.product_id, e.feature)
      from (select distinct product_id, feature from public.plan_entitlements) e
      where public.has_entitlement(v_uid, e.product_id, e.feature)
    ), '[]'::jsonb),
    'subscription', case when v_sub.id is null then null else jsonb_build_object(
      'plan', v_sub.plan_id, 'status', v_sub.status, 'current_period_end', v_sub.current_period_end
    ) end
  );
end;
$$;

-- ---------- Escrita (só license-manager, service_role) ----------

-- Começa um checkout. Devolve a assinatura viva da conta, se houver, para não criar outra.
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
  select provider_customer_id into v_customer from public.billing_customers where user_id = p_user_id;

  select * into v_sub from public.subscriptions
    where user_id = p_user_id and status in ('pending', 'active', 'past_due') for update;
  if found and v_sub.status in ('active', 'past_due') then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_SUBSCRIBED', 'message', 'Esta conta já tem uma assinatura ativa.');
  end if;
  if found and v_sub.plan_id <> p_plan_id then
    -- Trocou de plano antes de pagar: o checkout antigo é abandonado (o license-manager o cancela no gateway).
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

create or replace function public.billing_save_customer(p_user_id uuid, p_customer_id text)
returns void language sql security definer set search_path = public as $$
  insert into public.billing_customers (user_id, provider_customer_id) values (p_user_id, p_customer_id)
  on conflict (user_id) do nothing;
$$;

-- Registra a assinatura criada no gateway. A unicidade por conta é garantida pelo índice parcial.
create or replace function public.billing_save_subscription(
  p_user_id uuid, p_plan_id text, p_provider_subscription_id text, p_checkout_url text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  insert into public.subscriptions (user_id, plan_id, status, provider_subscription_id, checkout_url)
    values (p_user_id, p_plan_id, 'pending', p_provider_subscription_id, p_checkout_url)
    returning id into v_id;
  return jsonb_build_object('ok', true, 'subscription_id', v_id);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'code', 'CONCURRENT_CHECKOUT', 'message', 'Já existe um checkout em andamento para esta conta.');
end;
$$;

-- Aplica um evento do Asaas. Idempotente pelo id do evento; eventos desconhecidos são guardados e
-- ignorados. p_due_date é o vencimento da cobrança paga: o período vale de lá até + 1 ciclo.
create or replace function public.billing_apply_event(
  p_event_id text, p_event text, p_provider_subscription_id text, p_due_date date, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sub public.subscriptions%rowtype;
  v_interval text;
  v_end timestamptz;
  v_outcome text;
begin
  insert into public.payment_events (id, event, provider_subscription_id, payload)
    values (p_event_id, p_event, p_provider_subscription_id, p_payload)
    on conflict (id) do nothing;
  if not found then
    return jsonb_build_object('ok', true, 'outcome', 'duplicate');
  end if;

  if p_provider_subscription_id is null then
    v_outcome := 'ignored_no_subscription';
  else
    select * into v_sub from public.subscriptions where provider_subscription_id = p_provider_subscription_id for update;
    if not found then
      v_outcome := 'ignored_unknown_subscription';
    elsif p_event in ('PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED') then
      if p_due_date is null then
        v_outcome := 'ignored_no_due_date';
      else
        select billing_interval into v_interval from public.plans where id = v_sub.plan_id;
        v_end := (p_due_date + case v_interval when 'year' then interval '1 year' else interval '1 month' end)::timestamptz;
        -- greatest: um aviso antigo chegando atrasado nunca encurta o período já liberado.
        update public.subscriptions
          set status = case when status = 'canceled' then 'canceled' else 'active' end,
              current_period_end = greatest(coalesce(current_period_end, v_end), v_end)
          where id = v_sub.id;
        v_outcome := 'period_extended';
      end if;
    elsif p_event = 'PAYMENT_OVERDUE' then
      update public.subscriptions set status = 'past_due' where id = v_sub.id and status = 'active';
      v_outcome := 'past_due';
    elsif p_event in ('PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_DELETED') and v_sub.status = 'pending' then
      v_outcome := 'ignored_pending';
    elsif p_event in ('PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED') then
      update public.subscriptions set status = 'canceled', current_period_end = least(coalesce(current_period_end, now()), now())
        where id = v_sub.id;
      v_outcome := 'revoked';
    elsif p_event in ('SUBSCRIPTION_DELETED', 'SUBSCRIPTION_INACTIVATED') then
      update public.subscriptions set status = 'canceled' where id = v_sub.id;
      v_outcome := 'canceled';
    else
      v_outcome := 'ignored_event';
    end if;
  end if;

  update public.payment_events set outcome = v_outcome where id = p_event_id;
  return jsonb_build_object('ok', true, 'outcome', v_outcome);
end;
$$;

revoke all on function public.has_entitlement(uuid, text, text) from public, anon, authenticated;
revoke all on function public.my_entitlements() from public, anon;
revoke all on function public.billing_begin_checkout(uuid, text) from public, anon, authenticated;
revoke all on function public.billing_save_customer(uuid, text) from public, anon, authenticated;
revoke all on function public.billing_save_subscription(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.billing_apply_event(text, text, text, date, jsonb) from public, anon, authenticated;

grant execute on function public.my_entitlements() to authenticated;
grant execute on function public.has_entitlement(uuid, text, text) to service_role;
grant execute on function public.billing_begin_checkout(uuid, text) to service_role;
grant execute on function public.billing_save_customer(uuid, text) to service_role;
grant execute on function public.billing_save_subscription(uuid, text, text, text) to service_role;
grant execute on function public.billing_apply_event(text, text, text, date, jsonb) to service_role;
