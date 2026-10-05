-- Preços públicos dos planos pagos, para a interface mostrar exatamente o que será cobrado.
-- Sem isto o preço ficaria repetido no código do app e poderia divergir do que o checkout cobra.
create or replace function public.list_plans()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'price_cents', price_cents, 'interval', billing_interval
  ) order by price_cents), '[]'::jsonb)
  from public.plans where active and billing_interval <> 'none';
$$;

revoke all on function public.list_plans() from public;
grant execute on function public.list_plans() to anon, authenticated;
