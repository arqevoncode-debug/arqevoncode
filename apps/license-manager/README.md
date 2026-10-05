# Arqevon Finance License Manager

Painel privado e API de ativação do aplicativo desktop Arqevon Finance. Os dados financeiros dos clientes só chegam ao Supabase cifrados no aplicativo, no cofre da nuvem (ver abaixo), e nunca passam pelo Next.js.

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
   - `202610050001_cloud_vault.sql`: cofre na nuvem (`vault_accounts`, `vault_items`), coluna
     `licenses.user_id` e as funções `vault_*` e `link_license_to_user`.
   - `202610050002_billing.sql`: planos, assinaturas e direitos (`products`, `plans`,
     `plan_entitlements`, `subscriptions`, `entitlement_grants`, `payment_events`), a regra única
     `has_entitlement`, `my_entitlements` e as funções `billing_*`. `vault_entitled` passa a usá-la.

   `npm run test:sql` (ou `scripts/test-migrations.sh`) aplica todas num Postgres descartável e
   roda os testes de `supabase/tests/`. Use as variáveis `PGHOST`, `PGUSER` etc. de um Postgres
   local; **nunca** as de produção, porque o script apaga e recria o banco de teste.

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

## Cofre na nuvem

O aplicativo cifra cada registro (AES-256-GCM) antes de enviar. O servidor guarda só texto
cifrado, um id opaco por item e as chaves embrulhadas, que são inúteis sem a senha ou a chave de
recuperação do cliente. A identidade é a conta do Supabase Auth, e o aplicativo chama as funções
direto no Supabase com o JWT do usuário. O Next.js fica fora do caminho dos dados.

| Função (RPC, papel `authenticated`) | O que faz | Exige assinatura |
| --- | --- | --- |
| `vault_status()` | estado do cofre, chaves embrulhadas e se a conta tem direito | não |
| `vault_create(key_params, wrapped_key, recovery_wrapped_key)` | cria o cofre | sim |
| `vault_push(items)` | grava até 500 itens `{id, ct, deleted}` | sim |
| `vault_pull(since, limit)` | lê o que mudou depois do rev `since`, até 2000 por página | não |
| `vault_rekey(expected_version, …)` | troca a senha e reembrulha a chave, sem recifrar os dados | não |
| `vault_delete()` | apaga o cofre inteiro (LGPD) | não |

- **Rev por conta:** o lock da linha em `vault_accounts` serializa os envios. Um dispositivo que
  pede "o que mudou depois do rev X" nunca pula um item gravado em paralelo.
- **Conflito:** vale o último envio de cada item. Edições em itens diferentes nunca se perdem.
- **Cotas:** 64 KB por item, 100 mil itens e 50 MB por conta.
- **Assinatura:** "ter assinatura" é ter uma licença `active`, não vencida, com `user_id` da conta.
  Sem assinatura, o cliente ainda baixa, protege e apaga os próprios dados.

`POST /api/v1/account/link-license` vincula a licença do dispositivo à conta. Recebe o JWT do
Supabase em `Authorization: Bearer` e o comprovante de ativação no corpo (`{ "token": "..." }`). Os
dois são verificados, e a ativação precisa continuar válida. Uma licença pertence a uma só conta, e
a resposta `409 LICENSE_LINKED_ELSEWHERE` indica que ela já está em outra.

### Login (Supabase Auth)

E-mail e senha, com confirmação por **código de 6 dígitos**, porque o app desktop não abre links.
Já configurado em produção: `site_url`, senha mínima de 8 caracteres e código de 6 dígitos válido
por 1 hora. O app manda ao Auth um derivado da senha, nunca a senha.

Os textos em português dos e-mails estão em `supabase/auth-email-templates.json`. O Supabase só
aceita textos próprios com **SMTP próprio** configurado. Até lá vale o modelo padrão, em inglês e
com link em vez de código, e o envio é restrito a membros da equipe, com cerca de 2 por hora.
**Não abra o cadastro para clientes antes de configurar o SMTP (Resend)** e aplicar esse arquivo
via `PATCH /v1/projects/{ref}/config/auth` da Management API.

## Saúde e keep-alive

`GET /api/health` faz uma consulta mínima ao banco e responde `{ ok: true }` ou `503`. O workflow
`.github/workflows/keep-alive.yml` chama a rota todo dia, porque o plano grátis do Supabase pausa o
projeto após dias sem uso. Se o workflow falhar, o banco está fora do ar.

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

## Assinaturas (Asaas)

- `POST /api/v1/billing/checkout`: com o JWT do Supabase Auth e `{ plan, cpf }`, cria (ou
  reaproveita) a assinatura no Asaas e devolve `checkoutUrl`, a fatura onde o cliente paga.
  `pro_mensal` cobra no cartão e renova sozinho; `pro_anual` aceita Pix, boleto ou cartão.
- `POST /api/v1/webhooks/asaas`: recebe os avisos do Asaas, autenticados pelo cabeçalho
  `asaas-access-token` (= `ASAAS_WEBHOOK_TOKEN`), e os aplica com `billing_apply_event`.

Regras que vivem no banco, não no código:
- O código só pergunta `has_entitlement(conta, produto, recurso)`, nunca o nome do plano. Preço,
  plano novo ou cortesia são linhas em `plans`, `plan_entitlements` e `entitlement_grants`.
- A validade sai das datas: `active`/`past_due` valem até `current_period_end` + 5 dias,
  `canceled` até `current_period_end`, `pending` não vale. Nenhum job liga ou desliga acesso.
- Cada aviso é gravado em `payment_events` pelo `id`; repetido, é ignorado. Aviso atrasado nunca
  encurta o período já liberado.
- Uma assinatura viva por conta (índice parcial): clique duplo não cobra duas vezes.
- Estorno ou contestação revoga o acesso na hora e cancela a assinatura no Asaas, que do
  contrário cobraria o cartão de novo no mês seguinte.
- O CPF vai direto ao Asaas, que o exige para cobrar; não é guardado no nosso banco.

O ambiente do Asaas sai do prefixo da chave (`$aact_hmlg_` = sandbox). Ao trocar para a chave de
produção, troque também `ASAAS_WEBHOOK_TOKEN` e recadastre o webhook na conta de produção.

## Variáveis no Vercel

Todas as variáveis de `.env.example` são server-only, exceto as iniciadas por `NEXT_PUBLIC_`. Nunca coloque `SUPABASE_SERVICE_ROLE_KEY` ou a chave privada Ed25519 no aplicativo desktop.

O plano Hobby da Vercel não é destinado a produção comercial. Use-o somente durante o desenvolvimento e mova o projeto para um plano compatível antes das vendas.
