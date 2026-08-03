# Arqevon Finance License Manager

Painel privado e API de ativação do aplicativo desktop Arqevon Finance. Os dados financeiros dos clientes não passam por este projeto.

Produção: https://myfinance-license-manager.vercel.app

Supabase: projeto `povzrbkwemeckwrtkxhc`, região `sa-east-1`.

## Componentes

- Next.js: painel administrativo e endpoints `/api/v1/licenses/*`.
- Supabase: tabelas `licenses` e `activations`, com RLS fechado para o público.
- Ed25519: comprovantes de ativação assinados pelo servidor e verificados pelo desktop.

O login do painel aceita no máximo 5 tentativas malsucedidas por origem em 15 minutos e responde
`429` depois disso. O contador vive na tabela `admin_login_attempts` porque a Vercel executa
instâncias independentes, sem memória compartilhada. Um login bem-sucedido zera o histórico.

## Configuração local

1. Instale as dependências com `npm install`.
2. Copie `.env.example` para `.env.local`.
3. Gere segredos com `node scripts/generate-secrets.mjs` e copie os valores para `.env.local`.
4. Aplique **todas** as migrações de `supabase/migrations/` no Supabase, em ordem crescente de nome:
   - `202607290001_license_manager.sql`: tabelas `licenses` e `activations`, RLS e funções de ativação.
   - `202607290002_optional_email_device_limit.sql`: e-mail opcional e limite de 1 a 5 dispositivos.
   - `202607290003_admin_login_rate_limit.sql`: freio de força bruta no login administrativo.
   - `202607290004_customer_feedback.sql`: tabela `feedbacks` e a função `submit_feedback`.
   - `202607290005_license_requests.sql`: tabela `license_requests` e a função `request_license`.

   Um ambiente novo que receba apenas a primeira migração aceita licenças com até 20 dispositivos
   e deixa o login sem freio. Ao adicionar uma migração, inclua-a nesta lista.
5. Preencha URL e service role do Supabase.
6. Execute `npm run dev`.

## Endpoints do desktop

- `POST /api/v1/licenses/activate`: ativa a chave em um dispositivo.
- `POST /api/v1/licenses/validate`: consulta o estado atual da licença e renova o comprovante por 30 dias.
- `POST /api/v1/licenses/deactivate`: libera o dispositivo atual.
- `POST /api/v1/feedback`: registra um feedback do cliente.

O feedback é vinculado à licença pelo próprio comprovante assinado, não por um campo enviado
pelo aplicativo: o cliente não escolhe a qual licença a mensagem pertence. A tabela aceita de 10
a 2000 caracteres e a função limita 5 envios por licença por hora. O painel lista os feedbacks
na aba **Feedbacks**, onde cada mensagem pode ser marcada como lida, arquivada ou reaberta.

## Pedidos de licença

- `POST /api/v1/license-requests`: registra o e-mail de quem quer receber uma licença.

Chamado pela landing page, que é outro domínio e não tem banco próprio. Por ser público e sem
autenticação, o freio vive na função do banco: no máximo 3 pedidos por origem por hora, com o IP
guardado apenas como HMAC. Um mesmo e-mail já pendente não duplica a fila, e a resposta é idêntica
nos dois casos — quem pede duas vezes não descobre o estado da fila.

A emissão continua manual. O painel lista os pedidos na aba **Solicitações**, onde **Gerar licença**
abre o formulário de emissão já preenchido com o e-mail e o nome informados. Depois de enviar a
chave ao cliente, marque o pedido como emitida.

O desktop consulta o endpoint de validação em toda abertura, a cada 24 horas enquanto estiver aberto e quando a conexão voltar. Um comprovante Ed25519 válido permite até 30 dias de tolerância quando o servidor ou a internet estiverem indisponíveis.

## Variáveis no Vercel

Todas as variáveis de `.env.example` são server-only, exceto as iniciadas por `NEXT_PUBLIC_`. Nunca coloque `SUPABASE_SERVICE_ROLE_KEY` ou a chave privada Ed25519 no aplicativo desktop.

O plano Hobby da Vercel não é destinado a produção comercial. Use-o somente durante o desenvolvimento e mova o projeto para um plano compatível antes das vendas.
