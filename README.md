# Arqevon Code

Monorepo oficial dos produtos da Arqevon Code.

## Projetos

| Diretório | Responsabilidade | Produção |
| --- | --- | --- |
| `apps/site` | Site da Arqevon Code, página do Finance, calculadoras, termos | https://arqevoncode.com.br |
| `apps/web` | Arqevon Finance no navegador (motor, login, nuvem, PWA) | https://app.arqevoncode.com.br |
| `apps/license-manager` | Painel, API de licenças e de pagamentos | https://licencas.arqevoncode.com.br |

O app desktop (Tauri) foi descontinuado em 2026-10-14. Os instaladores já publicados continuam
hospedados em `apps/site/public/downloads` (sem link no site) e a API de licenças continua no ar,
para quem já instalou não ficar sem acesso enquanto migra para o app web.

Materiais de divulgação e arquivos de marketing não fazem parte deste repositório.

## Primeiro uso

Cada projeto possui dependências e comandos próprios:

```bash
cd apps/site && npm ci && npm run dev
cd apps/web && npm ci && npm run dev
cd apps/license-manager && npm ci && npm run dev
```

Antes de alterar uma parte publicada, leia `docs/PRODUCTION_BASELINE.md` e `CONTRIBUTING.md`.

## Segurança

- Credenciais de Supabase, senhas administrativas e chaves privadas nunca devem ser commitadas.
- Os dados financeiros dos clientes ficam no aparelho; na nuvem, só cifrados no próprio aparelho.

Este software é proprietário da Arqevon Code. Nenhuma licença de código aberto é concedida por este repositório.
