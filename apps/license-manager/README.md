# Arqevon Finance License Manager

Painel privado e API de ativação do aplicativo desktop Arqevon Finance. Os dados financeiros dos clientes não passam por este projeto.

Produção: https://myfinance-license-manager.vercel.app

Supabase: projeto `povzrbkwemeckwrtkxhc`, região `sa-east-1`.

## Componentes

- Next.js: painel administrativo e endpoints `/api/v1/licenses/*`.
- Supabase: tabelas `licenses` e `activations`, com RLS fechado para o público.
- Ed25519: comprovantes de ativação assinados pelo servidor e verificados pelo desktop.

## Configuração local

1. Instale as dependências com `npm install`.
2. Copie `.env.example` para `.env.local`.
3. Gere segredos com `node scripts/generate-secrets.mjs` e copie os valores para `.env.local`.
4. Aplique `supabase/migrations/202607290001_license_manager.sql` no Supabase.
5. Preencha URL e service role do Supabase.
6. Execute `npm run dev`.

## Endpoints do desktop

- `POST /api/v1/licenses/activate`: ativa a chave em um dispositivo.
- `POST /api/v1/licenses/validate`: consulta o estado atual da licença e renova o comprovante por 30 dias.
- `POST /api/v1/licenses/deactivate`: libera o dispositivo atual.

O desktop consulta o endpoint de validação em toda abertura, a cada 24 horas enquanto estiver aberto e quando a conexão voltar. Um comprovante Ed25519 válido permite até 30 dias de tolerância quando o servidor ou a internet estiverem indisponíveis.

## Variáveis no Vercel

Todas as variáveis de `.env.example` são server-only, exceto as iniciadas por `NEXT_PUBLIC_`. Nunca coloque `SUPABASE_SERVICE_ROLE_KEY` ou a chave privada Ed25519 no aplicativo desktop.

O plano Hobby da Vercel não é destinado a produção comercial. Use-o somente durante o desenvolvimento e mova o projeto para um plano compatível antes das vendas.
