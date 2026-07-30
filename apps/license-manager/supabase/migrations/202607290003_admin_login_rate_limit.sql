-- Freio de força bruta no login administrativo.
-- O estado fica no banco porque a Vercel executa várias instâncias sem memória compartilhada:
-- um contador em processo seria reiniciado a cada cold start e multiplicado por instância.

create table if not exists public.admin_login_attempts (
  id uuid primary key default gen_random_uuid(),
  client_hash text not null check (length(client_hash) = 64),
  attempted_at timestamptz not null default now()
);

-- Somente tentativas malsucedidas são gravadas; nenhum IP em texto puro, apenas o hash.
create index if not exists admin_login_attempts_lookup
  on public.admin_login_attempts (client_hash, attempted_at desc);

alter table public.admin_login_attempts enable row level security;
revoke all on public.admin_login_attempts from anon, authenticated;

-- Consulta o estado do freio sem registrar nada.
create or replace function public.admin_login_gate(
  p_client_hash text,
  p_max_attempts integer,
  p_window_seconds integer
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_inicio timestamptz := now() - make_interval(secs => p_window_seconds);
  v_falhas integer;
  v_ultima timestamptz;
begin
  delete from public.admin_login_attempts where attempted_at < now() - interval '1 day';

  select count(*), max(attempted_at) into v_falhas, v_ultima
  from public.admin_login_attempts
  where client_hash = p_client_hash and attempted_at >= v_inicio;

  if v_falhas >= p_max_attempts then
    return jsonb_build_object(
      'blocked', true,
      'retry_after_seconds',
      greatest(1, ceil(extract(epoch from (v_ultima + make_interval(secs => p_window_seconds)) - now()))::integer)
    );
  end if;

  return jsonb_build_object('blocked', false, 'remaining', p_max_attempts - v_falhas);
end;
$$;

-- Registra o resultado: sucesso limpa o histórico do cliente, falha acrescenta uma tentativa.
create or replace function public.admin_login_record(
  p_client_hash text,
  p_success boolean
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_success then
    delete from public.admin_login_attempts where client_hash = p_client_hash;
  else
    insert into public.admin_login_attempts (client_hash) values (p_client_hash);
  end if;
end;
$$;

revoke all on function public.admin_login_gate(text,integer,integer) from public, anon, authenticated;
revoke all on function public.admin_login_record(text,boolean) from public, anon, authenticated;
grant execute on function public.admin_login_gate(text,integer,integer) to service_role;
grant execute on function public.admin_login_record(text,boolean) to service_role;
