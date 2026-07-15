# Aviso de Produto Duplicado

## Visão geral

Quando a IA termina de analisar uma foto, o app já compara o nome sugerido
contra o catálogo de referência (`catalogMatch`). Esta feature adiciona um
segundo check, no mesmo momento: comparar o nome contra os produtos **já
adicionados na tabela compartilhada**, e avisar visualmente se parecer
duplicata — sem bloquear o envio.

## Objetivo

Evitar que dois colaboradores contem o mesmo produto duas vezes sem
perceber, mostrando um aviso explícito antes de confirmar o envio.

## Fora de escopo (non-goals)

- Não bloqueia o envio — usuário decide, mesmo com aviso.
- Não recalcula o aviso se o usuário editar o nome manualmente depois que a
  IA respondeu (mesma limitação que o badge de catálogo já tem hoje).
- Não compara contra produtos já excluídos (soft-deleted) — só contra o que
  está ativo na tabela no momento.
- Não desfaz nem mescla itens automaticamente — é só um aviso informativo.

## Arquitetura

Reaproveita a função `similarity` (Dice coefficient sobre bigramas,
normalizando acento/caixa) já existente em `js/catalogMatch.js`. Um novo
módulo puro, `js/duplicateCheck.js`, aplica essa mesma função comparando o
nome sugerido contra `p.nome` de cada produto já carregado em memória
(`produtos`, o mesmo array mantido em sincronia por Realtime). O array já
exclui itens soft-deletados, então a comparação naturalmente só considera o
que está ativo.

**Threshold diferente do catálogo:** o catálogo usa 0.35 (permissivo — é um
catálogo grande e variado, queremos até matches fracos pra enriquecer o
nome). Pra detectar duplicata dentro da própria contagem, queremos mais
precisão, pra não confundir produtos parecidos mas diferentes (ex: "SUCO DE
UVA 1L" vs "SUCO DE LARANJA 1L"). Threshold: **0.7**.

## Componentes

- **`js/duplicateCheck.js`** (novo, puro, testado):
  ```js
  export function findDuplicateProduto(nomeProduto, produtos, threshold = 0.7)
  ```
  Retorna `{ produto, score }` do melhor match acima do threshold, ou `null`.

- **`js/render.js`** (modificado): nova função `renderDuplicateBadge(match)`
  — se `match`, mostra `⚠ Possível duplicata: "{nome}" já está na tabela com
  quantidade {quantidade}.`; se `null`, esconde o badge (`hidden = true`).

- **`index.html`** (modificado): novo elemento `<div id="duplicate-badge"
  class="badge" hidden></div>`, junto do `#catalog-badge` existente no card
  de preview.

- **`js/app.js`** (modificado): no mesmo ponto onde `currentMatch` (catálogo)
  é calculado após a IA responder, calcula também
  `findDuplicateProduto(nome_produto, produtos)` e chama
  `renderDuplicateBadge(...)`. No reset (nova foto selecionada) e no catch
  de erro da IA, o badge volta pro estado escondido (mesmo padrão do badge
  de catálogo).

## Fluxo

1. IA responde com `nome_produto` + `tipo`.
2. App calcula `currentMatch` (catálogo) — já existe.
3. App calcula `findDuplicateProduto(nome_produto, produtos)` — novo.
4. Ambos os badges renderizam lado a lado no preview.
5. Usuário confere, edita se quiser, preenche quantidade, clica "Adicionar"
   — envio segue normalmente independente do aviso de duplicata.

## Testes

`tests/duplicateCheck.test.js` (TDD, `node:test`), cobrindo: match acima do
threshold, nenhum match (produtos vazios ou nomes muito diferentes), e um
caso de dois produtos parecidos mas distintos que NÃO devem disparar aviso
(prova de que 0.7 é mais rígido que o 0.35 do catálogo).

## Decisões já tomadas (não reabrir sem motivo novo)

- Fuzzy match (não exato).
- Aviso não bloqueia o envio.
- Threshold 0.7, distinto do 0.35 usado pro catálogo.
- Check roda uma vez, no momento da resposta da IA — não recalcula em
  edição manual do nome.
