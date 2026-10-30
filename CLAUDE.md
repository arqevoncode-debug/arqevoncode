# Contexto operacional

Complementa `README.md` e `CONTRIBUTING.md` com o que não se deduz lendo o código: armadilhas
conhecidas, ordem correta das operações e decisões cujo motivo não está óbvio no arquivo.

## Mapa

| Diretório | O que é | Publicação |
| --- | --- | --- |
| `apps/site` | Landing page e downloads | Vercel, projeto `arqevon-code` |
| `apps/license-manager` | Painel e API de licenças | Vercel, projeto `myfinance-license-manager` |
| `apps/web` | Finance no navegador (login, conta, assinatura) | Vercel, projeto `arqevon-app` → app.arqevoncode.com.br |

Cada app é autocontido, com o próprio `package-lock.json`. Não há workspace na raiz — a raiz do
repositório **não** tem `package.json`.

```bash
cd apps/site            && npm ci && npm run lint && npm test
cd apps/license-manager  && npm ci && npm run build && npm test
cd apps/web              && npm ci && npm run dev         # http://localhost:4300
```

No `apps/site`, o `npm test` faz o build e roda, além das checagens de texto, as contas das
calculadoras (`tests/calculadoras.test.mjs`, que importa `app/calculadoras/contas.js` direto no Node) e
as páginas das calculadoras no Chrome (`tests/calculadoras-navegador.test.mjs`, que sobe `next start`
numa porta livre): alinhamento em 6 larguras, celular, cada calculadora e a promessa de que nenhum
valor digitado sai do navegador. As contas ficam em JS, e não em TS, para o Node importar sem build.
Depois do deploy, `ARQEVON_SITE_URL=https://arqevoncode.com.br node --test
tests/calculadoras-navegador.test.mjs` roda a mesma bateria na produção, com 2 s entre as páginas.

No `apps/web`, `npm run test:e2e` abre o app no Chrome (puppeteer-core, com o Chrome do sistema ou
`CHROME_PATH`) e testa lançamentos, cálculos, objetivos, criptografia, backup e celular, com a data
fixada em 13/10/2026. `npm run test:regressao` roda o mesmo roteiro em `origin/main`
(`REGRESSAO_BASE`) e na versão local e compara dados e telas passo a passo. Os dois rodam no CI. A
regressão também fica vermelha numa mudança intencional de comportamento: nesse caso, leia a saída
antes de fazer o merge. Depois do deploy, `ARQEVON_WEB_URL=https://app.arqevoncode.com.br/ node --test
--test-concurrency=1 'tests/e2e/*.test.mjs'` roda a mesma bateria contra a produção.

O app desktop (Tauri) foi **descontinuado em 2026-10-14** e saiu do repositório (o histórico está
no git). Os instaladores já publicados continuam em `apps/site/public/downloads`, sem link no site,
e a API de licenças (`/api/v1/licenses/*` no license-manager) continua no ar: as instalações
existentes validam a licença a cada 24 h e param de abrir após 30 dias sem resposta. Só desligue a
API depois de avisar os clientes e oferecer a migração (app web + backup `.myfinance`, que o web
importa).

## Armadilhas que já custaram tempo

**Depois de aplicar uma migração, recarregue o cache da API:** `notify pgrst, 'reload schema';`.
Sem isso, uma função nova responde PGRST202 ("não encontrada") pelo REST mesmo existindo no banco.

**O motor é um arquivo só.** `apps/web/src/motor.html` (HTML+JS) tem toda a parte financeira;
`apps/web/scripts/build.mjs` injeta login, layout, "Sua conta" e PWA. O motor só abre o convite de
criptografia quando a classe `desktop-bloqueado` sai do `<html>` (nome herdado do desktop): o login
web usa esse sinal.
`ARQEVON_BILLING=1` no build liga a venda do Pro; sem ela o Pro aparece como "chegando".

**As migrações do Supabase são aplicadas à mão.** Não há passo automático no deploy. Aplique a
migração **antes** de subir código que dependa dela, e mantenha a lista no README do license-manager
atualizada ao adicionar uma.

**O freio de login falha fechado de propósito.** `503` no login do painel quer dizer que
`admin_login_gate` não respondeu — normalmente a migração `202607290003` não aplicada, ou Supabase
sem credenciais. Não é bug: preferimos painel inacessível a painel sem proteção. A causa real vai
para o log do servidor.

**Os hashes dos instaladores antigos estão fixados em teste.** `apps/site/tests/site.test.mjs` e
`docs/PRODUCTION_BASELINE.md` guardam os SHA-256 dos instaladores ainda hospedados, para nenhum ser
trocado por engano.

**O Supabase grátis pausa sozinho.** Em 2026-10-05 o projeto estava `INACTIVE`, com ativações e
pedidos de licença fora do ar, sem que ninguém percebesse. O `keep-alive.yml` faz uma chamada diária
a `/api/health` para evitar isso. Para reativar o projeto, use `POST /v1/projects/{ref}/restore`
(leva uns 5 minutos). Produção roda **Postgres 17**, e o CI testa as migrações nessa mesma versão.

## Como o licenciamento se sustenta

A chave privada Ed25519 existe **somente** no ambiente do license-manager. O desktop carrega apenas
a chave pública, embutida no build.

Toda operação que precisa saber "de qual licença isto vem" usa o comprovante JWT assinado, nunca um
campo do corpo da requisição. Vale para `validate`, `deactivate` e `feedback`. Ao criar um endpoint
novo com essa necessidade, siga o mesmo caminho: `verifyActivationToken` e leia `payload.sub`.

A lógica de negócio de licenças vive em funções `security definer` no Postgres, não no Next.js. RLS
está ligado e todas as permissões revogadas de `anon` e `authenticated`; o acesso é só via
`service_role` ou pelas funções. Endpoint novo que toque nessas tabelas deve seguir o padrão.

Dados financeiros do cliente **nunca** chegam ao servidor em claro. No modo local ficam só no
`localStorage`. No modo nuvem, o app cifra cada registro antes de enviar e fala direto com o
Supabase (funções `vault_*`, JWT do Supabase Auth). O Next.js não entra nesse caminho.

**O cofre não segue o padrão "só `service_role`".** As funções `vault_*` são executáveis por
`authenticated` e se protegem filtrando por `auth.uid()`. As tabelas continuam fechadas. Função nova
do cofre precisa do mesmo filtro, e `supabase/tests/cloud_vault.test.sql` precisa provar o
isolamento entre contas.

## Coisas que parecem quebradas e não estão

- `apps/site/db`, `worker`, `drizzle`, `.openai` e `examples` estão **vazias**. São sobras de
  scaffold: o site não tem banco, worker nem Cloudflare. Pode ignorar ou remover.
- `NEXT_PUBLIC_APP_NAME` e `NEXT_PUBLIC_LICENSE_API_URL` aparecem no `.env.example` do
  license-manager mas nenhum arquivo as lê.
- `/api/v1/licenses/validate` responde `503 SERVER_ERROR` para um token malformado, e só
  `401 TOKEN_INVALID` para assinatura inválida ou expirada. Ao testar o endpoint, use um JWT bem
  formado assinado por outra chave — token lixo dá 503 e parece defeito de servidor.

## Fora deste repositório

O workspace `~/Finance` contém `myfinance-desktop/`, `myfinance-license-manager/`,
`myfinance-pro/`, `arqevon-site/` e `marketing-instagram/`. São predecessores e material de
divulgação, **não** são a fonte de verdade. Este monorepo é. Cuidado ao buscar arquivos pelo
workspace: é fácil editar a cópia antiga por engano.

Credenciais de produção vivem nas variáveis de ambiente da Vercel. Não há `.env.local` versionado
neste repositório e não deve haver.

## Ao trabalhar aqui

`CONTRIBUTING.md` define o fluxo: branch curta, mudanças pequenas, testes do app alterado, conferir
`docs/PRODUCTION_BASELINE.md` antes de mexer em superfície publicada, PR com CI aprovado.

Verifique o que afirmar. Vários problemas desta base passaram por revisão de código sem serem
notados e só apareceram ao executar de verdade — o build do macOS abortando por variável vazia foi
encontrado assim, depois de ter sido descrito como funcional a partir da leitura do arquivo.
