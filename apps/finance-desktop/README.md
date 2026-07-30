# Arqevon Finance Desktop

Aplicativo instalável para Windows e macOS. O frontend é gerado a partir de `meu-financeiro.html`, que é a fonte principal das regras e da interface financeira.

## Desenvolvimento

1. Instale Rust e as dependências de sistema do Tauri.
2. Execute `npm install`.
3. Se necessário, copie `.env.example` para `.env.local` e altere o endpoint de licenças.
4. Gere os ícones com `npm run icon`.
5. Execute `npm run dev` ou `npm run build`.

O repositório contém somente a chave pública de verificação em `config/license-public.pem`. Ela não permite gerar licenças. A chave privada permanece exclusivamente no ambiente do servidor.

Exemplo para usar outro serviço de licenças:

```bash
LICENSE_API_BASE=https://licencas.exemplo.com \
LICENSE_PUBLIC_KEY="$(cat config/license-public.pem)" \
npm run build
```

## Dados e licença

- Os dados financeiros ficam no armazenamento local do WebView.
- A ativação online gera um JWT Ed25519 vinculado ao dispositivo.
- A licença é validada ao abrir o aplicativo, a cada 24 horas enquanto ele estiver aberto e assim que a conexão voltar.
- Se o serviço estiver inacessível, o aplicativo funciona offline por até 30 dias desde a última validação bem-sucedida.
- Licenças suspensas, canceladas, expiradas ou com a ativação revogada são bloqueadas antes de os dados aparecerem na próxima abertura online.
- Backups `.myfinance` usam PBKDF2-SHA256 e AES-256-GCM com uma senha escolhida pelo usuário.
- O backup nunca inclui a licença.
- **Enviar feedback** manda assunto e mensagem para `/api/v1/feedback` junto com o comprovante
  assinado, que é o que vincula a mensagem à licença. Nenhum dado financeiro é enviado. O envio
  exige conexão: sem rede a mensagem permanece na janela para nova tentativa, sem fila local.

## Assinatura

Builds de produção para macOS devem ser assinados com Developer ID e notarizados; builds Windows
devem ser assinados para não disparar o SmartScreen. Sem isso o macOS informa ao cliente que o
aplicativo "está danificado".

O workflow `build-desktop.yml` faz as duas coisas quando os segredos estão cadastrados e reprova o
build se a assinatura não sair válida. Sem segredos o artefato é publicado com o sufixo
`-NAO-ASSINADO-NAO-PUBLICAR`, para não ser confundido com uma versão distribuível.

Consulte `docs/ASSINATURA_INSTALADORES.md` para o que precisa ser contratado e cadastrado.
