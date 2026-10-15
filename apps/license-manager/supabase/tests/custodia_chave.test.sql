-- Testes de 202610150003_custodia_chave.sql: custódia da chave dos dados pelo servidor.
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

insert into auth.users (id, email) values ('aaaaaaaa-3333-4000-8000-000000000001', 'cust-a@teste.com');
insert into public.entitlement_grants (user_id, product_id, feature, reason) values ('aaaaaaaa-3333-4000-8000-000000000001', 'finance', 'cloud', 'teste');
insert into public.vault_accounts (user_id, key_params, wrapped_key, recovery_wrapped_key) values
  ('aaaaaaaa-3333-4000-8000-000000000001', '{"v":3,"kid":"kid-1"}', repeat('c', 32), repeat('c', 32));

-- O aplicativo (anon/authenticated) não chama as funções de custódia nem vê a coluna.
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-3333-4000-8000-000000000001', false);
select teste.ok(teste.erro('select public.vault_custody_get(''aaaaaaaa-3333-4000-8000-000000000001'')') = '42501', 'authenticated não lê a custódia');
select teste.ok(teste.erro('select public.vault_custody_set(''aaaaaaaa-3333-4000-8000-000000000001'', repeat(''w'',60), ''kid-1'')') = '42501', 'authenticated não grava a custódia');
select teste.ok(not (public.vault_status() ? 'server_wrapped_key'), 'vault_status não expõe a custódia');
reset role;
set role anon;
select teste.ok(teste.erro('select public.vault_custody_get(''aaaaaaaa-3333-4000-8000-000000000001'')') = '42501', 'anon não lê a custódia');
reset role;

set role service_role;
select teste.ok((public.vault_custody_get('cccccccc-3333-4000-8000-000000000009')->>'exists')::boolean = false, 'conta sem nuvem');
select teste.ok(public.vault_custody_get('aaaaaaaa-3333-4000-8000-000000000001')->>'wrapped' is null, 'ainda sem custódia');
select teste.ok(public.vault_custody_set('aaaaaaaa-3333-4000-8000-000000000001', repeat('w', 60), 'kid-velho')->>'code' = 'KID_MISMATCH', 'chave de outra geração é recusada');
select teste.ok((public.vault_custody_set('aaaaaaaa-3333-4000-8000-000000000001', repeat('w', 60), 'kid-1')->>'stored')::boolean, 'guarda a chave atual');
select teste.ok((public.vault_custody_set('aaaaaaaa-3333-4000-8000-000000000001', repeat('x', 60), 'kid-1')->>'stored')::boolean = false, 'não troca uma custódia que já vale');
select teste.ok(public.vault_custody_get('aaaaaaaa-3333-4000-8000-000000000001')->>'wrapped' = repeat('w', 60), 'custódia intacta');
select teste.ok(public.vault_custody_get('aaaaaaaa-3333-4000-8000-000000000001')->>'wrapped_kid' = 'kid-1', 'custódia da chave atual');
reset role;

-- Troca de chave limpa a custódia
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-3333-4000-8000-000000000001', false);
select teste.ok((public.vault_rotate(1, '{"v":3,"kid":"kid-2"}', repeat('c', 32), repeat('c', 32))->>'ok')::boolean, 'troca a chave');
reset role;
set role service_role;
select teste.ok(public.vault_custody_get('aaaaaaaa-3333-4000-8000-000000000001')->>'wrapped' is null, 'custódia antiga apagada na troca');
select teste.ok(public.vault_custody_get('aaaaaaaa-3333-4000-8000-000000000001')->>'kid' = 'kid-2', 'kid novo');
select teste.ok((public.vault_custody_set('aaaaaaaa-3333-4000-8000-000000000001', repeat('y', 60), 'kid-2')->>'stored')::boolean, 'guarda a chave nova');
reset role;

\echo 'custodia_chave: todos os testes passaram'
