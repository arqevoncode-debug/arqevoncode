-- Compra nova na Kiwify com período ainda em vigor passa a somar, em vez de recomeçar do dia
-- da compra. Caso típico: o plano anual de valor fixo, que o cliente renova comprando de novo,
-- às vezes antes de vencer. Só billing_apply_kiwify muda; assinatura e permissões ficam iguais.

create or replace function public.billing_apply_kiwify(
  p_event_id text, p_kind text, p_user_id uuid, p_plan_id text,
  p_provider_ref text, p_period_start timestamptz, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_plan public.plans%rowtype;
  v_sub public.subscriptions%rowtype;
  v_end timestamptz;
  v_inicio timestamptz;
  v_outcome text;
begin
  insert into public.payment_events (id, provider, event, provider_subscription_id, payload)
    values (p_event_id, 'kiwify', p_kind, p_provider_ref, p_payload)
    on conflict (id) do nothing;
  if not found then
    return jsonb_build_object('ok', true, 'outcome', 'duplicate');
  end if;

  if p_kind not in ('paid', 'revoked') then
    v_outcome := 'ignored_event';
  elsif p_provider_ref is null then
    v_outcome := 'ignored_no_reference';
  elsif p_kind = 'revoked' then
    update public.subscriptions
      set status = 'canceled', current_period_end = least(coalesce(current_period_end, now()), now())
      where provider = 'kiwify' and provider_subscription_id = p_provider_ref;
    v_outcome := case when found then 'revoked' else 'ignored_unknown_subscription' end;
  elsif p_user_id is null then
    -- Pago, mas sem conta correspondente: fica registrado para conferência manual no painel.
    v_outcome := 'ignored_no_account';
  else
    select * into v_plan from public.plans where id = p_plan_id and billing_interval in ('month', 'year');
    if not found or p_period_start is null then
      v_outcome := 'ignored_unknown_plan';
    else
      v_end := p_period_start + case v_plan.billing_interval when 'year' then interval '1 year' else interval '1 month' end;
      select * into v_sub from public.subscriptions
        where provider = 'kiwify' and provider_subscription_id = p_provider_ref for update;
      if found then
        -- greatest: um aviso antigo chegando atrasado nunca encurta o período já liberado.
        update public.subscriptions
          set status = case when status = 'canceled' then 'canceled' else 'active' end,
              current_period_end = greatest(coalesce(current_period_end, v_end), v_end)
          where id = v_sub.id;
        v_outcome := 'period_extended';
      else
        -- Compra nova com período ainda em vigor (o anual de valor fixo renovado antes de vencer,
        -- ou a troca do mensal pelo anual): o período novo começa quando o atual termina, para o
        -- cliente não perder os dias que já pagou.
        select max(current_period_end) into v_inicio from public.subscriptions
          where user_id = p_user_id and status <> 'pending' and current_period_end > p_period_start;
        v_inicio := greatest(p_period_start, coalesce(v_inicio, p_period_start));
        v_end := v_inicio + case v_plan.billing_interval when 'year' then interval '1 year' else interval '1 month' end;
        -- Uma conta tem no máximo uma assinatura viva. Um checkout do Asaas abandonado ou uma
        -- assinatura anterior saem de cena; a anterior mantém o acesso até o fim do período pago.
        update public.subscriptions set status = 'canceled'
          where user_id = p_user_id and status in ('pending', 'active', 'past_due');
        insert into public.subscriptions (user_id, plan_id, status, current_period_end, provider, provider_subscription_id)
          values (p_user_id, v_plan.id, 'active', v_end, 'kiwify', p_provider_ref);
        v_outcome := 'subscription_created';
      end if;
    end if;
  end if;

  update public.payment_events set outcome = v_outcome where id = p_event_id;
  return jsonb_build_object('ok', true, 'outcome', v_outcome);
end;
$$;
