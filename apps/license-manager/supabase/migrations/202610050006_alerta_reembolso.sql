-- Marca quando o alerta de reembolso foi enviado ao dono.
--
-- Na Kiwify, reembolsar não cancela a assinatura e a API pública não tem como cancelá-la: sem
-- ação manual no painel, o cliente reembolsado seria cobrado de novo. O webhook manda um e-mail a
-- cada reembolso ou chargeback e grava aqui quando conseguiu. Enquanto estiver nulo, uma nova
-- entrega do mesmo aviso tenta enviar de novo.
alter table public.payment_events add column if not exists alert_sent_at timestamptz;
