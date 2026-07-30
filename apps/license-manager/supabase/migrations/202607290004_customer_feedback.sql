-- Feedback dos clientes, vinculado à licença que o enviou.
-- O vínculo vem do comprovante Ed25519 assinado pelo servidor, não de um campo
-- informado pelo aplicativo: o cliente não escolhe a qual licença o texto pertence.

create table if not exists public.feedbacks (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.licenses(id) on delete cascade,
  activation_id uuid references public.activations(id) on delete set null,
  device_id text,
  category text not null default 'sugestao'
    check (category in ('sugestao','problema','duvida','elogio')),
  message text not null check (char_length(message) between 10 and 2000),
  app_version text,
  status text not null default 'novo' check (status in ('novo','lido','arquivado')),
  created_at timestamptz not null default now()
);

create index if not exists feedbacks_recentes on public.feedbacks (created_at desc);
create index if not exists feedbacks_license_idx on public.feedbacks (license_id);
-- A aba do painel abre filtrando os não lidos; o índice parcial atende esse caso.
create index if not exists feedbacks_novos on public.feedbacks (created_at desc) where status = 'novo';

alter table public.feedbacks enable row level security;
revoke all on public.feedbacks from anon, authenticated;

-- Grava um feedback já validado pelo servidor. Limita 5 envios por licença por hora:
-- sem isso um cliente com token válido poderia inundar a tabela.
create or replace function public.submit_feedback(
  p_license_id uuid,
  p_activation_id uuid,
  p_device_id text,
  p_category text,
  p_message text,
  p_app_version text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_licenca_existe boolean;
  v_activation_id uuid;
  v_recentes integer;
  v_id uuid;
begin
  select exists (select 1 from public.licenses where id = p_license_id) into v_licenca_existe;
  if not v_licenca_existe then
    return jsonb_build_object('ok', false, 'code', 'LICENSE_NOT_FOUND', 'message', 'Licença não encontrada.');
  end if;

  -- Um comprovante ainda válido pode citar uma ativação já removida: nesse caso o
  -- feedback é preservado sem vínculo de dispositivo, em vez de falhar pela chave estrangeira.
  select id into v_activation_id
  from public.activations
  where id = p_activation_id and license_id = p_license_id;

  select count(*) into v_recentes
  from public.feedbacks
  where license_id = p_license_id and created_at >= now() - interval '1 hour';

  if v_recentes >= 5 then
    return jsonb_build_object('ok', false, 'code', 'FEEDBACK_RATE_LIMIT',
      'message', 'Muitos envios em pouco tempo. Tente novamente mais tarde.');
  end if;

  insert into public.feedbacks (license_id, activation_id, device_id, category, message, app_version)
  values (p_license_id, v_activation_id, p_device_id, p_category, p_message, p_app_version)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'feedback_id', v_id);
end;
$$;

revoke all on function public.submit_feedback(uuid,uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.submit_feedback(uuid,uuid,text,text,text,text) to service_role;
