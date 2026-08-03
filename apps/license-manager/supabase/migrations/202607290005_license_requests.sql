-- Pedidos de licença feitos pela landing page.
-- O visitante informa o e-mail antes de baixar; a emissão continua manual, feita
-- pelo painel. Esta tabela é só a fila de quem pediu.

create table if not exists public.license_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null check (char_length(email) between 5 and 200),
  name text,
  platform text not null default 'windows' check (platform in ('windows','macos')),
  status text not null default 'novo' check (status in ('novo','emitida','recusada')),
  notes text,
  -- HMAC do IP, nunca o endereço em texto puro. Serve apenas para conter abuso.
  client_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists license_requests_recentes on public.license_requests (created_at desc);
create index if not exists license_requests_email_idx on public.license_requests (lower(email));
-- A aba do painel abre nos pendentes; o índice parcial atende esse caso.
create index if not exists license_requests_novos on public.license_requests (created_at desc) where status = 'novo';

alter table public.license_requests enable row level security;
revoke all on public.license_requests from anon, authenticated;

drop trigger if exists license_requests_touch on public.license_requests;
create trigger license_requests_touch before update on public.license_requests
for each row execute function public.touch_license_updated_at();

-- Registra um pedido. O endpoint é público e sem autenticação, então o freio vive aqui:
-- no máximo 3 pedidos por origem por hora, e um mesmo e-mail pendente não duplica a fila.
create or replace function public.request_license(
  p_email text,
  p_name text,
  p_platform text,
  p_client_hash text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(p_email));
  v_recentes integer;
  v_existente uuid;
  v_id uuid;
begin
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok', false, 'code', 'EMAIL_INVALID', 'message', 'Informe um e-mail válido.');
  end if;

  if p_client_hash is not null then
    select count(*) into v_recentes
    from public.license_requests
    where client_hash = p_client_hash and created_at >= now() - interval '1 hour';

    if v_recentes >= 3 then
      return jsonb_build_object('ok', false, 'code', 'REQUEST_RATE_LIMIT',
        'message', 'Muitos pedidos em pouco tempo. Tente novamente mais tarde.');
    end if;
  end if;

  -- Pedir duas vezes é comum e não deve gerar duas linhas na fila. A resposta é a
  -- mesma do primeiro pedido, para o visitante não descobrir o estado da fila.
  select id into v_existente
  from public.license_requests
  where lower(email) = v_email and status = 'novo'
  limit 1;

  if v_existente is not null then
    return jsonb_build_object('ok', true, 'request_id', v_existente, 'already', true);
  end if;

  insert into public.license_requests (email, name, platform, client_hash)
  values (v_email, nullif(trim(coalesce(p_name, '')), ''), coalesce(p_platform, 'windows'), p_client_hash)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'request_id', v_id, 'already', false);
end;
$$;

revoke all on function public.request_license(text,text,text,text) from public, anon, authenticated;
grant execute on function public.request_license(text,text,text,text) to service_role;
