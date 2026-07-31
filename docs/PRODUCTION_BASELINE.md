# Baseline de produção — Arqevon Finance 1.0.6

Este documento registra a versão anunciada na landing page.

## Serviços

- Site: https://arqevon-site.vercel.app
- Site alternativo: https://arqevon-code.vercel.app
- Gerenciador de licenças: https://myfinance-license-manager.vercel.app

## Artefatos publicados

Gerados pela tag `v1.0.6`.

| Plataforma | Arquivo | SHA-256 |
| --- | --- | --- |
| Windows x64 | `apps/site/public/downloads/Arqevon-Finance-1.0.6-Windows-x64-Setup.exe` | `053b83ab64a7befc9385a81c6e815a8940b4c93c2e27301c1b929204ddd0d079` |
| macOS Apple Silicon | `apps/site/public/downloads/Arqevon-Finance-1.0.6-macOS-Apple-Silicon.dmg` | `05d2a99f95aab6f1f673c895e47d9ef652a8efba8f153b1a48ceb7482a3ec16a` |

> **Estes artefatos não estão assinados.** No macOS o Gatekeeper os recusa com a mensagem de
> aplicativo danificado; no Windows o SmartScreen alerta antes de permitir a instalação. Enquanto os
> certificados descritos em `ASSINATURA_INSTALADORES.md` não existirem, o download do macOS não abre
> na máquina do cliente. O nome dos artefatos no CI sai com o sufixo `-NAO-ASSINADO-NAO-PUBLICAR`.

### Versão anterior

A 1.0.5 continua hospedada para não quebrar links já enviados, e é o ponto de retorno da tag
`production-v1.0.5`.

| Plataforma | Arquivo | SHA-256 |
| --- | --- | --- |
| Windows x64 | `Arqevon-Finance-1.0.5-Windows-x64-Setup-v3.exe` | `c51bbc9d8b0b96bef3d15a2f06b2002178db92aab70968e28d0cceb214d8ce48` |
| macOS Apple Silicon | `Arqevon-Finance-1.0.5-macOS-Apple-Silicon.dmg` | `b44b34502cff2a7117032a250c3ae3ad56b80733045831411c8138f937a160ff` |

## Fluxos que não podem regredir

### Aplicativo financeiro

- Criar, editar e excluir receitas e despesas.
- Parcelamentos e recorrências.
- Filtros mensais, totais e gráfico por categoria.
- Objetivos financeiros.
- Tema claro e escuro.
- Exportar e importar backup atual e backups legados protegidos por senha.
- Resetar todos os dados mediante confirmação.
- Enviar feedback vinculado à licença, com o comprovante assinado definindo a origem.

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
