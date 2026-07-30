# Arqevon Code

Monorepo oficial dos produtos da Arqevon Code.

## Projetos

| Diretório | Responsabilidade | Produção |
| --- | --- | --- |
| `apps/site` | Landing page e downloads | https://arqevon-site.vercel.app |
| `apps/finance-desktop` | Arqevon Finance para Windows e macOS | versão 1.0.5 |
| `apps/license-manager` | Painel e API de licenças | https://myfinance-license-manager.vercel.app |

Materiais de divulgação e arquivos de marketing não fazem parte deste repositório.

## Primeiro uso

Cada projeto possui dependências e comandos próprios:

```bash
cd apps/site && npm ci && npm run dev
cd apps/finance-desktop && npm ci && npm run build:web
cd apps/license-manager && npm ci && npm run dev
```

Antes de alterar uma parte publicada, leia `docs/PRODUCTION_BASELINE.md` e `CONTRIBUTING.md`.

## Segurança

- Credenciais de Supabase, senhas administrativas e chaves privadas nunca devem ser commitadas.
- A chave em `apps/finance-desktop/config/license-public.pem` é pública e serve apenas para verificar comprovantes de licença.
- Dados financeiros dos clientes permanecem no dispositivo e não pertencem a este repositório.

Este software é proprietário da Arqevon Code. Nenhuma licença de código aberto é concedida por este repositório.
