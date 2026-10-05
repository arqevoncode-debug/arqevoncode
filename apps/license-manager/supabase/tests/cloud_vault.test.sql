-- Testes do cofre na nuvem (202610050001_cloud_vault.sql).
-- Rodar com scripts/test-migrations.sh: aplica o stub do Supabase, todas as migrações e este arquivo.
\set ON_ERROR_STOP on

create schema if not exists teste;
create or replace function teste.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then raise exception 'FALHOU: %', p_msg; end if;
end;
$$;
-- Executa o SQL e devolve o SQLSTATE do erro, ou null se não houve erro.
create or replace function teste.erro(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql; return null;
exception when others then return sqlstate;
end;
$$;
grant usage on schema teste to anon, authenticated, service_role;
grant execute on all functions in schema teste to anon, authenticated, service_role;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'a@teste.com'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'b@teste.com');
insert into public.licenses (id, key_hash, customer_name, plan) values
  ('11111111-0000-4000-8000-000000000001', repeat('a', 64), 'Cliente A', 'individual'),
  ('22222222-0000-4000-8000-000000000002', repeat('b', 64), 'Cliente B', 'individual');

-- ---------- Sem login ----------
set role anon;
select teste.ok(teste.erro('select public.vault_push(''[]''::jsonb)') = '42501', 'anon não executa vault_push');
select teste.ok(teste.erro('select public.vault_status()') = '42501', 'anon não executa vault_status');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '', false);
select teste.ok(public.vault_status()->>'code' = 'NOT_AUTHENTICATED', 'sem sub: NOT_AUTHENTICATED');

-- ---------- Conta A sem licença ----------
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
select teste.ok((public.vault_status()->>'entitled')::boolean = false, 'A sem licença não tem direito');
select teste.ok((public.vault_status()->>'exists')::boolean = false, 'A ainda não tem cofre');
select teste.ok(public.vault_create('{"salt":"x"}', repeat('k', 32), repeat('r', 32))->>'code' = 'NOT_ENTITLED', 'criar cofre exige assinatura');

-- O cliente nunca toca as tabelas nem a função de vínculo.
select teste.ok(teste.erro('select * from public.vault_items') = '42501', 'authenticated não lê vault_items');
select teste.ok(teste.erro('select * from public.vault_accounts') = '42501', 'authenticated não lê vault_accounts');
select teste.ok(teste.erro('select * from public.licenses') = '42501', 'authenticated não lê licenses');
select teste.ok(teste.erro('select public.link_license_to_user(''11111111-0000-4000-8000-000000000001'', auth.uid())') = '42501', 'authenticated não vincula licença');
select teste.ok(teste.erro('select public.vault_entitled(auth.uid())') = '42501', 'authenticated não chama vault_entitled');
reset role;

-- ---------- Vínculo (service_role, via license-manager) ----------
set role service_role;
select teste.ok((public.link_license_to_user('11111111-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001')->>'ok')::boolean, 'vincula licença à conta A');
select teste.ok((public.link_license_to_user('11111111-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001')->>'ok')::boolean, 'vincular de novo à mesma conta é idempotente');
select teste.ok(public.link_license_to_user('11111111-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002')->>'code' = 'LICENSE_LINKED_ELSEWHERE', 'licença de A não vai para B');
select teste.ok(public.link_license_to_user('99999999-0000-4000-8000-000000000009', 'bbbbbbbb-0000-4000-8000-000000000002')->>'code' = 'LICENSE_NOT_FOUND', 'licença inexistente');
reset role;

-- ---------- Criação e envio ----------
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
select teste.ok((public.vault_status()->>'entitled')::boolean, 'A passa a ter direito');
select teste.ok((public.vault_create('{"salt":"x","iter":600000}', repeat('k', 32), repeat('r', 32))->>'ok')::boolean, 'cria cofre de A');
select teste.ok(public.vault_create('{"salt":"y"}', repeat('k', 32), repeat('r', 32))->>'code' = 'VAULT_EXISTS', 'segundo cofre é recusado');
select teste.ok(public.vault_create('"texto"', repeat('k', 32), repeat('r', 32))->>'code' = 'INVALID_INPUT', 'parâmetros de chave precisam ser objeto');

select teste.ok(public.vault_push('[{"id":"item0001","ct":"aaaa"},{"id":"item0002","ct":"bbbbbb"},{"id":"item0003","ct":"cc"}]')
  = '{"ok": true, "from_rev": 0, "last_rev": 3}'::jsonb, 'primeiro lote recebe revs 1 a 3');
select teste.ok((public.vault_status()->>'item_count')::int = 3 and (public.vault_status()->>'total_bytes')::int = 12, 'cotas após o 1º lote');

select teste.ok(jsonb_array_length(public.vault_pull(0)->'items') = 3, 'pull desde 0 traz 3 itens');
select teste.ok(public.vault_pull(2)->'items' = '[{"id":"item0003","rev":3,"ct":"cc","deleted":false}]'::jsonb, 'pull desde 2 traz só o item 3');
select teste.ok((public.vault_pull(3)->>'until')::int = 3 and jsonb_array_length(public.vault_pull(3)->'items') = 0, 'nada novo depois de 3');

-- Atualiza um item, exclui outro e cria um terceiro.
select teste.ok((public.vault_push('[{"id":"item0001","ct":"aaaaaaaaaa"},{"id":"item0002","deleted":true},{"id":"item0004","ct":"dd"}]')->>'last_rev')::int = 6, 'segundo lote vai até o rev 6');
select teste.ok((public.vault_status()->>'item_count')::int = 3, 'contagem: 3 vivos (1, 3 e 4)');
select teste.ok((public.vault_status()->>'total_bytes')::int = 14, 'bytes: 10 + 2 + 2');
select teste.ok(public.vault_pull(3)->'items' = '[{"id":"item0001","rev":4,"ct":"aaaaaaaaaa","deleted":false},{"id":"item0002","rev":5,"ct":null,"deleted":true},{"id":"item0004","rev":6,"ct":"dd","deleted":false}]'::jsonb, 'pull traz edição, exclusão e criação em ordem');
-- Excluir de novo algo já excluído não muda as cotas.
select public.vault_push('[{"id":"item0002","deleted":true}]');
select teste.ok((public.vault_status()->>'item_count')::int = 3 and (public.vault_status()->>'total_bytes')::int = 14, 're-exclusão não altera cotas');
-- Recriar um item excluído volta a contar.
select public.vault_push('[{"id":"item0002","ct":"zz","deleted":false}]');
select teste.ok((public.vault_status()->>'item_count')::int = 4 and (public.vault_status()->>'total_bytes')::int = 16, 'recriar item volta a contar');

-- Paginação.
select teste.ok((public.vault_pull(0, 2)->>'has_more')::boolean and (public.vault_pull(0, 2)->>'until')::int = 4, 'página 1 de 2 itens (revs 3 e 4)');
select teste.ok(not (public.vault_pull(6, 2)->>'has_more')::boolean, 'última página sem has_more');
select teste.ok(public.vault_push('[]') = '{"ok": true, "from_rev": 8, "last_rev": 8}'::jsonb, 'lote vazio não muda nada');

-- Validação de entrada: nada é gravado quando o lote é inválido.
select teste.ok(public.vault_push('{"id":"item0001"}')->>'code' = 'INVALID_INPUT', 'lote precisa ser array');
select teste.ok(public.vault_push('[{"ct":"aa"}]')->>'code' = 'INVALID_INPUT', 'item sem id');
select teste.ok(public.vault_push('[{"id":"curto","ct":"aa"}]')->>'code' = 'INVALID_INPUT', 'id curto');
select teste.ok(public.vault_push('[{"id":"item/0001","ct":"aa"}]')->>'code' = 'INVALID_INPUT', 'id com caractere proibido');
select teste.ok(public.vault_push('[{"id":"item0001"}]')->>'code' = 'INVALID_INPUT', 'item vivo sem ct');
select teste.ok(public.vault_push('[{"id":"item0001","ct":""}]')->>'code' = 'INVALID_INPUT', 'ct vazio');
select teste.ok(public.vault_push('[{"id":"item0001","ct":123}]')->>'code' = 'INVALID_INPUT', 'ct não textual');
select teste.ok(public.vault_push('[{"id":"item0001","ct":"aa","deleted":"sim"}]')->>'code' = 'INVALID_INPUT', 'deleted não booleano');
select teste.ok(public.vault_push('["texto"]')->>'code' = 'INVALID_INPUT', 'item que não é objeto');
select teste.ok(public.vault_push(jsonb_build_array(jsonb_build_object('id', 'item0001', 'ct', repeat('x', 65537))))->>'code' = 'INVALID_INPUT', 'item acima de 64 KB');
select teste.ok(public.vault_push('[{"id":"item0001","ct":"aa"},{"id":"item0001","ct":"bb"}]')->>'code' = 'DUPLICATE_ITEM', 'id repetido no lote');
select teste.ok(public.vault_push((select jsonb_agg(jsonb_build_object('id', 'item' || lpad(g::text, 6, '0'), 'ct', 'x')) from generate_series(1, 501) g))->>'code' = 'BATCH_TOO_LARGE', 'mais de 500 itens');
select teste.ok((public.vault_status()->>'last_rev')::int = 8, 'lotes recusados não consumiram revs');
-- Um item excluído pode vir com ct: o conteúdo é descartado.
select public.vault_push('[{"id":"item0003","deleted":true,"ct":"lixo"}]');
select teste.ok(public.vault_pull(8)->'items'->0->'ct' = 'null'::jsonb, 'exclusão descarta o ct');
reset role;

-- ---------- Isolamento: B não vê nem altera nada de A ----------
set role service_role;
select public.link_license_to_user('22222222-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000000002', false);
select teste.ok(public.vault_pull(0)->>'code' = 'VAULT_NOT_FOUND', 'B não tem cofre');
select teste.ok(public.vault_push('[{"id":"item0001","ct":"invasor"}]')->>'code' = 'VAULT_NOT_FOUND', 'B não grava sem cofre');
select teste.ok((public.vault_status()->>'exists')::boolean = false and public.vault_status()->'wrapped_key' = 'null'::jsonb, 'B não recebe chaves de A');
select public.vault_create('{"salt":"b"}', repeat('k', 32), repeat('r', 32));
select public.vault_push('[{"id":"item0001","ct":"dados-de-b"}]');
select teste.ok((public.vault_pull(0)->'items') = '[{"id":"item0001","rev":1,"ct":"dados-de-b","deleted":false}]'::jsonb, 'B tem sequência própria e o mesmo id não colide com A');
select public.vault_delete();
reset role;
select teste.ok((select ciphertext from public.vault_items where user_id = 'aaaaaaaa-0000-4000-8000-000000000001' and item_id = 'item0001') = 'aaaaaaaaaa', 'item de A intacto');

-- ---------- Troca de senha ----------
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
select teste.ok((public.vault_rekey(1, '{"salt":"novo"}', repeat('n', 32), repeat('r', 32))->>'key_version')::int = 2, 'rekey sobe a versão');
select teste.ok(public.vault_rekey(1, '{"salt":"outro"}', repeat('o', 32), repeat('r', 32))->>'code' = 'KEY_VERSION_CONFLICT', 'rekey com versão antiga é recusado');
select teste.ok(public.vault_status()->>'wrapped_key' = repeat('n', 32) and (public.vault_pull(0)->>'key_version')::int = 2, 'chave nova visível no status e no pull');
select teste.ok(teste.erro($$select public.vault_rekey(2, '{}', 'curta', repeat('r', 32))$$) = '23514', 'chave embrulhada curta viola a check');
reset role;

-- ---------- Assinatura vencida: lê, apaga e troca senha; não grava ----------
update public.licenses set expires_at = now() - interval '1 day' where id = '11111111-0000-4000-8000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false);
select teste.ok((public.vault_status()->>'entitled')::boolean = false, 'vencida: sem direito');
select teste.ok(public.vault_push('[{"id":"item0009","ct":"x"}]')->>'code' = 'NOT_ENTITLED', 'vencida: não grava');
select teste.ok((public.vault_pull(0)->>'ok')::boolean, 'vencida: ainda baixa os dados');
select teste.ok((public.vault_rekey(2, '{"salt":"v"}', repeat('v', 32), repeat('r', 32))->>'ok')::boolean, 'vencida: ainda troca a senha');
reset role;
update public.licenses set status = 'suspended', expires_at = null where id = '11111111-0000-4000-8000-000000000001';
set role authenticated;
select teste.ok(public.vault_push('[{"id":"item0009","ct":"x"}]')->>'code' = 'NOT_ENTITLED', 'suspensa: não grava');

-- ---------- Exclusão (LGPD) ----------
select teste.ok((public.vault_delete()->>'deleted')::boolean, 'apaga o cofre de A');
select teste.ok((public.vault_delete()->>'deleted')::boolean = false, 'apagar de novo não falha');
reset role;
select teste.ok(not exists (select 1 from public.vault_items where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'), 'itens de A foram junto');

-- Excluir o usuário no Auth leva o cofre e solta a licença.
set role service_role;
select public.link_license_to_user('22222222-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002');
reset role;
delete from auth.users where id = 'bbbbbbbb-0000-4000-8000-000000000002';
select teste.ok((select user_id from public.licenses where id = '22222222-0000-4000-8000-000000000002') is null, 'licença fica sem conta ao excluir o usuário');

\echo 'cloud_vault: todos os testes passaram'
