-- Nuvem sem senha (decisão do dono, 2026-10-15): um aparelho novo é liberado por um aparelho já
-- conectado; a chave de recuperação é o único plano B. Não há mais senha da nuvem.
--
-- Aparelhos conectados antes de 2026-10-15 guardam só as chaves de trabalho (não a chave dos dados),
-- então não conseguem liberar outros. Sem a senha, a saída é trocar a chave: o aparelho cria uma
-- chave nova, recifra tudo o que tem (ele já tem todos os dados) e reenvia. Esta migração dá ao
-- servidor as duas peças para isso ser seguro:
--   - vault_rotate: troca a chave e esvazia os itens numa transação (o aparelho reenvia em seguida);
--   - vault_push com p_key_version: um aparelho com a chave antiga não grava por cima, recebe
--     KEY_CHANGED e pede para ser liberado de novo.

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
  -- Esvaziar a nuvem sem poder regravar perderia a cópia: só com assinatura ativa.
  if not public.vault_entitled(v_uid) then
    return jsonb_build_object('ok', false, 'code', 'NOT_ENTITLED', 'message', 'A sincronização exige uma assinatura ativa vinculada a esta conta.');
  end if;
  update public.vault_accounts
    set key_params = p_key_params, wrapped_key = p_wrapped_key, recovery_wrapped_key = p_recovery_wrapped_key,
        -- last_rev volta a 0 com a nuvem vazia: com o contador antigo, vault_pull diria has_more
        -- para sempre a quem baixa desde o início
        key_version = key_version + 1, item_count = 0, total_bytes = 0, last_rev = 0
    where user_id = v_uid and key_version = p_expected_version
    returning key_version into v_version;
  if v_version is null then
    if exists (select 1 from public.vault_accounts where user_id = v_uid) then
      return jsonb_build_object('ok', false, 'code', 'KEY_VERSION_CONFLICT', 'message', 'A chave da nuvem foi trocada em outro aparelho.');
    end if;
    return jsonb_build_object('ok', false, 'code', 'VAULT_NOT_FOUND', 'message', 'Esta conta ainda não tem dados na nuvem.');
  end if;
  delete from public.vault_items where user_id = v_uid;
  -- pacotes já aprovados levam a chave antiga; pedidos ainda esperando continuam valendo e serão
  -- aprovados com a chave nova
  delete from public.vault_device_links where user_id = v_uid and sealed is not null;
  return jsonb_build_object('ok', true, 'key_version', v_version);
end;
$$;

-- Envio que confere a versão da chave antes de gravar.
create or replace function public.vault_push(p_items jsonb, p_key_version integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_version integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', 'Entre na sua conta para continuar.');
  end if;
  -- a trava da linha vale até o fim da transação: uma troca de chave não passa no meio do envio
  select key_version into v_version from public.vault_accounts where user_id = v_uid for update;
  if v_version is not null and v_version is distinct from p_key_version then
    return jsonb_build_object('ok', false, 'code', 'KEY_CHANGED', 'message', 'A chave da nuvem foi trocada em outro aparelho. Libere este aparelho de novo.');
  end if;
  return public.vault_push(p_items);
end;
$$;

revoke all on function public.vault_rotate(integer, jsonb, text, text) from public, anon;
revoke all on function public.vault_push(jsonb, integer) from public, anon;
grant execute on function public.vault_rotate(integer, jsonb, text, text) to authenticated;
grant execute on function public.vault_push(jsonb, integer) to authenticated;
