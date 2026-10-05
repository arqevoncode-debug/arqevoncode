-- Kiwify como segundo gateway, ao lado do Asaas.
--
-- Na Kiwify quem vende ao comprador é a própria plataforma, então os dados pessoais do dono não
-- aparecem na cobrança, e ela aceita vendedor pessoa física. A regra de acesso continua única
-- (has_entitlement): uma assinatura da Kiwify é uma linha em subscriptions com provider 'kiwify'.
--
-- Diferente do Asaas, a assinatura nasce no pagamento, e não no checkout: o comprador vai direto
-- ao link da Kiwify, e a primeira notícia que temos dele é o aviso de compra aprovada.

alter table public.subscriptions drop constraint if exists subscriptions_provider_check;
alter table public.subscriptions
  add constraint subscriptions_provider_check check (provider in ('asaas', 'kiwify'));

-- Conta do comprador pelo e-mail, quando o link de pagamento não trouxe o id da conta.
-- Só e-mail confirmado: um cadastro não confirmado com o e-mail de outra pessoa não recebe o Pro dela.
create or replace function public.billing_find_user_by_email(p_email text)
returns uuid language sql stable security definer set search_path = public, auth as $$
  select id from auth.users
  where lower(email) = lower(trim(p_email)) and email_confirmed_at is not null
  order by created_at limit 1;
$$;

-- Aplica um evento da Kiwify já conferido na API dela pelo license-manager.
--   p_kind: 'paid' (compra aprovada ou renovação), 'revoked' (reembolso ou chargeback) ou 'ignored'.
--   p_provider_ref: id da assinatura na Kiwify (ou do pedido, se a venda não for assinatura).
--   p_period_start: início do período pago; o fim é início + 1 ciclo do plano.
-- Idempotente pelo id do evento, como billing_apply_event.
create or replace function public.billing_apply_kiwify(
  p_event_id text, p_kind text, p_user_id uuid, p_plan_id text,
  p_provider_ref text, p_period_start timestamptz, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_plan public.plans%rowtype;
  v_sub public.subscriptions%rowtype;
  v_end timestamptz;
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

revoke all on function public.billing_find_user_by_email(text) from public, anon, authenticated;
revoke all on function public.billing_apply_kiwify(text, text, uuid, text, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.billing_find_user_by_email(text) to service_role;
grant execute on function public.billing_apply_kiwify(text, text, uuid, text, text, timestamptz, jsonb) to service_role;
