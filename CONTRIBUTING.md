# Fluxo seguro de alterações

O branch `main` representa a base estável do produto publicado.

1. Crie um branch curto a partir de `main`: `feat/nome`, `fix/nome` ou `refactor/nome`.
2. Faça mudanças pequenas, sem misturar refatoração estrutural com funcionalidades novas.
3. Execute os testes do projeto alterado.
4. Compare manualmente os fluxos críticos descritos em `docs/PRODUCTION_BASELINE.md`.
5. Abra um Pull Request e só faça merge com a integração contínua aprovada.
6. Gere instaladores em uma tag nova; nunca substitua silenciosamente uma versão já anunciada.

## Regras de compatibilidade

- Não altere nomes de chaves do `localStorage` sem migração.
- Não altere o formato de backup sem manter importação das versões anteriores.
- Não altere os contratos da API de licença sem coordenar desktop e servidor.
- Migrações do Supabase devem ser aditivas sempre que possível e nunca reescrever migrações já aplicadas.
- Não publique instaladores sem teste real em Windows e macOS.
