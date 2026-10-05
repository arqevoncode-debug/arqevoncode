-- Testes do gateway Kiwify (202610050004_kiwify.sql).
-- Rodar com scripts/test-migrations.sh: aplica o stub do Supabase, todas as migrações e este arquivo.
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
grant select on public.subscriptions, public.payment_events to service_role;

insert into auth.users (id, email, email_confirmed_at) values
  ('d0000000-0000-4000-8000-000000000001', 'Compradora@Teste.com', now()),
  ('d0000000-0000-4000-8000-000000000002', 'semconfirmar@teste.com', null),
  ('d0000000-0000-4000-8000-000000000003', 'tinha-asaas@teste.com', now());

-- Só o license-manager (service_role) chama as funções.
set role authenticated;
select teste.ok(teste.erro($$select public.billing_find_user_by_email('a@b.c')$$) = '42501', 'authenticated não procura contas por e-mail');
select teste.ok(teste.erro($$select public.billing_apply_kiwify('x', 'paid', null, 'pro_mensal', 'r', now(), '{}')$$) = '42501', 'authenticated não aplica eventos');
reset role;

set role service_role;
-- ---------- Conta pelo e-mail ----------
select teste.ok(public.billing_find_user_by_email('  compradora@teste.COM ') = 'd0000000-0000-4000-8000-000000000001', 'acha a conta ignorando maiúsculas e espaços');
select teste.ok(public.billing_find_user_by_email('semconfirmar@teste.com') is null, 'e-mail não confirmado não recebe compra');
select teste.ok(public.billing_find_user_by_email('ninguem@teste.com') is null, 'e-mail desconhecido');

-- ---------- Compra aprovada cria a assinatura ----------
select teste.ok(public.billing_apply_kiwify('kw:1', 'paid', 'd0000000-0000-4000-8000-000000000001', 'pro_mensal', 'sub-1', '2026-10-05T12:00:00Z', '{"a":1}')->>'outcome' = 'subscription_created', 'primeira compra cria a assinatura');
select teste.ok((select status = 'active' and provider = 'kiwify' and plan_id = 'pro_mensal' and current_period_end = '2026-11-05T12:00:00Z'
  from public.subscriptions where provider_subscription_id = 'sub-1'), 'ativa por 1 mês');
select teste.ok(public.has_entitlement('d0000000-0000-4000-8000-000000000001', 'finance', 'cloud') = (now() < '2026-11-10T12:00:00Z'::timestamptz), 'libera a nuvem dentro do período');
select teste.ok(public.billing_apply_kiwify('kw:1', 'paid', 'd0000000-0000-4000-8000-000000000001', 'pro_mensal', 'sub-1', '2026-10-05T12:00:00Z', '{}')->>'outcome' = 'duplicate', 'mesmo evento repetido é ignorado');

-- ---------- Renovação estende; aviso antigo não encurta ----------
select teste.ok(public.billing_apply_kiwify('kw:2', 'paid', 'd0000000-0000-4000-8000-000000000001', 'pro_mensal', 'sub-1', '2026-11-05T12:00:00Z', '{}')->>'outcome' = 'period_extended', 'renovação');
select teste.ok((select current_period_end from public.subscriptions where provider_subscription_id = 'sub-1') = '2026-12-05T12:00:00Z', 'período vai a dezembro');
select public.billing_apply_kiwify('kw:3', 'paid', 'd0000000-0000-4000-8000-000000000001', 'pro_mensal', 'sub-1', '2026-10-05T12:00:00Z', '{}');
select teste.ok((select current_period_end from public.subscriptions where provider_subscription_id = 'sub-1') = '2026-12-05T12:00:00Z', 'aviso atrasado não encurta');
select teste.ok((select count(*) from public.subscriptions where user_id = 'd0000000-0000-4000-8000-000000000001') = 1, 'continua uma assinatura só');

-- ---------- Reembolso revoga na hora ----------
select teste.ok(public.billing_apply_kiwify('kw:4', 'revoked', null, null, 'sub-1', null, '{}')->>'outcome' = 'revoked', 'reembolso');
select teste.ok((select status = 'canceled' and current_period_end <= now() from public.subscriptions where provider_subscription_id = 'sub-1'), 'cancelada e sem período restante');
select teste.ok(not public.has_entitlement('d0000000-0000-4000-8000-000000000001', 'finance', 'cloud'), 'sem nuvem depois do reembolso');
select teste.ok(public.billing_apply_kiwify('kw:5', 'revoked', null, null, 'sub-inexistente', null, '{}')->>'outcome' = 'ignored_unknown_subscription', 'reembolso de assinatura desconhecida');

-- ---------- Casos que não liberam nada ----------
select teste.ok(public.billing_apply_kiwify('kw:6', 'paid', null, 'pro_mensal', 'sub-2', now(), '{}')->>'outcome' = 'ignored_no_account', 'pago sem conta fica registrado');
select teste.ok(public.billing_apply_kiwify('kw:7', 'paid', 'd0000000-0000-4000-8000-000000000003', 'free', 'sub-3', now(), '{}')->>'outcome' = 'ignored_unknown_plan', 'plano sem cobrança não vale');
select teste.ok(public.billing_apply_kiwify('kw:8', 'paid', 'd0000000-0000-4000-8000-000000000003', 'pro_mensal', null, now(), '{}')->>'outcome' = 'ignored_no_reference', 'sem referência');
select teste.ok(public.billing_apply_kiwify('kw:9', 'ignored', 'd0000000-0000-4000-8000-000000000003', 'pro_mensal', 'sub-3', now(), '{}')->>'outcome' = 'ignored_event', 'evento sem efeito');
select teste.ok((select count(*) from public.payment_events where id like 'kw:%' and provider = 'kiwify') = 9, 'todo aviso fica registrado');
reset role;

-- ---------- Checkout do Asaas abandonado sai de cena ----------
insert into public.subscriptions (user_id, plan_id, status, provider, provider_subscription_id)
  values ('d0000000-0000-4000-8000-000000000003', 'pro_anual', 'pending', 'asaas', 'sub_asaas_x');
set role service_role;
select teste.ok(public.billing_apply_kiwify('kw:10', 'paid', 'd0000000-0000-4000-8000-000000000003', 'pro_anual', 'sub-4', '2026-10-05T00:00:00Z', '{}')->>'outcome' = 'subscription_created', 'compra anual na Kiwify');
select teste.ok((select status from public.subscriptions where provider_subscription_id = 'sub_asaas_x') = 'canceled', 'checkout pendente do Asaas cancelado');
select teste.ok((select current_period_end from public.subscriptions where provider_subscription_id = 'sub-4') = '2027-10-05T00:00:00Z', 'anual vale 1 ano');
reset role;

-- ---------- Renovação antecipada do anual de valor fixo soma o período ----------
-- d...3 tem o anual (sub-4) até 2027-10-05 e compra outro anual em 2027-09-01.
set role service_role;
select teste.ok(public.billing_apply_kiwify('kw:11', 'paid', 'd0000000-0000-4000-8000-000000000003', 'pro_anual', 'pedido-5', '2027-09-01T00:00:00Z', '{}')->>'outcome' = 'subscription_created', 'segunda compra anual');
select teste.ok((select current_period_end from public.subscriptions where provider_subscription_id = 'pedido-5') = '2028-10-05T00:00:00Z', 'começa quando o período atual termina');
select teste.ok((select status from public.subscriptions where provider_subscription_id = 'sub-4') = 'canceled', 'a anterior sai de cena');
-- Compra depois de vencido recomeça na data da compra.
select teste.ok(public.billing_apply_kiwify('kw:12', 'paid', 'd0000000-0000-4000-8000-000000000003', 'pro_mensal', 'pedido-6', '2029-01-10T00:00:00Z', '{}')->>'outcome' = 'subscription_created', 'compra depois de vencido');
select teste.ok((select current_period_end from public.subscriptions where provider_subscription_id = 'pedido-6') = '2029-02-10T00:00:00Z', 'sem período em vigor, conta da compra');
reset role;

\echo 'kiwify: todos os testes passaram'
