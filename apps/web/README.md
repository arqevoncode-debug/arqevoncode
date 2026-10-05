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
