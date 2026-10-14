-- Testes do teste grátis, do plano Fundador e dos números (202610130001_teste_fundador_metricas.sql).
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

insert into auth.users (id, email, email_confirmed_at) values
  ('e7000000-0000-4000-8000-000000000001', 'novo@teste.com', now()),
  ('e7000000-0000-4000-8000-000000000002', 'assinante@teste.com', now()),
  ('e7000000-0000-4000-8000-000000000003', 'cortesia@teste.com', now()),
  ('e7000000-0000-4000-8000-000000000004', 'ex-assinante@teste.com', now()),
  ('e7000000-0000-4000-8000-000000000005', 'sem-confirmar@teste.com', null),
  ('e7000000-0000-4000-8000-000000000006', 'fundador@teste.com', now());
insert into public.subscriptions (user_id, plan_id, status, current_period_end, provider, provider_subscription_id) values
  ('e7000000-0000-4000-8000-000000000002', 'pro_mensal', 'active', now() + interval '20 days', 'kiwify', 'k_t_ass'),
  ('e7000000-0000-4000-8000-000000000004', 'pro_mensal', 'canceled', now() - interval '20 days', 'kiwify', 'k_t_ex');
insert into public.entitlement_grants (user_id, product_id, feature, reason) values
  ('e7000000-0000-4000-8000-000000000003', 'finance', 'cloud', 'teste');

-- ---------- Teste grátis ----------
set role anon;
select teste.ok(teste.erro('select public.claim_trial()') = '42501', 'anon não pede teste');
reset role;
set role authenticated;
select teste.ok(teste.erro('select * from public.trial_claims') = '42501', 'authenticated não lê trial_claims');
select teste.ok(teste.erro('select public.admin_metrics()') = '42501', 'authenticated não vê os números');
select teste.ok(teste.erro('select public.plan_slots_left(''pro_fundador'')') = '42501', 'authenticated não chama plan_slots_left');

select set_config('request.jwt.claim.sub', '', false);
select teste.ok(public.claim_trial()->>'code' = 'NOT_AUTHENTICATED', 'sem login: NOT_AUTHENTICATED');

select set_config('request.jwt.claim.sub', 'e7000000-0000-4000-8000-000000000001', false);
select teste.ok(not (public.my_entitlements()->'entitlements' @> '[{"feature":"cloud"}]'), 'conta nova começa sem nuvem');
select teste.ok(public.claim_trial()->>'status' = 'started', 'conta nova começa o teste');
select teste.ok(public.my_entitlements()->'entitlements' @> '[{"product":"finance","feature":"cloud"}]', 'durante o teste tem nuvem');
select teste.ok((public.my_entitlements()->'trial'->>'active')::boolean, 'my_entitlements mostra o teste ativo');
select teste.ok((public.my_entitlements()->'trial'->>'ends_at')::timestamptz between now() + interval '29 days 23 hours' and now() + interval '30 days 1 minute', 'teste de 30 dias');
select teste.ok(public.claim_trial()->>'status' = 'used', 'segundo pedido não renova o teste');

select set_config('request.jwt.claim.sub', 'e7000000-0000-4000-8000-000000000002', false);
select teste.ok(public.claim_trial()->>'status' = 'not_eligible', 'assinante não consome teste');
select set_config('request.jwt.claim.sub', 'e7000000-0000-4000-8000-000000000003', false);
select teste.ok(public.claim_trial()->>'status' = 'not_eligible', 'quem tem cortesia não consome teste');
select set_config('request.jwt.claim.sub', 'e7000000-0000-4000-8000-000000000004', false);
select teste.ok(public.claim_trial()->>'status' = 'not_eligible', 'quem já assinou não ganha teste');
select set_config('request.jwt.claim.sub', 'e7000000-0000-4000-8000-000000000005', false);
select teste.ok(public.claim_trial()->>'status' = 'not_eligible', 'e-mail não confirmado não ganha teste');
reset role;

-- Teste vencido: perde a nuvem e não ganha outro, mesmo com a cortesia apagada.
update public.trial_claims set ends_at = now() - interval '1 minute' where user_id = 'e7000000-0000-4000-8000-000000000001';
update public.entitlement_grants set expires_at = now() - interval '1 minute' where user_id = 'e7000000-0000-4000-8000-000000000001';
select teste.ok(not public.has_entitlement('e7000000-0000-4000-8000-000000000001', 'finance', 'cloud'), 'teste vencido: sem nuvem');
select teste.ok(public.has_entitlement('e7000000-0000-4000-8000-000000000001', 'finance', 'use'), 'teste vencido: continua no grátis');
delete from public.entitlement_grants where user_id = 'e7000000-0000-4000-8000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub', 'e7000000-0000-4000-8000-000000000001', false);
select teste.ok(public.claim_trial()->>'status' = 'used', 'teste vencido não volta');
select teste.ok(not (public.my_entitlements()->'trial'->>'active')::boolean, 'my_entitlements mostra o teste encerrado');
reset role;

-- ---------- Fundador ----------
select teste.ok(not exists (select 1 from jsonb_array_elements(public.list_plans()) p where p->>'id' = 'pro_fundador'), 'fundador desligado não aparece');
select teste.ok(public.billing_begin_checkout('e7000000-0000-4000-8000-000000000006', 'pro_fundador')->>'code' = 'PLAN_INVALID', 'fundador desligado não abre checkout');
update public.plans set active = true, max_subscribers = 2 where id = 'pro_fundador';
select teste.ok((select (p->>'slots_left')::int from jsonb_array_elements(public.list_plans()) p where p->>'id' = 'pro_fundador') = 2, 'fundador mostra 2 vagas');
select teste.ok((select p->>'slots_left' from jsonb_array_elements(public.list_plans()) p where p->>'id' = 'pro_mensal') is null, 'plano sem limite não tem vagas');
select teste.ok(public.billing_begin_checkout('e7000000-0000-4000-8000-000000000006', 'pro_fundador')->>'ok' = 'true', 'fundador com vaga abre checkout');
-- duas contas pagam (uma depois cancela: a vaga não volta)
select public.billing_apply_kiwify('t_kf1', 'paid', 'e7000000-0000-4000-8000-000000000006', 'pro_fundador', 'k_f1', now(), '{}');
select public.billing_apply_kiwify('t_kf2', 'paid', 'e7000000-0000-4000-8000-000000000001', 'pro_fundador', 'k_f2', now(), '{}');
select public.billing_apply_kiwify('t_kf3', 'revoked', null, null, 'k_f2', null, '{}');
select teste.ok(public.has_entitlement('e7000000-0000-4000-8000-000000000006', 'finance', 'cloud'), 'fundador pago tem nuvem');
select teste.ok(public.plan_slots_left('pro_fundador') = 0, 'vagas esgotadas (cancelamento não devolve)');
select teste.ok(not exists (select 1 from jsonb_array_elements(public.list_plans()) p where p->>'id' = 'pro_fundador'), 'fundador esgotado some da lista');
select teste.ok(public.billing_begin_checkout('e7000000-0000-4000-8000-000000000003', 'pro_fundador')->>'code' = 'PLAN_SOLD_OUT', 'fundador esgotado recusa checkout');
select teste.ok(public.billing_begin_checkout('e7000000-0000-4000-8000-000000000003', 'pro_mensal')->>'ok' = 'true', 'mensal continua disponível');

-- ---------- Números ----------
set role service_role;
select teste.ok((public.admin_metrics()->'contas'->>'total')::int >= 6, 'conta as contas');
select teste.ok((public.admin_metrics()->'teste'->>'assinaram')::int >= 1, 'conta quem assinou depois do teste');
select teste.ok((public.admin_metrics()->'assinaturas'->'por_plano'->>'pro_fundador')::int = 1, 'assinaturas por plano');
select teste.ok((public.admin_metrics()->'assinaturas'->>'receita_mensal_cents')::numeric >= 1490 + 990, 'receita mensal soma os planos');
reset role;
\echo 'teste_fundador: todos os testes passaram'
