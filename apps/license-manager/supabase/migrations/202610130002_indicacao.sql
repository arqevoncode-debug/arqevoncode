-- Indique e ganhe.
--
-- Quem é indicado: 60 dias de Pro grátis em vez de 30 (o teste grátis fica maior).
-- Quem indica: 1 mês de Pro quando o indicado faz o primeiro pagamento, somado ao fim do acesso
-- que já tiver. No máximo 12 recompensas por ano para quem indica.
-- Tudo é cortesia com prazo (entitlement_grants), dentro da regra única de acesso.

create table if not exists public.referral_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z2-9]{8}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.referrals (
  referred_id uuid primary key references auth.users(id) on delete cascade,
  referrer_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  created_at timestamptz not null default now(),
  rewarded_at timestamptz,
  check (referred_id <> referrer_id)
);
create index if not exists referrals_referrer_idx on public.referrals (referrer_id);

alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;
revoke all on public.referral_codes, public.referrals from anon, authenticated;

-- Código e números do próprio convite. Cria o código na primeira chamada.
create or replace function public.my_referral()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_alfabeto text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- sem 0/O e 1/I, que se confundem
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', 'Entre na sua conta para continuar.');
  end if;
  select code into v_code from public.referral_codes where user_id = v_uid;
  while v_code is null loop
    v_code := (select string_agg(substr(v_alfabeto, 1 + floor(random() * 32)::int, 1), '') from generate_series(1, 8));
    begin
      insert into public.referral_codes (user_id, code) values (v_uid, v_code);
    exception when unique_violation then
      -- outro código igual (raro) ou outra aba criou o desta conta: tenta de novo / lê o existente
      v_code := (select code from public.referral_codes where user_id = v_uid);
    end;
  end loop;
  return jsonb_build_object('ok', true, 'code', v_code,
    'convidados', (select count(*) from public.referrals where referrer_id = v_uid),
    'assinaram', (select count(*) from public.referrals where referrer_id = v_uid and rewarded_at is not null));
end;
$$;
revoke all on function public.my_referral() from public, anon;
grant execute on function public.my_referral() to authenticated;

-- A conta logada entra pelo convite de alguém. Só conta nova (até 14 dias), que nunca assinou,
-- uma vez só, e nunca com o próprio código. Se o teste grátis já começou, ele passa a 60 dias.
create or replace function public.claim_referral(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_referrer uuid;
  v_code text := upper(trim(coalesce(p_code, '')));
  v_trial public.trial_claims%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', 'Entre na sua conta para continuar.');
  end if;
  select user_id into v_referrer from public.referral_codes where code = v_code;
  if v_referrer is null then return jsonb_build_object('ok', true, 'status', 'invalid_code'); end if;
  if v_referrer = v_uid then return jsonb_build_object('ok', true, 'status', 'own_code'); end if;
  if exists (select 1 from public.referrals where referred_id = v_uid) then return jsonb_build_object('ok', true, 'status', 'already_referred'); end if;
  if not exists (select 1 from auth.users where id = v_uid and created_at > now() - interval '14 days' and email_confirmed_at is not null)
     or exists (select 1 from public.subscriptions where user_id = v_uid and status <> 'pending') then
    return jsonb_build_object('ok', true, 'status', 'not_eligible');
  end if;

  insert into public.referrals (referred_id, referrer_id, code) values (v_uid, v_referrer, v_code)
    on conflict (referred_id) do nothing;
  if not found then return jsonb_build_object('ok', true, 'status', 'already_referred'); end if;

  select * into v_trial from public.trial_claims where user_id = v_uid;
  if found and v_trial.ends_at > now() then
    update public.trial_claims set ends_at = started_at + interval '60 days' where user_id = v_uid;
    update public.entitlement_grants set expires_at = v_trial.started_at + interval '60 days'
      where user_id = v_uid and reason = 'teste grátis de 30 dias';
  end if;
  return jsonb_build_object('ok', true, 'status', 'referred');
end;
$$;
revoke all on function public.claim_referral(text) from public, anon;
grant execute on function public.claim_referral(text) to authenticated;

-- Mesma função de 202610130001, com 60 dias para quem veio por indicação.
create or replace function public.claim_trial()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_claim public.trial_claims%rowtype;
  v_fim timestamptz;
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

  v_fim := now() + case when exists (select 1 from public.referrals where referred_id = v_uid)
    then interval '60 days' else interval '30 days' end;
  insert into public.trial_claims (user_id, product_id, ends_at) values (v_uid, 'finance', v_fim)
    on conflict (user_id) do nothing;
  if not found then
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

-- Recompensa de quem indicou, no primeiro pagamento do indicado. Idempotente por rewarded_at.
create or replace function public.reward_referral(p_referred uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ref public.referrals%rowtype;
  v_fim timestamptz;
begin
  select * into v_ref from public.referrals where referred_id = p_referred and rewarded_at is null for update;
  if not found then return; end if;
  update public.referrals set rewarded_at = now() where referred_id = p_referred;
  if (select count(*) from public.referrals where referrer_id = v_ref.referrer_id
      and rewarded_at > now() - interval '1 year') > 12 then
    return; -- acima do limite anual: fica registrado, sem novo mês
  end if;
  -- o mês entra depois do fim do acesso que a pessoa já tem
  select greatest(now(),
    coalesce((select max(current_period_end) from public.subscriptions
      where user_id = v_ref.referrer_id and status in ('active', 'past_due', 'canceled')), now()),
    coalesce((select max(expires_at) from public.entitlement_grants
      where user_id = v_ref.referrer_id and product_id = 'finance' and feature = 'cloud'), now())
  ) + interval '30 days' into v_fim;
  insert into public.entitlement_grants (user_id, product_id, feature, expires_at, reason)
    values (v_ref.referrer_id, 'finance', 'cloud', v_fim, 'indicação ' || v_ref.code);
end;
$$;
revoke all on function public.reward_referral(uuid) from public, anon, authenticated;

create or replace function public.subscriptions_reward_referral()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    perform public.reward_referral(new.user_id);
  end if;
  return new;
end;
$$;
drop trigger if exists subscriptions_reward_referral on public.subscriptions;
create trigger subscriptions_reward_referral after insert or update of status on public.subscriptions
for each row execute function public.subscriptions_reward_referral();

-- Números de indicação no painel.
create or replace function public.admin_referral_metrics()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'convites_usados', (select count(*) from public.referrals),
    'convites_30d', (select count(*) from public.referrals where created_at > now() - interval '30 days'),
    'viraram_assinatura', (select count(*) from public.referrals where rewarded_at is not null)
  );
$$;
revoke all on function public.admin_referral_metrics() from public, anon, authenticated;
grant execute on function public.admin_referral_metrics() to service_role;
