# Contexto operacional

Complementa `README.md` e `CONTRIBUTING.md` com o que não se deduz lendo o código: armadilhas
conhecidas, ordem correta das operações e decisões cujo motivo não está óbvio no arquivo.

## Mapa

| Diretório | O que é | Publicação |
| --- | --- | --- |
| `apps/site` | Landing page e downloads | Vercel, projeto `arqevon-code` |
| `apps/license-manager` | Painel e API de licenças | Vercel, projeto `myfinance-license-manager` |
| `apps/finance-desktop` | Aplicativo Tauri | instalador gerado pela tag `v*` |

Cada app é autocontido, com o próprio `package-lock.json`. Não há workspace na raiz — a raiz do
repositório **não** tem `package.json`.

```bash
cd apps/site            && npm ci && npm run lint && npm test
cd apps/license-manager  && npm ci && npm run build && npm test
cd apps/finance-desktop  && npm ci && npm test          # test já roda build:web
```

`apps/finance-desktop` precisa de Rust apenas para `npm run dev` e `npm run build` (Tauri). Os
testes e o `build:web` rodam sem Rust.

## Armadilhas que já custaram tempo

**Assinatura ad-hoc passa em teste local e falha depois do download.** No Apple Silicon o linker
assina o binário automaticamente, então o app abre perfeitamente na máquina que compilou. Depois de
baixado, o Gatekeeper avalia a assinatura e recusa com "aplicativo danificado". Nunca conclua que um
build de macOS está distribuível por tê-lo aberto localmente — use as checagens de
`docs/ASSINATURA_INSTALADORES.md`.

**Secret ausente no GitHub Actions não é variável ausente: é variável vazia.** O bundler do Tauri
decide assinar pela presença de `APPLE_CERTIFICATE`, não pelo conteúdo, e aborta o build inteiro ao
tentar importar um certificado vazio. Por isso `build-desktop.yml` injeta as credenciais via
`GITHUB_ENV` em um passo condicional, e o passo de compilação não declara nenhuma variável da Apple.
Vale para qualquer credencial nova.

**As migrações do Supabase são aplicadas à mão.** Não há passo automático no deploy. Aplique a
migração **antes** de subir código que dependa dela, e mantenha a lista no README do license-manager
atualizada ao adicionar uma.

**O freio de login falha fechado de propósito.** `503` no login do painel quer dizer que
`admin_login_gate` não respondeu — normalmente a migração `202607290003` não aplicada, ou Supabase
sem credenciais. Não é bug: preferimos painel inacessível a painel sem proteção. A causa real vai
para o log do servidor.

**`LICENSE_API_BASE` divergente do CSP reprova o build.** `scripts/build-frontend.mjs` compara a
origem configurada com o `connect-src` de `tauri.conf.json`. Sem isso o build passava e a ativação
só falhava em runtime, na máquina do cliente. Ao mudar a origem da API, atualize os dois lugares.

**Os hashes dos instaladores estão fixados em teste.** `apps/site/tests/site.test.mjs` e
`docs/PRODUCTION_BASELINE.md` guardam os SHA-256 publicados. Trocar links sem atualizar os dois
reprova o CI — é intencional, para a página nunca anunciar um arquivo diferente do homologado.

**O download de macOS está suspenso.** O botão é um rótulo inerte "Em breve" porque sem certificado
Developer ID o cliente baixaria algo que não abre. Um teste reprova o CI se algum `href` voltar a
apontar para o `.dmg`. Restaure o botão somente quando houver instalador assinado.

## Como o licenciamento se sustenta

A chave privada Ed25519 existe **somente** no ambiente do license-manager. O desktop carrega apenas
a chave pública, embutida no build.

Toda operação que precisa saber "de qual licença isto vem" usa o comprovante JWT assinado, nunca um
campo do corpo da requisição. Vale para `validate`, `deactivate` e `feedback`. Ao criar um endpoint
novo com essa necessidade, siga o mesmo caminho: `verifyActivationToken` e leia `payload.sub`.

A lógica de negócio de licenças vive em funções `security definer` no Postgres, não no Next.js. RLS
está ligado e todas as permissões revogadas de `anon` e `authenticated`; o acesso é só via
`service_role` ou pelas funções. Endpoint novo que toque nessas tabelas deve seguir o padrão.

Dados financeiros do cliente **nunca** passam pelo servidor. Ficam no `localStorage` do dispositivo.

## Ordem de um release do desktop

1. Aplicar migrações pendentes no Supabase.
2. Subir o código e conferir o deploy do license-manager.
3. Criar a tag `vX.Y.Z` — é o gatilho de `build-desktop.yml`.
4. Sem certificados, o artefato sai com sufixo `-NAO-ASSINADO-NAO-PUBLICAR`. Ele **não** deve ir
   para a landing page.
5. Promover os instaladores para `apps/site/public/downloads/`, atualizar links, texto da versão,
   os hashes no teste do site e o `PRODUCTION_BASELINE.md`.
6. Versões anteriores continuam hospedadas para não quebrar links já enviados a clientes.

A versão aparece em quatro lugares no desktop: `package.json`, `src-tauri/tauri.conf.json`,
`src-tauri/Cargo.toml` (e `Cargo.lock`) e `APP_VERSION` em `src/desktop.js`.

## Coisas que parecem quebradas e não estão

- `apps/site/db`, `worker`, `drizzle`, `.openai` e `examples` estão **vazias**. São sobras de
  scaffold: o site não tem banco, worker nem Cloudflare. Pode ignorar ou remover.
- `NEXT_PUBLIC_APP_NAME` e `NEXT_PUBLIC_LICENSE_API_URL` aparecem no `.env.example` do
  license-manager mas nenhum arquivo as lê.
- O `grep` não encontra strings do frontend dentro do binário do Tauri: os assets são comprimidos.
  Ausência de string não indica funcionalidade ausente.
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
