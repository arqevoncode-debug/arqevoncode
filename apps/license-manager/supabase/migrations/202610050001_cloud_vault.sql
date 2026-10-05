-- Cofre na nuvem do Arqevon Finance.
-- Os dados financeiros chegam aqui já cifrados pelo aplicativo (AES-256-GCM). O servidor guarda
-- só texto cifrado e metadados mínimos: nunca recebe a senha, a chave dos dados nem nada em claro.
--
-- Identidade: Supabase Auth (auth.users). A assinatura passa a ser da conta: uma licença ativa
-- vinculada ao usuário libera a gravação. A leitura e a exclusão continuam livres, para o cliente
-- nunca ficar refém dos próprios dados ao cancelar.
--
-- Acesso: o aplicativo chama as funções abaixo direto no Supabase com o JWT do usuário. As tabelas
-- seguem o padrão do projeto (RLS ligado, tudo revogado de anon e authenticated); somente as
-- funções security definer tocam nelas, sempre filtrando por auth.uid().

alter table public.licenses
  add column if not exists user_id uuid references auth.users(id) on delete set null;
create index if not exists licenses_user_idx on public.licenses (user_id) where user_id is not null;

create table if not exists public.vault_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- Parâmetros do KDF (salt, iterações, algoritmo). Não são segredo.
  key_params jsonb not null check (pg_column_size(key_params) <= 2048),
  -- Chave dos dados (DEK) cifrada pela senha e, separadamente, pela chave de recuperação.
  wrapped_key text not null check (char_length(wrapped_key) between 16 and 4096),
  recovery_wrapped_key text not null check (char_length(recovery_wrapped_key) between 16 and 4096),
  -- Sobe a cada troca de senha; os dispositivos usam para saber que precisam pedir a senha nova.
  key_version integer not null default 1,
  -- Último rev entregue. Cada usuário tem a própria sequência, serializada pelo lock desta linha,
  -- para que um dispositivo nunca pule um item que outro gravou em paralelo.
  last_rev bigint not null default 0,
  item_count integer not null default 0,
  total_bytes bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vault_items (
  user_id uuid not null references public.vault_accounts(user_id) on delete cascade,
  -- Identificador opaco gerado pelo aplicativo; não revela o tipo nem a data do registro.
  item_id text not null check (item_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  rev bigint not null,
  deleted boolean not null default false,
  ciphertext text check (char_length(ciphertext) <= 65536),
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id),
  -- Exclusão vira marca (tombstone) sem conteúdo, para propagar aos outros dispositivos.
  check ((deleted and ciphertext is null) or (not deleted and ciphertext is not null))
);

create index if not exists vault_items_pull_idx on public.vault_items (user_id, rev);

alter table public.vault_accounts enable row level security;
alter table public.vault_items enable row level security;
revoke all on public.vault_accounts from anon, authenticated;
revoke all on public.vault_items from anon, authenticated;

create or replace function public.touch_vault_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists vault_accounts_touch on public.vault_accounts;
create trigger vault_accounts_touch before update on public.vault_accounts
for each row execute function public.touch_vault_updated_at();

-- Assinatura ativa: alguma licença vinculada à conta, ativa e não vencida.
create or replace function public.vault_entitled(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.licenses
    where user_id = p_user_id and status = 'active'
      and (expires_at is null or expires_at > now())
  );
$$;

-- Estado do cofre da conta logada. Devolve as chaves embrulhadas (inúteis sem a senha ou a
-- chave de recuperação) para que um dispositivo novo consiga abrir os dados.
create or replace function public.vault_status()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_acc public.vault_accounts%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', 'Entre na sua conta para continuar.');
  end if;
  select * into v_acc from public.vault_accounts where user_id = v_uid;
  return jsonb_build_object(
    'ok', true,
    'entitled', public.vault_entitled(v_uid),
    'exists', v_acc.user_id is not null,
    'key_params', v_acc.key_params,
    'wrapped_key', v_acc.wrapped_key,
    'recovery_wrapped_key', v_acc.recovery_wrapped_key,
    'key_version', v_acc.key_version,
    'last_rev', coalesce(v_acc.last_rev, 0),
    'item_count', coalesce(v_acc.item_count, 0),
    'total_bytes', coalesce(v_acc.total_bytes, 0)
  );
end;
$$;

-- Cria o cofre na primeira vez que a conta liga a nuvem. Exige assinatura ativa.
create or replace function public.vault_create(
  p_key_params jsonb,
  p_wrapped_key text,
  p_recovery_wrapped_key text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', 'Entre na sua conta para continuar.');
  end if;
  if not public.vault_entitled(v_uid) then
    return jsonb_build_object('ok', false, 'code', 'NOT_ENTITLED', 'message', 'A sincronização exige uma assinatura ativa vinculada a esta conta.');
  end if;
  if jsonb_typeof(p_key_params) is distinct from 'object' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'message', 'Parâmetros de chave inválidos.');
  end if;
  insert into public.vault_accounts (user_id, key_params, wrapped_key, recovery_wrapped_key)
    values (v_uid, p_key_params, p_wrapped_key, p_recovery_wrapped_key)
    on conflict (user_id) do nothing;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'VAULT_EXISTS', 'message', 'Esta conta já tem dados na nuvem.');
  end if;
  return jsonb_build_object('ok', true, 'key_version', 1, 'last_rev', 0);
end;
$$;

-- Troca de senha ou de chave de recuperação: só reembrulha a DEK, sem recifrar os dados.
-- p_expected_version evita que dois dispositivos troquem a senha ao mesmo tempo e um perca a troca.
-- Não exige assinatura: o cliente precisa poder proteger os dados mesmo depois de cancelar.
create or replace function public.vault_rekey(
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
  if jsonb_typeof(p_key_params) is distinct from 'object' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'message', 'Parâmetros de chave inválidos.');
  end if;
  update public.vault_accounts
    set key_params = p_key_params, wrapped_key = p_wrapped_key,
        recovery_wrapped_key = p_recovery_wrapped_key, key_version = key_version + 1
    where user_id = v_uid and key_version = p_expected_version
    returning key_version into v_version;
  if v_version is null then
    if exists (select 1 from public.vault_accounts where user_id = v_uid) then
      return jsonb_build_object('ok', false, 'code', 'KEY_VERSION_CONFLICT', 'message', 'A senha foi alterada em outro dispositivo. Abra os dados com a senha nova.');
    end if;
    return jsonb_build_object('ok', false, 'code', 'VAULT_NOT_FOUND', 'message', 'Esta conta ainda não tem dados na nuvem.');
  end if;
  return jsonb_build_object('ok', true, 'key_version', v_version);
end;
$$;

-- Grava um lote de itens cifrados. Cada item: {"id": "...", "ct": "...", "deleted": false}.
-- Itens excluídos vão com "deleted": true e sem "ct". Vale a última gravação que chega ao
-- servidor (por item, não pelo estado inteiro), na ordem do rev.
-- Limites: 500 itens por chamada, 64 KB por item, 100 mil itens e 50 MB por conta.
create or replace function public.vault_push(p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_acc public.vault_accounts%rowtype;
  v_n integer;
  v_invalid integer;
  v_distinct integer;
  v_count_delta integer;
  v_bytes_delta bigint;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', 'Entre na sua conta para continuar.');
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'message', 'Lote inválido.');
  end if;
  v_n := jsonb_array_length(p_items);
  if v_n > 500 then
    return jsonb_build_object('ok', false, 'code', 'BATCH_TOO_LARGE', 'message', 'Envie no máximo 500 itens por vez.');
  end if;
  if not public.vault_entitled(v_uid) then
    return jsonb_build_object('ok', false, 'code', 'NOT_ENTITLED', 'message', 'A sincronização exige uma assinatura ativa vinculada a esta conta.');
  end if;

  -- O lock da linha serializa os envios da mesma conta: os revs são gravados em ordem e
  -- quem lê "depois do rev X" nunca perde um item gravado em paralelo.
  select * into v_acc from public.vault_accounts where user_id = v_uid for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'VAULT_NOT_FOUND', 'message', 'Esta conta ainda não tem dados na nuvem.');
  end if;
  if v_n = 0 then
    return jsonb_build_object('ok', true, 'from_rev', v_acc.last_rev, 'last_rev', v_acc.last_rev);
  end if;

  select
    -- coalesce: um campo ausente dá null, e "not null" não seria contado como inválido.
    count(*) filter (where not coalesce(
      tipo = 'object'
      and item_id ~ '^[A-Za-z0-9_-]{8,64}$'
      and tipo_deleted in ('boolean', 'null')
      and (excluido or (tipo_ct = 'string' and char_length(ct) between 1 and 65536)),
      false
    )),
    count(distinct item_id)
  into v_invalid, v_distinct
  from (
    select jsonb_typeof(e) as tipo,
           case when jsonb_typeof(e) = 'object' then e->>'id' end as item_id,
           case when jsonb_typeof(e) = 'object' then coalesce(jsonb_typeof(e->'deleted'), 'null') end as tipo_deleted,
           case when jsonb_typeof(e) = 'object' then jsonb_typeof(e->'ct') end as tipo_ct,
           case when jsonb_typeof(e) = 'object' then e->>'ct' end as ct,
           case when jsonb_typeof(e) = 'object' and jsonb_typeof(e->'deleted') = 'boolean'
                then (e->>'deleted')::boolean else false end as excluido
    from jsonb_array_elements(p_items) as e
  ) as t;

  if v_invalid > 0 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'message', format('%s item(ns) inválido(s) no lote.', v_invalid));
  end if;
  if v_distinct <> v_n then
    return jsonb_build_object('ok', false, 'code', 'DUPLICATE_ITEM', 'message', 'O lote repete o mesmo item.');
  end if;

  -- Efeito do lote nas cotas, comparando com o que já está gravado.
  with entrada as (
    select e->>'id' as item_id,
           coalesce((e->>'deleted')::boolean, false) as deleted,
           e->>'ct' as ct
    from jsonb_array_elements(p_items) as e
  )
  select
    coalesce(sum((case when not i.deleted then 1 else 0 end) - (case when v.deleted = false then 1 else 0 end)), 0),
    coalesce(sum((case when i.deleted then 0 else char_length(i.ct) end) - coalesce(char_length(v.ciphertext), 0)), 0)
  into v_count_delta, v_bytes_delta
  from entrada i
  left join public.vault_items v on v.user_id = v_uid and v.item_id = i.item_id;

  if v_acc.item_count + v_count_delta > 100000 or v_acc.total_bytes + v_bytes_delta > 52428800 then
    return jsonb_build_object('ok', false, 'code', 'QUOTA_EXCEEDED', 'message', 'O limite de armazenamento na nuvem desta conta foi atingido.');
  end if;

  insert into public.vault_items (user_id, item_id, rev, deleted, ciphertext, updated_at)
  select v_uid, e->>'id', v_acc.last_rev + ord,
         coalesce((e->>'deleted')::boolean, false),
         case when coalesce((e->>'deleted')::boolean, false) then null else e->>'ct' end,
         now()
  from jsonb_array_elements(p_items) with ordinality as t(e, ord)
  on conflict (user_id, item_id) do update
    set rev = excluded.rev, deleted = excluded.deleted,
        ciphertext = excluded.ciphertext, updated_at = excluded.updated_at;

  update public.vault_accounts
    set last_rev = last_rev + v_n,
        item_count = item_count + v_count_delta,
        total_bytes = total_bytes + v_bytes_delta
    where user_id = v_uid;

  return jsonb_build_object('ok', true, 'from_rev', v_acc.last_rev, 'last_rev', v_acc.last_rev + v_n);
end;
$$;

-- Lê o que mudou depois de p_since, em ordem de rev, em páginas de até 2000 itens.
-- O próximo p_since é o "until" devolvido; "has_more" indica que há outra página.
-- Não exige assinatura: o cliente sempre consegue baixar os próprios dados.
create or replace function public.vault_pull(p_since bigint default 0, p_limit integer default 1000)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_acc public.vault_accounts%rowtype;
  v_limit integer := least(greatest(coalesce(p_limit, 1000), 1), 2000);
  v_since bigint := greatest(coalesce(p_since, 0), 0);
  v_items jsonb;
  v_until bigint;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', 'Entre na sua conta para continuar.');
  end if;
  select * into v_acc from public.vault_accounts where user_id = v_uid;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'VAULT_NOT_FOUND', 'message', 'Esta conta ainda não tem dados na nuvem.');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', item_id, 'rev', rev, 'deleted', deleted, 'ct', ciphertext) order by rev), '[]'::jsonb),
         coalesce(max(rev), v_since)
  into v_items, v_until
  from (
    select item_id, rev, deleted, ciphertext from public.vault_items
    where user_id = v_uid and rev > v_since
    order by rev limit v_limit
  ) as pagina;

  return jsonb_build_object(
    'ok', true, 'items', v_items, 'until', v_until,
    'has_more', v_until < v_acc.last_rev, 'last_rev', v_acc.last_rev, 'key_version', v_acc.key_version
  );
end;
$$;

-- Apaga todos os dados da conta na nuvem (LGPD). Os dados locais dos dispositivos ficam intactos.
create or replace function public.vault_delete()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', 'Entre na sua conta para continuar.');
  end if;
  delete from public.vault_accounts where user_id = v_uid;
  return jsonb_build_object('ok', true, 'deleted', found);
end;
$$;

-- Vincula uma licença a uma conta. Chamada só pelo license-manager, depois de conferir o
-- comprovante Ed25519 do dispositivo e o JWT do usuário: nenhum dos dois vem do corpo da requisição.
create or replace function public.link_license_to_user(p_license_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_license public.licenses%rowtype;
begin
  select * into v_license from public.licenses where id = p_license_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'LICENSE_NOT_FOUND', 'message', 'Licença não encontrada.');
  end if;
  if v_license.user_id is not null and v_license.user_id <> p_user_id then
    return jsonb_build_object('ok', false, 'code', 'LICENSE_LINKED_ELSEWHERE', 'message', 'Esta licença já está vinculada a outra conta.');
  end if;
  if v_license.user_id is null then
    update public.licenses set user_id = p_user_id where id = p_license_id;
  end if;
  return jsonb_build_object('ok', true, 'entitled', public.vault_entitled(p_user_id), 'plan', v_license.plan);
end;
$$;

revoke all on function public.vault_entitled(uuid) from public, anon, authenticated;
revoke all on function public.vault_status() from public, anon;
revoke all on function public.vault_create(jsonb, text, text) from public, anon;
revoke all on function public.vault_rekey(integer, jsonb, text, text) from public, anon;
revoke all on function public.vault_push(jsonb) from public, anon;
revoke all on function public.vault_pull(bigint, integer) from public, anon;
revoke all on function public.vault_delete() from public, anon;
revoke all on function public.link_license_to_user(uuid, uuid) from public, anon, authenticated;

grant execute on function public.vault_status() to authenticated;
grant execute on function public.vault_create(jsonb, text, text) to authenticated;
grant execute on function public.vault_rekey(integer, jsonb, text, text) to authenticated;
grant execute on function public.vault_push(jsonb) to authenticated;
grant execute on function public.vault_pull(bigint, integer) to authenticated;
grant execute on function public.vault_delete() to authenticated;
grant execute on function public.link_license_to_user(uuid, uuid) to service_role;
