-- Testes de 202610150001_aparelho_aprovado.sql: liberar aparelho novo aprovando em outro aparelho.
-- Rodar com scripts/test-migrations.sh.
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

insert into auth.users (id, email) values
  ('aaaaaaaa-1111-4000-8000-000000000001', 'link-a@teste.com'),
  ('bbbbbbbb-1111-4000-8000-000000000002', 'link-b@teste.com'),
  ('cccccccc-1111-4000-8000-000000000003', 'link-c@teste.com');
-- A e B têm cofre; C não.
insert into public.vault_accounts (user_id, key_params, wrapped_key, recovery_wrapped_key) values
  ('aaaaaaaa-1111-4000-8000-000000000001', '{"salt":"x"}', repeat('k', 32), repeat('r', 32)),
  ('bbbbbbbb-1111-4000-8000-000000000002', '{"salt":"x"}', repeat('k', 32), repeat('r', 32));

create temp table t_ids (nome text primary key, id uuid);
grant all on t_ids to authenticated;

-- ---------- Sem login ----------
set role anon;
select teste.ok(teste.erro('select public.vault_link_request(''x'', ''y'', ''z'')') = '42501', 'anon não pede');
select teste.ok(teste.erro('select public.vault_link_pending()') = '42501', 'anon não lista');
select teste.ok(teste.erro('select public.vault_link_approve(gen_random_uuid(), ''x'')') = '42501', 'anon não aprova');
select teste.ok(teste.erro('select public.vault_link_take(gen_random_uuid())') = '42501', 'anon não busca');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '', false);
select teste.ok(public.vault_link_pending()->>'code' = 'NOT_AUTHENTICATED', 'sem sub: NOT_AUTHENTICATED');
select teste.ok(teste.erro('select * from public.vault_device_links') = '42501', 'authenticated não lê a tabela');

-- ---------- Conta sem cofre ----------
select set_config('request.jwt.claim.sub', 'cccccccc-1111-4000-8000-000000000003', false);
select teste.ok(public.vault_link_request(repeat('P', 88), repeat('T', 44), 'iPhone')->>'code' = 'VAULT_NOT_FOUND', 'sem cofre não pede');

-- ---------- Conta A: pedido, pendentes, aprovação e entrega única ----------
select set_config('request.jwt.claim.sub', 'aaaaaaaa-1111-4000-8000-000000000001', false);
select teste.ok(public.vault_link_request('ruim com espaço', repeat('T', 44), 'x')->>'code' = 'INVALID', 'chave pública inválida');
insert into t_ids select 'a1', (public.vault_link_request(repeat('P', 88), repeat('T', 44), 'iPhone · Safari <script>')->>'id')::uuid;
select teste.ok((select id from t_ids where nome = 'a1') is not null, 'A abriu um pedido');
select teste.ok(jsonb_array_length(public.vault_link_pending()->'items') = 1, 'A vê 1 pendente');
select teste.ok(public.vault_link_pending()->'items'->0->>'label' = 'iPhone · Safari script', 'etiqueta limpa (sem < >)');
select teste.ok(public.vault_link_pending()->'items'->0->>'device_tag' = repeat('T', 44), 'pendente traz a etiqueta do código');
select teste.ok((public.vault_link_take((select id from t_ids where nome = 'a1'))->>'pending')::boolean, 'antes da aprovação: ainda esperando');

-- ---------- Conta B não enxerga nem mexe no pedido de A ----------
select set_config('request.jwt.claim.sub', 'bbbbbbbb-1111-4000-8000-000000000002', false);
select teste.ok(jsonb_array_length(public.vault_link_pending()->'items') = 0, 'B não vê o pedido de A');
select teste.ok(public.vault_link_approve((select id from t_ids where nome = 'a1'), repeat('S', 200))->>'code' = 'NOT_FOUND', 'B não aprova o pedido de A');
select teste.ok(public.vault_link_take((select id from t_ids where nome = 'a1'))->>'code' = 'NOT_FOUND', 'B não busca o pedido de A');
select public.vault_link_cancel((select id from t_ids where nome = 'a1'));
select set_config('request.jwt.claim.sub', 'aaaaaaaa-1111-4000-8000-000000000001', false);
select teste.ok(jsonb_array_length(public.vault_link_pending()->'items') = 1, 'cancelar de B não apaga o pedido de A');

-- A aprova; segunda aprovação falha; o pacote é entregue uma vez só
select teste.ok(public.vault_link_approve((select id from t_ids where nome = 'a1'), 'curto')->>'code' = 'INVALID', 'pacote vazio não serve');
select teste.ok((public.vault_link_approve((select id from t_ids where nome = 'a1'), repeat('S', 200))->>'ok')::boolean, 'A aprova');
select teste.ok(public.vault_link_approve((select id from t_ids where nome = 'a1'), repeat('Z', 200))->>'code' = 'NOT_FOUND', 'não aprova duas vezes');
select teste.ok(jsonb_array_length(public.vault_link_pending()->'items') = 0, 'aprovado sai dos pendentes');
select teste.ok(public.vault_link_take((select id from t_ids where nome = 'a1'))->>'sealed' = repeat('S', 200), 'aparelho novo recebe o pacote');
select teste.ok(public.vault_link_take((select id from t_ids where nome = 'a1'))->>'code' = 'NOT_FOUND', 'o pacote só é entregue uma vez');

-- ---------- Vencimento ----------
insert into t_ids select 'a2', (public.vault_link_request(repeat('Q', 88), repeat('T', 44), 'Android')->>'id')::uuid;
reset role;
update public.vault_device_links set expires_at = now() - interval '1 second' where id = (select id from t_ids where nome = 'a2');
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-1111-4000-8000-000000000001', false);
select teste.ok(jsonb_array_length(public.vault_link_pending()->'items') = 0, 'vencido não aparece');
select teste.ok(public.vault_link_approve((select id from t_ids where nome = 'a2'), repeat('S', 200))->>'code' = 'NOT_FOUND', 'vencido não é aprovado');
select teste.ok(public.vault_link_take((select id from t_ids where nome = 'a2'))->>'code' = 'EXPIRED', 'aparelho novo fica sabendo que venceu');

-- ---------- Limite de 5 pedidos em aberto ----------
select public.vault_link_request(repeat('R', 88), repeat('T', 44), 'x') from generate_series(1, 5);
select teste.ok(public.vault_link_request(repeat('R', 88), repeat('T', 44), 'x')->>'code' = 'TOO_MANY', 'sexto pedido em aberto é recusado');
reset role;
select teste.ok((select count(*) from public.vault_device_links where user_id = 'aaaaaaaa-1111-4000-8000-000000000001') = 5, 'só 5 ficaram gravados');

-- Apagar a conta apaga os pedidos
delete from auth.users where id = 'aaaaaaaa-1111-4000-8000-000000000001';
select teste.ok((select count(*) from public.vault_device_links where user_id = 'aaaaaaaa-1111-4000-8000-000000000001') = 0, 'pedidos saem com a conta');

\echo 'aparelho_aprovado: todos os testes passaram'
