-- Testes de pedidos de orçamento (202610050007_quote_requests.sql).
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
grant select on public.quote_requests to service_role;

set role anon;
select teste.ok(teste.erro($$select public.request_quote('Ana', 'a@b.co', null, null, 'web', null, repeat('x', 30), 'h')$$) = '42501', 'anon não chama direto');
select teste.ok(teste.erro($$select * from public.quote_requests$$) = '42501', 'anon não lê pedidos');
reset role;

set role service_role;
select teste.ok((public.request_quote('  Ana  ', ' Ana@Empresa.COM ', ' ', 'ACME', 'web', 'ate_5k', '  Preciso de um painel para controlar pedidos.  ', 'origem-1')->>'ok')::boolean, 'pedido válido');
select teste.ok((select name = 'Ana' and email = 'ana@empresa.com' and phone is null and company = 'ACME' and description = 'Preciso de um painel para controlar pedidos.' from public.quote_requests limit 1), 'normalizado');
select teste.ok(public.request_quote('Ana', 'sem-arroba', null, null, 'web', null, repeat('x', 30), 'origem-1')->>'code' = 'EMAIL_INVALID', 'e-mail inválido');
select teste.ok(teste.erro($$select public.request_quote('Ana', 'a@b.co', null, null, 'nave-espacial', null, repeat('x', 30), 'o')$$) = '23514', 'tipo fora da lista');
select teste.ok(teste.erro($$select public.request_quote('Ana', 'a@b.co', null, null, 'web', null, 'curto', 'o')$$) = '23514', 'descrição curta');
-- Limite por origem: 3 por hora.
select public.request_quote('Ana', 'a@b.co', null, null, 'site', null, repeat('x', 30), 'origem-1');
select public.request_quote('Ana', 'a@b.co', null, null, 'site', null, repeat('x', 30), 'origem-1');
select teste.ok(public.request_quote('Ana', 'a@b.co', null, null, 'site', null, repeat('x', 30), 'origem-1')->>'code' = 'REQUEST_RATE_LIMIT', '4º pedido da mesma origem');
select teste.ok((public.request_quote('Bia', 'b@b.co', null, null, 'site', null, repeat('x', 30), 'origem-2')->>'ok')::boolean, 'outra origem passa');
-- Limite global: 50 por hora.
reset role;
insert into public.quote_requests (name, email, project_type, description, client_hash)
  select 'Lote', 'l@b.co', 'outro', repeat('x', 30), 'lote-' || g from generate_series(1, 46) g;
set role service_role;
select teste.ok(public.request_quote('Caio', 'c@b.co', null, null, 'site', null, repeat('x', 30), 'origem-3')->>'code' = 'REQUEST_RATE_LIMIT', 'teto global');
reset role;

\echo 'quote_requests: todos os testes passaram'
