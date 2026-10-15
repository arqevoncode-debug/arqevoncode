-- Liberar um aparelho novo aprovando num aparelho que já abre a nuvem, sem digitar a senha da nuvem.
--
-- Fluxo (todo o segredo fica nos aparelhos; o servidor só repassa):
--   1. O aparelho novo cria um par de chaves ECDH e um código de 8 caracteres que só aparece na tela
--      dele. Envia a chave pública e uma etiqueta (PBKDF2 do código sobre a chave pública).
--   2. No aparelho já aberto, a pessoa digita o código. O app confere a etiqueta (prova de que a chave
--      pública é a do aparelho que mostra o código) e só então cifra a chave dos dados para ela.
--   3. O aparelho novo busca o pacote, abre com a chave privada dele e o pedido é apagado.
-- O servidor nunca vê o código, a chave dos dados nem a chave privada.
--
-- Mesmo padrão do cofre: RLS ligado, tabela revogada de anon e authenticated, funções security
-- definer filtrando por auth.uid().

create table if not exists public.vault_device_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_pub text not null check (char_length(device_pub) between 40 and 200),
  device_tag text not null check (char_length(device_tag) between 20 and 100),
  label text not null default '' check (char_length(label) <= 60),
  sealed text check (sealed is null or char_length(sealed) <= 2000),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  approved_at timestamptz
);
create index if not exists vault_device_links_user_idx on public.vault_device_links (user_id, created_at);
create index if not exists vault_device_links_expira_idx on public.vault_device_links (expires_at);
alter table public.vault_device_links enable row level security;
revoke all on public.vault_device_links from anon, authenticated;

-- Aparelho novo: abre um pedido. No máximo 5 pedidos em aberto por conta. Cada pedido novo apaga os
-- vencidos de todas as contas (não ficam guardados além do necessário).
create or replace function public.vault_link_request(p_device_pub text, p_device_tag text, p_label text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_expira timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', 'Entre na sua conta para continuar.');
  end if;
  if not exists (select 1 from public.vault_accounts where user_id = v_uid) then
    return jsonb_build_object('ok', false, 'code', 'VAULT_NOT_FOUND', 'message', 'Esta conta ainda não tem dados na nuvem.');
  end if;
  if p_device_pub is null or p_device_pub !~ '^[A-Za-z0-9+/=]{40,200}$'
     or p_device_tag is null or p_device_tag !~ '^[A-Za-z0-9+/=]{20,100}$' then
    return jsonb_build_object('ok', false, 'code', 'INVALID', 'message', 'Pedido inválido.');
  end if;
  delete from public.vault_device_links where expires_at <= now();
  if (select count(*) from public.vault_device_links where user_id = v_uid and sealed is null) >= 5 then
    return jsonb_build_object('ok', false, 'code', 'TOO_MANY', 'message', 'Muitos pedidos em aberto. Espere alguns minutos e tente de novo.');
  end if;
  insert into public.vault_device_links (user_id, device_pub, device_tag, label)
  values (v_uid, p_device_pub, p_device_tag, left(regexp_replace(coalesce(p_label, ''), '[^[:alnum:][:space:]·.-]', '', 'g'), 60))
  returning id, expires_at into v_id, v_expira;
  return jsonb_build_object('ok', true, 'id', v_id, 'expires_at', v_expira);
end;
$$;

-- Aparelho já aberto: pedidos que esperam aprovação.
create or replace function public.vault_link_pending()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', 'Entre na sua conta para continuar.');
  end if;
  return jsonb_build_object('ok', true, 'items', coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'device_pub', device_pub, 'device_tag', device_tag, 'label', label, 'created_at', created_at) order by created_at)
    from public.vault_device_links
    where user_id = v_uid and sealed is null and expires_at > now()
  ), '[]'::jsonb));
end;
$$;

-- Aparelho já aberto: entrega o pacote cifrado para o aparelho novo.
create or replace function public.vault_link_approve(p_id uuid, p_sealed text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', 'Entre na sua conta para continuar.');
  end if;
  if p_sealed is null or char_length(p_sealed) not between 40 and 2000 then
    return jsonb_build_object('ok', false, 'code', 'INVALID', 'message', 'Pedido inválido.');
  end if;
  update public.vault_device_links set sealed = p_sealed, approved_at = now()
  where id = p_id and user_id = v_uid and sealed is null and expires_at > now();
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Este pedido venceu ou já foi atendido. Gere um código novo no outro aparelho.');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Aparelho novo: busca o pacote. Entregue uma vez só (o pedido é apagado ao ler).
create or replace function public.vault_link_take(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_link public.vault_device_links%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', 'Entre na sua conta para continuar.');
  end if;
  select * into v_link from public.vault_device_links where id = p_id and user_id = v_uid for update;
  if v_link.id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Pedido não encontrado.');
  end if;
  if v_link.sealed is not null then
    delete from public.vault_device_links where id = p_id;
    return jsonb_build_object('ok', true, 'sealed', v_link.sealed);
  end if;
  if v_link.expires_at <= now() then
    delete from public.vault_device_links where id = p_id;
    return jsonb_build_object('ok', false, 'code', 'EXPIRED', 'message', 'O código venceu.');
  end if;
  return jsonb_build_object('ok', true, 'pending', true);
end;
$$;

-- Qualquer um dos lados desiste (recusar no aparelho aberto ou cancelar no novo).
create or replace function public.vault_link_cancel(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', 'Entre na sua conta para continuar.');
  end if;
  delete from public.vault_device_links where id = p_id and user_id = v_uid;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.vault_link_request(text, text, text) from public, anon;
revoke all on function public.vault_link_pending() from public, anon;
revoke all on function public.vault_link_approve(uuid, text) from public, anon;
revoke all on function public.vault_link_take(uuid) from public, anon;
revoke all on function public.vault_link_cancel(uuid) from public, anon;
grant execute on function public.vault_link_request(text, text, text) to authenticated;
grant execute on function public.vault_link_pending() to authenticated;
grant execute on function public.vault_link_approve(uuid, text) to authenticated;
grant execute on function public.vault_link_take(uuid) to authenticated;
grant execute on function public.vault_link_cancel(uuid) to authenticated;
