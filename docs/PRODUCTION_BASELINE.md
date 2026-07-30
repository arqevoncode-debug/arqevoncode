# Baseline de produção — Arqevon Finance 1.0.5

Este documento registra a versão anunciada antes do início das refatorações.

## Serviços

- Site: https://arqevon-site.vercel.app
- Site alternativo: https://arqevon-code.vercel.app
- Gerenciador de licenças: https://myfinance-license-manager.vercel.app

## Artefatos publicados

| Plataforma | Arquivo | SHA-256 |
| --- | --- | --- |
| Windows x64 | `apps/site/public/downloads/Arqevon-Finance-1.0.5-Windows-x64-Setup-v3.exe` | `c51bbc9d8b0b96bef3d15a2f06b2002178db92aab70968e28d0cceb214d8ce48` |
| macOS Apple Silicon | `apps/site/public/downloads/Arqevon-Finance-1.0.5-macOS-Apple-Silicon.dmg` | `b44b34502cff2a7117032a250c3ae3ad56b80733045831411c8138f937a160ff` |

## Fluxos que não podem regredir

### Aplicativo financeiro

- Criar, editar e excluir receitas e despesas.
- Parcelamentos e recorrências.
- Filtros mensais, totais e gráfico por categoria.
- Objetivos financeiros.
- Tema claro e escuro.
- Exportar e importar backup atual e backups legados protegidos por senha.
- Resetar todos os dados mediante confirmação.

### Licenciamento

- Ativação vinculada ao dispositivo.
- Limite configurável de 1 a 5 dispositivos.
- Validação ao abrir, a cada 24 horas e ao recuperar conexão.
- Tolerância offline de 30 dias.
- Bloqueio na próxima validação online após suspensão ou cancelamento.
- Chave privada somente no servidor; desktop contém apenas a chave pública.

### Distribuição

- Windows x64: instalador deve aceitar os retornos de sucesso do WebView2, inclusive `-2147219416` e `-2147219187`.
- macOS: validar abertura, permissões, importação de arquivos e ações de edição/exclusão.
- Links da landing page devem responder e baixar exatamente os artefatos registrados acima.

## Estratégia de retorno

A tag `production-v1.0.5` identifica este baseline. Se uma refatoração causar regressão, compare com essa tag ou gere um branch a partir dela, sem apagar o histórico posterior.
