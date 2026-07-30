-- MyFinance License Manager
-- Dados financeiros nunca passam por estas tabelas; somente licenças e ativações.

create extension if not exists pgcrypto;

create table if not exists public.licenses (
  id uuid primary key default gen_random_uuid(),
  key_hash text not null unique check (length(key_hash) = 64),
  customer_name text not null check (char_length(customer_name) between 1 and 120),
  email text not null,
  plan text not null default 'individual' check (plan in ('individual','multidispositivo','familia')),
  status text not null default 'active' check (status in ('active','suspended','cancelled')),
  max_devices integer not null default 1 check (max_devices between 1 and 20),
  expires_at timestamptz,
  updates_until timestamptz default (now() + interval '1 year'),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activations (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.licenses(id) on delete cascade,
  device_id text not null check (char_length(device_id) between 12 and 120),
  device_name text,
  os text,
  app_version text,
  activated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

create unique index if not exists activations_one_active_device
  on public.activations (license_id, device_id) where revoked_at is null;
create index if not exists activations_license_idx on public.activations (license_id);
create index if not exists licenses_email_idx on public.licenses (lower(email));

alter table public.licenses enable row level security;
alter table public.activations enable row level security;

-- Nenhuma policy pública: somente a service role do backend acessa as tabelas.
revoke all on public.licenses from anon, authenticated;
revoke all on public.activations from anon, authenticated;

create or replace function public.touch_license_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists licenses_touch on public.licenses;
create trigger licenses_touch before update on public.licenses
for each row execute function public.touch_license_updated_at();

create or replace function public.activate_license(
  p_key_hash text,
  p_device_id text,
  p_device_name text,
  p_os text,
  p_app_version text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_license public.licenses%rowtype;
  v_activation public.activations%rowtype;
  v_active_count integer;
begin
  select * into v_license from public.licenses where key_hash = p_key_hash for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'LICENSE_NOT_FOUND', 'message', 'Licença inválida. Confira a chave informada.');
  end if;
  if v_license.status <> 'active' then
    return jsonb_build_object('ok', false, 'code', 'LICENSE_INACTIVE', 'message', 'Esta licença está suspensa ou cancelada.');
  end if;
  if v_license.expires_at is not null and v_license.expires_at <= now() then
    return jsonb_build_object('ok', false, 'code', 'LICENSE_EXPIRED', 'message', 'Esta licença expirou.');
  end if;

  select * into v_activation from public.activations
    where license_id = v_license.id and device_id = p_device_id and revoked_at is null
    limit 1;

  if found then
    update public.activations set last_seen_at = now(), device_name = p_device_name,
      os = p_os, app_version = p_app_version where id = v_activation.id returning * into v_activation;
  else
    select count(*) into v_active_count from public.activations
      where license_id = v_license.id and revoked_at is null;
    if v_active_count >= v_license.max_devices then
      return jsonb_build_object('ok', false, 'code', 'DEVICE_LIMIT',
        'message', format('Esta licença já está ativa em %s dispositivo(s). Libere um dispositivo para continuar.', v_license.max_devices));
    end if;
    insert into public.activations (license_id, device_id, device_name, os, app_version)
      values (v_license.id, p_device_id, p_device_name, p_os, p_app_version)
      returning * into v_activation;
  end if;

  select count(*) into v_active_count from public.activations
    where license_id = v_license.id and revoked_at is null;

  return jsonb_build_object(
    'ok', true, 'license_id', v_license.id, 'activation_id', v_activation.id,
    'device_id', v_activation.device_id, 'customer_name', v_license.customer_name,
    'plan', v_license.plan, 'max_devices', v_license.max_devices,
    'active_devices', v_active_count, 'updates_until', v_license.updates_until
  );
end;
$$;

create or replace function public.validate_activation(
  p_license_id uuid,
  p_activation_id uuid,
  p_device_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_license public.licenses%rowtype;
  v_activation public.activations%rowtype;
  v_active_count integer;
begin
  select * into v_license from public.licenses where id = p_license_id;
  select * into v_activation from public.activations
    where id = p_activation_id and license_id = p_license_id and device_id = p_device_id and revoked_at is null;
  if v_license.id is null or v_activation.id is null then
    return jsonb_build_object('ok', false, 'code', 'ACTIVATION_REVOKED', 'message', 'Este dispositivo não está mais autorizado.');
  end if;
  if v_license.status <> 'active' then
    return jsonb_build_object('ok', false, 'code', 'LICENSE_INACTIVE', 'message', 'Esta licença está suspensa ou cancelada.');
  end if;
  if v_license.expires_at is not null and v_license.expires_at <= now() then
    return jsonb_build_object('ok', false, 'code', 'LICENSE_EXPIRED', 'message', 'Esta licença expirou.');
  end if;
  update public.activations set last_seen_at = now() where id = v_activation.id;
  select count(*) into v_active_count from public.activations where license_id = v_license.id and revoked_at is null;
  return jsonb_build_object(
    'ok', true, 'license_id', v_license.id, 'activation_id', v_activation.id,
    'device_id', v_activation.device_id, 'customer_name', v_license.customer_name,
    'plan', v_license.plan, 'max_devices', v_license.max_devices,
    'active_devices', v_active_count, 'updates_until', v_license.updates_until
  );
end;
$$;

revoke all on function public.activate_license(text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.validate_activation(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.activate_license(text,text,text,text,text) to service_role;
grant execute on function public.validate_activation(uuid,uuid,text) to service_role;

