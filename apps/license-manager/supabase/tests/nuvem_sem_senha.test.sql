-- Testes de 202610150002_nuvem_sem_senha.sql: troca de chave (vault_rotate) e envio com versão.
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
  ('aaaaaaaa-2222-4000-8000-000000000001', 'rot-a@teste.com'),
  ('bbbbbbbb-2222-4000-8000-000000000002', 'rot-b@teste.com');
-- A tem Pro; B tem cofre mas não tem Pro
insert into public.entitlement_grants (user_id, product_id, feature, reason) values ('aaaaaaaa-2222-4000-8000-000000000001', 'finance', 'cloud', 'teste');
insert into public.vault_accounts (user_id, key_params, wrapped_key, recovery_wrapped_key) values
  ('aaaaaaaa-2222-4000-8000-000000000001', '{"v":1}', repeat('k', 32), repeat('r', 32)),
  ('bbbbbbbb-2222-4000-8000-000000000002', '{"v":1}', repeat('k', 32), repeat('r', 32));

set role anon;
select teste.ok(teste.erro('select public.vault_rotate(1, ''{}'', repeat(''k'',32), repeat(''r'',32))') = '42501', 'anon não troca a chave');
select teste.ok(teste.erro('select public.vault_push(''[]''::jsonb, 1)') = '42501', 'anon não envia');
reset role;

set role authenticated;
-- ---------- B sem Pro não esvazia a nuvem ----------
select set_config('request.jwt.claim.sub', 'bbbbbbbb-2222-4000-8000-000000000002', false);
select teste.ok(public.vault_rotate(1, '{"v":2}', repeat('n', 32), repeat('m', 32))->>'code' = 'NOT_ENTITLED', 'sem Pro não troca a chave');

-- ---------- A: envia, troca a chave, aparelho antigo é barrado ----------
select set_config('request.jwt.claim.sub', 'aaaaaaaa-2222-4000-8000-000000000001', false);
select teste.ok((public.vault_push('[{"id":"item-antigo-1","ct":"xxxxxxxxxxxxxxxx"},{"id":"item-antigo-2","ct":"yyyyyyyyyyyyyyyy"}]'::jsonb, 1)->>'ok')::boolean, 'envio com a versão certa grava');
select teste.ok((public.vault_status()->>'item_count')::int = 2, '2 itens na nuvem');
select teste.ok(public.vault_rotate(1, 'null'::jsonb, repeat('n', 32), repeat('m', 32))->>'code' = 'INVALID_INPUT', 'parâmetros inválidos');
select teste.ok(public.vault_rotate(1, '{"v":2}', 'curta', repeat('m', 32))->>'code' = 'INVALID_INPUT', 'chave embrulhada curta');
select teste.ok((public.vault_rotate(1, '{"v":2}', repeat('n', 32), repeat('m', 32))->>'key_version')::int = 2, 'troca a chave: versão 2');
select teste.ok((public.vault_status()->>'item_count')::int = 0, 'nuvem esvaziada para o reenvio');
select teste.ok(public.vault_status()->>'wrapped_key' = repeat('n', 32), 'chave nova gravada');
select teste.ok(public.vault_pull(0, 100)->'items' = '[]'::jsonb, 'nada antigo para baixar');
select teste.ok((public.vault_pull(0, 100)->>'has_more')::boolean = false, 'baixar desde o início termina (sem laço infinito)');
select teste.ok(public.vault_push('[{"id":"item-antigo-1","ct":"zzzzzzzzzzzzzzzz"}]'::jsonb, 1)->>'code' = 'KEY_CHANGED', 'aparelho com a chave antiga não grava');
select teste.ok((public.vault_status()->>'item_count')::int = 0, 'nada foi gravado pela chave antiga');
select teste.ok((public.vault_push('[{"id":"item-novo-1","ct":"wwwwwwwwwwwwwwww"}]'::jsonb, 2)->>'ok')::boolean, 'chave nova grava');
select teste.ok(public.vault_rotate(1, '{"v":3}', repeat('n', 32), repeat('m', 32))->>'code' = 'KEY_VERSION_CONFLICT', 'troca concorrente com versão velha é recusada');

-- ---------- B não é afetado pela troca de A ----------
select set_config('request.jwt.claim.sub', 'bbbbbbbb-2222-4000-8000-000000000002', false);
select teste.ok((public.vault_status()->>'key_version')::int = 1, 'B continua na versão 1');
select teste.ok(public.vault_status()->>'wrapped_key' = repeat('k', 32), 'chave de B intacta');
reset role;

\echo 'nuvem_sem_senha: todos os testes passaram'
