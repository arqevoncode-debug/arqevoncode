# Assinatura dos instaladores

A versão 1.0.5 foi publicada sem assinatura. O efeito para o cliente:

- **macOS**: ao abrir o DMG baixado, o sistema informa que o aplicativo "está danificado e não pode
  ser aberto". O arquivo não está corrompido — essa é a mensagem que o Gatekeeper usa quando não
  encontra assinatura utilizável. O diagnóstico da 1.0.5: o `.app` tinha apenas a assinatura ad-hoc
  do linker (`Signature=adhoc`, `TeamIdentifier=not set`) e o `codesign` do próprio DMG respondia
  `code object is not signed at all`.
- **Windows**: o instalador não tem tabela de certificados, então o SmartScreen exibe o alerta de
  aplicativo não reconhecido. O cliente consegue prosseguir por "Mais informações → Executar assim
  mesmo", mas é um atrito grande em um produto pago.

O workflow `build-desktop.yml` já assina, notariza e **reprova o build** quando as credenciais
existem e a assinatura não sai válida. Falta apenas cadastrar os segredos abaixo: eles dependem de
contratação e de chaves privadas que não podem ficar no repositório.

## macOS

Requer participação no Apple Developer Program (anuidade) e um certificado
**Developer ID Application** — não serve o certificado de desenvolvimento local.

1. Em Certificates, Identifiers & Profiles, crie um certificado *Developer ID Application*.
2. Exporte-o do Acesso às Chaves como `.p12`, com senha.
3. Converta para base64: `base64 -i certificado.p12 | pbcopy`.
4. Crie uma senha de aplicativo em appleid.apple.com (a senha da conta não funciona na notarização).

Segredos do repositório:

| Segredo | Conteúdo |
| --- | --- |
| `APPLE_CERTIFICATE` | o `.p12` em base64 |
| `APPLE_CERTIFICATE_PASSWORD` | senha usada na exportação |
| `APPLE_SIGNING_IDENTITY` | `Developer ID Application: Nome (TEAMID)` |
| `APPLE_ID` | e-mail da conta de desenvolvedor |
| `APPLE_PASSWORD` | senha de aplicativo |
| `APPLE_TEAM_ID` | identificador da equipe |

Sem `APPLE_ID`, `APPLE_PASSWORD` e `APPLE_TEAM_ID` o aplicativo é assinado mas não notarizado, e o
macOS ainda mostra aviso na primeira abertura. Assinatura e notarização são etapas distintas.

## Windows

Desde junho de 2023 os certificados de assinatura de código publicamente confiáveis precisam ficar
em hardware certificado, então normalmente **não se recebe mais um `.pfx` para baixar**. Os caminhos
viáveis hoje:

- **Azure Trusted Signing**: mensalidade baixa, funciona em CI sem token físico. Exige validação da
  organização. É o caminho recomendado.
- **Certificado OV/EV em token USB ou HSM na nuvem**: assinar exige o token conectado ou uma
  integração com o serviço do provedor.

O workflow atual espera um `.pfx` importável, que atende certificados legados e exportações de HSM:

| Segredo | Conteúdo |
| --- | --- |
| `WINDOWS_CERTIFICATE` | o `.pfx` em base64 |
| `WINDOWS_CERTIFICATE_PASSWORD` | senha do `.pfx` |

Variável opcional `WINDOWS_TIMESTAMP_URL` (padrão `http://timestamp.digicert.com`). O carimbo de
tempo é obrigatório na prática: sem ele a assinatura deixa de valer quando o certificado expira.

Para Azure Trusted Signing, troque o passo "Configurar assinatura do Windows" por
`bundle.windows.signCommand` apontando para a ferramenta do provedor.

## Reputação do SmartScreen

Mesmo assinado, um certificado OV novo começa sem reputação e ainda pode gerar alerta por algumas
semanas, até acumular downloads. Certificado EV recebe reputação imediata. Vale considerar isso ao
escolher, porque afeta diretamente a primeira impressão de quem compra.

## Enquanto não houver certificado

Instruir cliente a burlar o Gatekeeper não é aceitável em produto pago: além do atrito, ensina a
ignorar exatamente o aviso que existe para protegê-lo. Para uso interno, em uma máquina própria:

```bash
xattr -dr com.apple.quarantine "/Applications/Arqevon Finance.app"
codesign --force --deep --sign - "/Applications/Arqevon Finance.app"
```

A segunda linha refaz o lacre ad-hoc e resolve a inconsistência de recursos que produz a mensagem
de "danificado". Serve para testar, não para distribuir.

## Verificar um artefato antes de publicar

```bash
codesign --verify --deep --strict --verbose=2 "Arqevon Finance.app"
codesign -dvv "Arqevon Finance.app"      # espera-se Authority=Developer ID Application
xcrun stapler validate Arqevon-Finance.dmg
spctl -a -vvv -t install Arqevon-Finance.dmg
```

O `spctl` é o que mais se aproxima do que o Mac do cliente faz ao abrir o download. No Windows,
`Get-AuthenticodeSignature` deve retornar `Valid`.
