# Arqevon Finance — Web

O Finance no navegador, em `app.arqevoncode.com.br`. O motor financeiro é o mesmo do desktop:
`scripts/build.mjs` lê `../finance-desktop/meu-financeiro.html` e acrescenta o login (Supabase Auth,
código de 6 dígitos por e-mail), o layout web e a janela "Sua conta".

```bash
npm ci
npm run dev                       # gera dist/ e serve em http://localhost:4300
ARQEVON_BILLING=1 npm run build   # liga a venda do Pro na interface
```

- O plano Grátis guarda os dados no navegador, como o desktop. "Usar sem conta" funciona igual.
- Nenhum script de terceiros: tudo vai num arquivo só, e o CSP de `vercel.json` só libera o
  Supabase e o `licencas.arqevoncode.com.br`. Não adicione pixel nem analytics aqui; eles vão no site.
- Preços vêm de `list_plans()` no banco, nunca do código.

## Nuvem (Pro)

- `src/cofre.js`: criptografia. Uma DEK aleatória por conta, embrulhada pela senha da nuvem
  (PBKDF2-SHA256, 600 mil iterações) e pela chave de recuperação. Cada registro é cifrado com
  AES-256-GCM, e o id do item é um HMAC: o servidor não sabe o que é cada item.
- `src/sync.js`: sincronização por registro (lançamento, fixo, parcelamento, objetivo). Uma
  mudança local ainda não enviada vence. Não roda com o app bloqueado nem aplica mudanças com um
  campo em edição. Apagar mais da metade pede confirmação; recusada, os registros voltam da nuvem.
- `src/nuvem.js`: telas e gatilhos (mudança local verificada a cada 3 s, remota a cada 30 s, ao
  voltar para a aba e ao reconectar). As chaves ficam no IndexedDB como CryptoKey não exportável e
  são apagadas ao sair.
- O navegador guarda de qual conta são os dados locais (`arqevon-sync-dono`): dados de uma conta
  nunca sobem para a nuvem de outra.
- `npm test` roda `tests/sync.test.mjs`, com dois aparelhos e um servidor falso.
