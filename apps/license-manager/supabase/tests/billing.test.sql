-- Testes de planos, assinaturas e direitos (202610050002_billing.sql).
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
-- No Supabase o service_role já lê as tabelas por padrão; o stub não imita isso.
grant select on public.subscriptions, public.payment_events to service_role;

-- Uma conta por situação, para os casos não interferirem entre si.
insert into auth.users (id, email) values
  ('c0000000-0000-4000-8000-000000000001', 'gratis@teste.com'),
  ('c0000000-0000-4000-8000-000000000002', 'ativo@teste.com'),
  ('c0000000-0000-4000-8000-000000000003', 'carencia@teste.com'),
  ('c0000000-0000-4000-8000-000000000004', 'vencido@teste.com'),
  ('c0000000-0000-4000-8000-000000000005', 'cancelado@teste.com'),
  ('c0000000-0000-4000-8000-000000000006', 'cortesia@teste.com'),
  ('c0000000-0000-4000-8000-000000000007', 'licenca@teste.com'),
  ('c0000000-0000-4000-8000-000000000008', 'webhook@teste.com'),
  ('c0000000-0000-4000-8000-000000000009', 'pendente@teste.com');

-- ---------- Ninguém de fora escreve nem lê as tabelas ----------
set role authenticated;
select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-000000000001', false);
select teste.ok(teste.erro('select * from public.subscriptions') = '42501', 'authenticated não lê subscriptions');
select teste.ok(teste.erro('select * from public.payment_events') = '42501', 'authenticated não lê payment_events');
select teste.ok(teste.erro('select public.has_entitlement(auth.uid(), ''finance'', ''cloud'')') = '42501', 'authenticated não chama has_entitlement');
select teste.ok(teste.erro('select public.billing_apply_event(''x'', ''PAYMENT_CONFIRMED'', ''sub'', current_date, ''{}'')') = '42501', 'authenticated não aplica eventos');
select teste.ok(teste.erro('select public.billing_save_subscription(auth.uid(), ''pro_mensal'', ''sub_x'', null)') = '42501', 'authenticated não cria assinatura');
-- Plano grátis: usa o Finance, sem nuvem.
select teste.ok(public.my_entitlements()->'entitlements' = '[{"product":"finance","feature":"use"}]'::jsonb, 'grátis: só finance.use');
select teste.ok(public.my_entitlements()->'subscription' = 'null'::jsonb, 'grátis: sem assinatura');
select set_config('request.jwt.claim.sub', '', false);
select teste.ok(public.my_entitlements()->>'code' = 'NOT_AUTHENTICATED', 'sem login: NOT_AUTHENTICATED');
reset role;
set role anon;
select teste.ok(teste.erro('select public.my_entitlements()') = '42501', 'anon não chama my_entitlements');
reset role;

-- ---------- Situações de assinatura (dados montados direto, como o webhook deixaria) ----------
insert into public.subscriptions (user_id, plan_id, status, current_period_end, provider_subscription_id) values
  ('c0000000-0000-4000-8000-000000000002', 'pro_mensal', 'active',   now() + interval '20 days', 'sub_ativo'),
  ('c0000000-0000-4000-8000-000000000003', 'pro_mensal', 'past_due', now() - interval '2 days',  'sub_carencia'),
  ('c0000000-0000-4000-8000-000000000004', 'pro_mensal', 'past_due', now() - interval '6 days',  'sub_vencido'),
  ('c0000000-0000-4000-8000-000000000005', 'pro_anual',  'canceled', now() + interval '3 days',  'sub_cancelado');
insert into public.subscriptions (user_id, plan_id, status, provider_subscription_id) values
  ('c0000000-0000-4000-8000-000000000009', 'pro_mensal', 'pending', 'sub_pendente');
insert into public.entitlement_grants (user_id, product_id, feature, expires_at, reason) values
  ('c0000000-0000-4000-8000-000000000006', 'finance', 'cloud', now() + interval '10 days', 'testador beta');
insert into public.licenses (id, key_hash, customer_name, plan, user_id) values
  ('33333333-0000-4000-8000-000000000003', repeat('c', 64), 'Cliente desktop', 'individual', 'c0000000-0000-4000-8000-000000000007');

select teste.ok(public.has_entitlement('c0000000-0000-4000-8000-000000000001', 'finance', 'cloud') = false, 'grátis sem nuvem');
select teste.ok(public.has_entitlement('c0000000-0000-4000-8000-000000000001', 'finance', 'use'), 'grátis usa o Finance');
select teste.ok(public.has_entitlement(null, 'finance', 'cloud') = false, 'sem conta não tem nuvem');
select teste.ok(public.has_entitlement('c0000000-0000-4000-8000-000000000002', 'finance', 'cloud'), 'ativo tem nuvem');
select teste.ok(public.has_entitlement('c0000000-0000-4000-8000-000000000003', 'finance', 'cloud'), 'atrasado há 2 dias ainda está na carência');
select teste.ok(public.has_entitlement('c0000000-0000-4000-8000-000000000004', 'finance', 'cloud') = false, 'atrasado há 6 dias perdeu a nuvem');
select teste.ok(public.has_entitlement('c0000000-0000-4000-8000-000000000004', 'finance', 'use'), 'quem perde o Pro continua no grátis');
select teste.ok(public.has_entitlement('c0000000-0000-4000-8000-000000000005', 'finance', 'cloud'), 'cancelado mantém até o fim do período pago');
select teste.ok(public.has_entitlement('c0000000-0000-4000-8000-000000000006', 'finance', 'cloud'), 'cortesia libera a nuvem');
select teste.ok(public.has_entitlement('c0000000-0000-4000-8000-000000000007', 'finance', 'cloud'), 'licença desktop vinculada vale como Pro');
select teste.ok(public.vault_entitled('c0000000-0000-4000-8000-000000000007'), 'vault_entitled segue a regra única');
select teste.ok(public.has_entitlement('c0000000-0000-4000-8000-000000000009', 'finance', 'cloud') = false, 'checkout pendente não dá acesso');
select teste.ok(public.has_entitlement('c0000000-0000-4000-8000-000000000002', 'inexistente', 'cloud') = false, 'produto inexistente: nada');

-- Cortesia vencida e licença suspensa deixam de valer.
update public.entitlement_grants set expires_at = now() - interval '1 minute' where user_id = 'c0000000-0000-4000-8000-000000000006';
select teste.ok(public.has_entitlement('c0000000-0000-4000-8000-000000000006', 'finance', 'cloud') = false, 'cortesia vencida não vale');
update public.licenses set status = 'suspended' where id = '33333333-0000-4000-8000-000000000003';
select teste.ok(public.has_entitlement('c0000000-0000-4000-8000-000000000007', 'finance', 'cloud') = false, 'licença suspensa não vale');

-- O cancelado, depois do fim do período, perde a nuvem (sem carência).
update public.subscriptions set current_period_end = now() - interval '1 hour' where provider_subscription_id = 'sub_cancelado';
select teste.ok(public.has_entitlement('c0000000-0000-4000-8000-000000000005', 'finance', 'cloud') = false, 'cancelado sem carência após o período');

-- ---------- Uma assinatura viva por conta ----------
select teste.ok(teste.erro($$insert into public.subscriptions (user_id, plan_id, status) values ('c0000000-0000-4000-8000-000000000002', 'pro_anual', 'pending')$$) = '23505', 'segunda assinatura viva é recusada');

-- ---------- Checkout ----------
set role service_role;
select teste.ok(public.billing_begin_checkout('c0000000-0000-4000-8000-000000000001', 'free')->>'code' = 'PLAN_INVALID', 'grátis não tem checkout');
select teste.ok(public.billing_begin_checkout('c0000000-0000-4000-8000-000000000001', 'nao_existe')->>'code' = 'PLAN_INVALID', 'plano inexistente');
select teste.ok(public.billing_begin_checkout('c0000000-0000-4000-8000-000000000002', 'pro_mensal')->>'code' = 'ALREADY_SUBSCRIBED', 'ativo não assina de novo');
select teste.ok(public.billing_begin_checkout('c0000000-0000-4000-8000-000000000009', 'pro_mensal')->>'provider_subscription_id' = 'sub_pendente', 'checkout pendente é reaproveitado');
select teste.ok(public.billing_begin_checkout('c0000000-0000-4000-8000-000000000009', 'pro_anual')->>'replaced_provider_subscription_id' = 'sub_pendente', 'trocar de plano abandona o pendente');
select teste.ok((public.billing_begin_checkout('c0000000-0000-4000-8000-000000000008', 'pro_mensal')->>'subscription_id') is null, 'conta nova começa do zero');
select public.billing_save_customer('c0000000-0000-4000-8000-000000000008', 'cus_webhook');
select public.billing_save_customer('c0000000-0000-4000-8000-000000000008', 'cus_outro');
select teste.ok(public.billing_begin_checkout('c0000000-0000-4000-8000-000000000008', 'pro_mensal')->>'customer_id' = 'cus_webhook', 'cliente do gateway é reaproveitado');
select teste.ok((public.billing_save_subscription('c0000000-0000-4000-8000-000000000008', 'pro_mensal', 'sub_webhook', 'https://pagar/1')->>'ok')::boolean, 'salva a assinatura criada');
select teste.ok(public.billing_save_subscription('c0000000-0000-4000-8000-000000000008', 'pro_mensal', 'sub_webhook_2', 'https://pagar/2')->>'code' = 'CONCURRENT_CHECKOUT', 'clique duplo não cria duas');

-- ---------- Webhook ----------
select teste.ok(public.billing_apply_event('evt_1', 'PAYMENT_CREATED', 'sub_webhook', current_date, '{}')->>'outcome' = 'ignored_event', 'evento sem efeito é registrado e ignorado');
select teste.ok(public.has_entitlement('c0000000-0000-4000-8000-000000000008', 'finance', 'cloud') = false, 'antes do pagamento, sem nuvem');
select teste.ok(public.billing_apply_event('evt_2', 'PAYMENT_CONFIRMED', 'sub_webhook', current_date, '{}')->>'outcome' = 'period_extended', 'pagamento confirmado libera');
select teste.ok(public.has_entitlement('c0000000-0000-4000-8000-000000000008', 'finance', 'cloud'), 'depois do pagamento, com nuvem');
select teste.ok(public.billing_apply_event('evt_2', 'PAYMENT_CONFIRMED', 'sub_webhook', current_date, '{}')->>'outcome' = 'duplicate', 'mesmo evento duas vezes é ignorado');
select teste.ok(public.billing_apply_event('evt_3', 'PAYMENT_RECEIVED', 'sub_webhook', current_date, '{}')->>'outcome' = 'period_extended', 'RECEIVED do mesmo pagamento não soma outro mês');
select teste.ok((select current_period_end from public.subscriptions where provider_subscription_id = 'sub_webhook') = (current_date + interval '1 month')::timestamptz, 'período = vencimento + 1 mês');
-- Renovação do mês seguinte estende; aviso antigo atrasado não encurta.
select public.billing_apply_event('evt_4', 'PAYMENT_CONFIRMED', 'sub_webhook', (current_date + interval '1 month')::date, '{}');
select teste.ok((select current_period_end from public.subscriptions where provider_subscription_id = 'sub_webhook') = (current_date + interval '2 months')::timestamptz, 'renovação estende o período');
select public.billing_apply_event('evt_5', 'PAYMENT_CONFIRMED', 'sub_webhook', current_date, '{}');
select teste.ok((select current_period_end from public.subscriptions where provider_subscription_id = 'sub_webhook') = (current_date + interval '2 months')::timestamptz, 'aviso fora de ordem não encurta');
select teste.ok(public.billing_apply_event('evt_6', 'PAYMENT_OVERDUE', 'sub_webhook', current_date, '{}')->>'outcome' = 'past_due', 'atraso marca past_due');
select teste.ok((select status from public.subscriptions where provider_subscription_id = 'sub_webhook') = 'past_due', 'status past_due');
select public.billing_apply_event('evt_7', 'PAYMENT_CONFIRMED', 'sub_webhook', (current_date + interval '2 months')::date, '{}');
select teste.ok((select status from public.subscriptions where provider_subscription_id = 'sub_webhook') = 'active', 'pagar o atrasado reativa');
select teste.ok(public.billing_apply_event('evt_8', 'PAYMENT_CONFIRMED', 'sub_desconhecida', current_date, '{}')->>'outcome' = 'ignored_unknown_subscription', 'assinatura desconhecida é ignorada');
select teste.ok(public.billing_apply_event('evt_9', 'PAYMENT_CONFIRMED', null, current_date, '{}')->>'outcome' = 'ignored_no_subscription', 'cobrança avulsa é ignorada');
select teste.ok(public.billing_apply_event('evt_10', 'SUBSCRIPTION_DELETED', 'sub_webhook', null, '{}')->>'outcome' = 'canceled', 'cancelamento no gateway');
select teste.ok(public.has_entitlement('c0000000-0000-4000-8000-000000000008', 'finance', 'cloud'), 'cancelado mantém o que já pagou');
select teste.ok(public.billing_apply_event('evt_11', 'PAYMENT_REFUNDED', 'sub_webhook', current_date, '{}')->>'outcome' = 'revoked', 'estorno revoga');
select teste.ok(public.has_entitlement('c0000000-0000-4000-8000-000000000008', 'finance', 'cloud') = false, 'depois do estorno, sem nuvem');
select teste.ok(public.has_entitlement('c0000000-0000-4000-8000-000000000008', 'finance', 'use'), 'estorno não tira o grátis');
select teste.ok((select count(*) from public.payment_events) = 11, 'todo evento fica registrado');
reset role;

-- Cancelada, a conta pode assinar de novo.
set role service_role;
select teste.ok((public.billing_begin_checkout('c0000000-0000-4000-8000-000000000008', 'pro_anual')->>'ok')::boolean, 'pode assinar de novo depois de cancelar');
reset role;

\echo 'billing: todos os testes passaram'
