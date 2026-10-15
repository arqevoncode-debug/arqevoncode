-- Acesso só pelo e-mail (decisão do dono, 2026-10-15): entrar na conta basta para abrir os dados da
-- nuvem em qualquer aparelho, sem senha, código ou chave de recuperação.
--
-- Os registros continuam cifrados no aparelho (AES-256-GCM) e guardados cifrados aqui. A chave dos
-- dados (DEK) passa a ficar também sob custódia da Arqevon: cifrada com uma chave mestra que existe só
-- no ambiente do license-manager (VAULT_CUSTODY_KEY), nunca no banco. Quem tiver só o banco ou as
-- cópias de segurança continua sem ler nada; o license-manager entrega a DEK a quem entrar na conta.
--
-- As funções abaixo são só do service_role (chamadas pela rota /api/v1/vault/key, que confere o
-- JWT do usuário). O aplicativo nunca toca nelas.

alter table public.vault_accounts
  add column if not exists server_wrapped_key text check (server_wrapped_key is null or char_length(server_wrapped_key) between 40 and 400),
  add column if not exists server_key_kid text check (server_key_kid is null or char_length(server_key_kid) <= 64);

create or replace function public.vault_custody_get(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((
    select jsonb_build_object('exists', true, 'kid', key_params->>'kid', 'wrapped', server_wrapped_key, 'wrapped_kid', server_key_kid)
    from public.vault_accounts where user_id = p_user_id
  ), jsonb_build_object('exists', false));
$$;

-- Guarda a DEK cifrada pelo servidor. Só aceita a chave atual da conta (kid igual ao da nuvem) e não
-- troca uma custódia que já vale para essa chave.
create or replace function public.vault_custody_set(p_user_id uuid, p_wrapped text, p_kid text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update public.vault_accounts set server_wrapped_key = p_wrapped, server_key_kid = p_kid
  where user_id = p_user_id and key_params->>'kid' = p_kid
    and (server_wrapped_key is null or server_key_kid is distinct from p_kid);
  if found then return jsonb_build_object('ok', true, 'stored', true); end if;
  if exists (select 1 from public.vault_accounts where user_id = p_user_id and server_key_kid = p_kid and server_wrapped_key is not null) then
    return jsonb_build_object('ok', true, 'stored', false);
  end if;
  return jsonb_build_object('ok', false, 'code', 'KID_MISMATCH');
end;
$$;

-- A troca de chave invalida a custódia: o aparelho que trocou entrega a chave nova em seguida.
create or replace function public.vault_rotate(
  p_expected_version integer,
  p_key_params jsonb,
  p_wrapped_key text,
  p_recovery_wrapped_key text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_version integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', 'Entre na sua conta para continuar.');
  end if;
  if jsonb_typeof(p_key_params) is distinct from 'object'
     or char_length(coalesce(p_wrapped_key, '')) not between 16 and 4096
     or char_length(coalesce(p_recovery_wrapped_key, '')) not between 16 and 4096 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'message', 'Parâmetros de chave inválidos.');
  end if;
  if not public.vault_entitled(v_uid) then
    return jsonb_build_object('ok', false, 'code', 'NOT_ENTITLED', 'message', 'A sincronização exige uma assinatura ativa vinculada a esta conta.');
  end if;
  update public.vault_accounts
    set key_params = p_key_params, wrapped_key = p_wrapped_key, recovery_wrapped_key = p_recovery_wrapped_key,
        -- last_rev volta a 0 com a nuvem vazia (senão vault_pull diria has_more para sempre)
        key_version = key_version + 1, item_count = 0, total_bytes = 0, last_rev = 0,
        server_wrapped_key = null, server_key_kid = null
    where user_id = v_uid and key_version = p_expected_version
    returning key_version into v_version;
  if v_version is null then
    if exists (select 1 from public.vault_accounts where user_id = v_uid) then
      return jsonb_build_object('ok', false, 'code', 'KEY_VERSION_CONFLICT', 'message', 'A chave da nuvem foi trocada em outro aparelho.');
    end if;
    return jsonb_build_object('ok', false, 'code', 'VAULT_NOT_FOUND', 'message', 'Esta conta ainda não tem dados na nuvem.');
  end if;
  delete from public.vault_items where user_id = v_uid;
  return jsonb_build_object('ok', true, 'key_version', v_version);
end;
$$;

-- A liberação de aparelho por código (202610150001) deixa de existir: entrar na conta basta.
drop function if exists public.vault_link_request(text, text, text);
drop function if exists public.vault_link_pending();
drop function if exists public.vault_link_approve(uuid, text);
drop function if exists public.vault_link_take(uuid);
drop function if exists public.vault_link_cancel(uuid);
drop table if exists public.vault_device_links;

revoke all on function public.vault_custody_get(uuid) from public, anon, authenticated;
revoke all on function public.vault_custody_set(uuid, text, text) from public, anon, authenticated;
grant execute on function public.vault_custody_get(uuid) to service_role;
grant execute on function public.vault_custody_set(uuid, text, text) to service_role;
