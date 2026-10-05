-- Pedidos de orçamento de software sob encomenda, feitos pelo site.
-- O site não tem banco: o formulário chama a API do license-manager, que grava aqui e avisa o
-- dono por e-mail. A tabela é a garantia de que nenhum pedido se perde se o e-mail falhar.

create table if not exists public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  email text not null check (char_length(email) between 5 and 200),
  phone text check (char_length(phone) <= 40),
  company text check (char_length(company) <= 120),
  project_type text not null check (project_type in ('web', 'desktop', 'mobile', 'integracao', 'site', 'outro')),
  budget text check (budget in ('nao_sei', 'ate_5k', '5k_15k', '15k_50k', 'acima_50k')),
  description text not null check (char_length(description) between 20 and 3000),
  status text not null default 'novo' check (status in ('novo', 'respondido', 'arquivado')),
  -- HMAC do IP, nunca o endereço em texto puro. Serve apenas para conter abuso.
  client_hash text,
  created_at timestamptz not null default now()
);

create index if not exists quote_requests_recentes on public.quote_requests (created_at desc);
create index if not exists quote_requests_origem on public.quote_requests (client_hash, created_at desc);

alter table public.quote_requests enable row level security;
revoke all on public.quote_requests from anon, authenticated;

-- Endpoint público e sem autenticação: o freio vive aqui. No máximo 3 pedidos por origem por
-- hora, e no máximo 50 por hora no total, para um ataque distribuído não lotar a tabela nem a
-- caixa de e-mail.
create or replace function public.request_quote(
  p_name text, p_email text, p_phone text, p_company text,
  p_project_type text, p_budget text, p_description text, p_client_hash text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(p_email));
  v_id uuid;
begin
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok', false, 'code', 'EMAIL_INVALID', 'message', 'Informe um e-mail válido.');
  end if;
  if p_client_hash is not null and (
    select count(*) from public.quote_requests
    where client_hash = p_client_hash and created_at >= now() - interval '1 hour'
  ) >= 3 then
    return jsonb_build_object('ok', false, 'code', 'REQUEST_RATE_LIMIT', 'message', 'Muitos pedidos em pouco tempo. Tente novamente mais tarde.');
  end if;
  if (select count(*) from public.quote_requests where created_at >= now() - interval '1 hour') >= 50 then
    return jsonb_build_object('ok', false, 'code', 'REQUEST_RATE_LIMIT', 'message', 'Recebemos muitos pedidos agora. Tente novamente mais tarde ou escreva para contato@arqevoncode.com.br.');
  end if;

  insert into public.quote_requests (name, email, phone, company, project_type, budget, description, client_hash)
  values (trim(p_name), v_email, nullif(trim(coalesce(p_phone, '')), ''), nullif(trim(coalesce(p_company, '')), ''),
          p_project_type, p_budget, trim(p_description), p_client_hash)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'request_id', v_id);
end;
$$;

revoke all on function public.request_quote(text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.request_quote(text, text, text, text, text, text, text, text) to service_role;
