-- Testes do indique e ganhe (202610130002_indicacao.sql).
\set ON_ERROR_STOP on

create schema if not exists teste;
create or replace function teste.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then raise exception 'FALHOU: %', p_msg; end if;
end;
$$;
create or replace function teste.erro(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql; return null;
exception when others then return sqlstate;
end;
$$;
grant usage on schema teste to anon, authenticated, service_role;
grant execute on all functions in schema teste to anon, authenticated, service_role;
create or replace function teste.como(p_uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid, false); $$;
grant execute on function teste.como(text) to authenticated;

insert into auth.users (id, email, created_at) values
  ('f1000000-0000-4000-8000-000000000001', 'quem-indica@teste.com', now() - interval '200 days'),
  ('f1000000-0000-4000-8000-000000000002', 'amigo@teste.com', now()),
  ('f1000000-0000-4000-8000-000000000003', 'amigo-antigo@teste.com', now() - interval '30 days'),
  ('f1000000-0000-4000-8000-000000000004', 'amigo-ja-assinou@teste.com', now()),
  ('f1000000-0000-4000-8000-000000000005', 'amigo-depois-do-teste@teste.com', now()),
  ('f1000000-0000-4000-8000-000000000006', 'assinante-que-indica@teste.com', now() - interval '90 days');
insert into public.subscriptions (user_id, plan_id, status, current_period_end, provider, provider_subscription_id) values
  ('f1000000-0000-4000-8000-000000000004', 'pro_mensal', 'canceled', now() - interval '1 day', 'kiwify', 'i_ja'),
  ('f1000000-0000-4000-8000-000000000006', 'pro_anual', 'active', now() + interval '100 days', 'kiwify', 'i_anual');

set role authenticated;
select teste.ok(teste.erro('select * from public.referrals') = '42501', 'authenticated não lê referrals');
select teste.ok(teste.erro('select * from public.referral_codes') = '42501', 'authenticated não lê referral_codes');
select teste.ok(teste.erro('select public.reward_referral(auth.uid())') = '42501', 'authenticated não recompensa');

select teste.como('f1000000-0000-4000-8000-000000000001');
create temp table c1 as select public.my_referral()->>'code' as code;
select teste.ok((select code ~ '^[A-Z2-9]{8}$' from c1), 'código com 8 caracteres sem 0, O, 1, I');
select teste.ok(public.my_referral()->>'code' = (select code from c1), 'o código não muda');
select teste.ok(public.claim_referral((select code from c1))->>'status' = 'own_code', 'não vale o próprio código');

-- amigo novo: entra pelo convite e o teste vira 60 dias
select teste.como('f1000000-0000-4000-8000-000000000002');
select teste.ok(public.claim_referral('XXXXXXXX')->>'status' = 'invalid_code', 'código inexistente');
select teste.ok(public.claim_referral(lower((select code from c1)))->>'status' = 'referred', 'código aceito sem diferenciar maiúsculas');
select teste.ok(public.claim_referral((select code from c1))->>'status' = 'already_referred', 'uma indicação por conta');
select teste.ok((public.claim_trial()->>'ends_at')::timestamptz > now() + interval '59 days', 'indicado ganha 60 dias de teste');

-- amigo antigo e amigo que já assinou: não valem
select teste.como('f1000000-0000-4000-8000-000000000003');
select teste.ok(public.claim_referral((select code from c1))->>'status' = 'not_eligible', 'conta com mais de 14 dias');
select teste.como('f1000000-0000-4000-8000-000000000004');
select teste.ok(public.claim_referral((select code from c1))->>'status' = 'not_eligible', 'quem já assinou');

-- teste grátis começou antes do convite: passa a 60 dias, inclusive a cortesia
select teste.como('f1000000-0000-4000-8000-000000000005');
select teste.ok((public.claim_trial()->>'ends_at')::timestamptz < now() + interval '31 days', 'sem convite: 30 dias');
select teste.ok(public.claim_referral((select code from c1))->>'status' = 'referred', 'convite depois do teste');
reset role;
select teste.ok((select ends_at > now() + interval '59 days' from public.trial_claims where user_id = 'f1000000-0000-4000-8000-000000000005'), 'teste estendido para 60 dias');
select teste.ok((select expires_at > now() + interval '59 days' from public.entitlement_grants where user_id = 'f1000000-0000-4000-8000-000000000005' and reason = 'teste grátis de 30 dias'), 'cortesia do teste estendida');

-- recompensa no primeiro pagamento do indicado, uma vez só
select teste.ok(not exists (select 1 from public.entitlement_grants where user_id = 'f1000000-0000-4000-8000-000000000001' and reason like 'indicação%'), 'sem recompensa antes do pagamento');
select public.billing_apply_kiwify('ind1', 'paid', 'f1000000-0000-4000-8000-000000000002', 'pro_mensal', 'i_amigo', now(), '{}');
select teste.ok((select count(*) = 1 from public.entitlement_grants where user_id = 'f1000000-0000-4000-8000-000000000001' and reason like 'indicação%'), 'quem indicou ganhou 1 mês');
select teste.ok((select expires_at between now() + interval '29 days' and now() + interval '31 days' from public.entitlement_grants where user_id = 'f1000000-0000-4000-8000-000000000001' and reason like 'indicação%'), 'mês a partir de hoje para quem não tem Pro');
select public.billing_apply_kiwify('ind2', 'paid', 'f1000000-0000-4000-8000-000000000002', 'pro_mensal', 'i_amigo', now() + interval '1 month', '{}');
select teste.ok((select count(*) = 1 from public.entitlement_grants where user_id = 'f1000000-0000-4000-8000-000000000001' and reason like 'indicação%'), 'renovação não paga de novo');

-- assinante que indica: o mês é somado ao fim do período
set role authenticated;
select teste.como('f1000000-0000-4000-8000-000000000006');
create temp table c6 as select public.my_referral()->>'code' as code;
reset role;
insert into auth.users (id, email) values ('f1000000-0000-4000-8000-000000000007', 'amigo-do-assinante@teste.com');
set role authenticated;
select teste.como('f1000000-0000-4000-8000-000000000007');
select public.claim_referral((select code from c6));
reset role;
select public.billing_apply_kiwify('ind3', 'paid', 'f1000000-0000-4000-8000-000000000007', 'pro_anual', 'i_amigo2', now(), '{}');
select teste.ok((select expires_at between now() + interval '129 days' and now() + interval '131 days' from public.entitlement_grants where user_id = 'f1000000-0000-4000-8000-000000000006' and reason like 'indicação%'), 'mês somado depois do fim do anual');

-- números
set role authenticated;
select teste.como('f1000000-0000-4000-8000-000000000001');
select teste.ok((public.my_referral()->>'convidados')::int = 2 and (public.my_referral()->>'assinaram')::int = 1, 'my_referral conta convidados e assinaturas');
reset role;
set role service_role;
select teste.ok((public.admin_referral_metrics()->>'viraram_assinatura')::int = 2, 'números do painel');
reset role;

-- limite de 12 recompensas por ano
insert into auth.users (id, email) select ('f2000000-0000-4000-8000-0000000000' || lpad(i::text, 2, '0'))::uuid, 'lote' || i || '@teste.com' from generate_series(10, 23) i;
insert into public.referrals (referred_id, referrer_id, code)
  select ('f2000000-0000-4000-8000-0000000000' || lpad(i::text, 2, '0'))::uuid, 'f1000000-0000-4000-8000-000000000001', (select code from c1) from generate_series(10, 23) i;
select public.reward_referral(('f2000000-0000-4000-8000-0000000000' || lpad(i::text, 2, '0'))::uuid) from generate_series(10, 23) i;
select teste.ok((select count(*) from public.entitlement_grants where user_id = 'f1000000-0000-4000-8000-000000000001' and reason like 'indicação%') = 12, 'no máximo 12 meses por ano');
\echo 'indicacao: todos os testes passaram'
