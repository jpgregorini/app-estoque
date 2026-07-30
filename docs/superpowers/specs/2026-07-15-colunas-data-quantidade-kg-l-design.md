# Colunas "Data de Criação" e "Quantidade (KG/L)"

## Visão geral

A tabela e o export ganham duas colunas novas: quando o item foi criado
(`created_at`, já existe no banco, só nunca foi exibido) e o total em
KG/L daquele item — calculado a partir do peso/volume de **uma unidade**
do produto (que a IA lê da embalagem) multiplicado pela quantidade de
unidades já contada.

## Objetivo

Hoje "quantidade" conta unidades (ex: 10 latas), mas o nome do produto já
carrega o peso/volume de cada unidade (ex: "250ML"). Sem uma coluna de
total em KG/L, quem for consolidar a contagem depois tem que fazer essa
conta na mão, produto por produto.

## Fora de escopo (non-goals)

- Não recalcula a "Data de criação" — é só exibição do `created_at` que já
  existe.
- Não bloqueia adicionar/editar se a IA não conseguir identificar peso ou
  volume (ex: produto vendido solto/por peso variável) — fica em branco,
  editável depois.
- Não soma nem agrupa os totais em KG/L de vários produtos — cada linha
  mostra só o total daquela linha.
- Não infere peso/volume a partir do nome do produto por regex — vem
  sempre de um campo separado que a própria IA retorna.

## Arquitetura

### Peso/volume por unidade — vem da IA, não é parseado do nome

`api/analyze.js` passa a pedir, junto com `nome_produto` e `tipo`, mais dois
campos no JSON de resposta: `peso_volume_unidade` (número ou `null`) e
`unidade_medida` (`"g"`, `"ml"`, `"kg"`, `"l"` ou `null`) — o peso/volume de
uma única unidade do produto, lido da embalagem na foto. A IA já está
olhando a embalagem pra montar o nome; pedir os dois campos separados é
mais confiável do que tentar re-extrair essa informação depois de um texto
livre que ela mesma gerou (e que sobrevive a edição manual do nome).

### Cálculo do total — módulo puro testado

Novo módulo `js/quantidadeTotal.js`:

```js
export function calcularQuantidadeTotal(pesoVolumeUnidade, unidadeMedida, quantidade)
```

Retorna `{ valor: number, unidade: 'kg' | 'l' }` ou `null` se
`pesoVolumeUnidade`/`unidadeMedida` forem nulos. Regra: `total_bruto =
pesoVolumeUnidade * quantidade`; se a unidade for `g` ou `ml`, divide por
1000 (vira kg/l); se já for `kg` ou `l`, usa direto.

### Formatação — módulo puro testado, separado do cálculo

Novo módulo `js/format.js`, com duas funções puras usadas tanto pela tabela
(`js/render.js`) quanto pelo export (`js/xlsxExport.js`):

```js
export function formatDataHora(isoString)      // "15/07/2026 14:32"
export function formatQuantidadeTotal(resultado) // "12.500 kg" ou "-"
```

`formatDataHora` usa o fuso horário local do navegador (não converte pra UTC
nem pra um fuso fixo). `formatQuantidadeTotal` chama `calcularQuantidadeTotal`
por fora — recebe já o resultado (ou `null`) e só formata a string.

## Dados

### `produtos` — 2 colunas novas

| coluna | tipo | obs |
|---|---|---|
| `peso_volume_unidade` | numeric, nullable | peso/volume de 1 unidade do produto |
| `unidade_medida` | text, nullable | `check (unidade_medida is null or unidade_medida in ('g','ml','kg','l'))` |

Constraint adicional, mesmo estilo dos checks já existentes na tabela:
`check ((peso_volume_unidade is null) = (unidade_medida is null))` — os dois
campos são preenchidos juntos ou ficam os dois vazios, nunca um só.

`created_at` já existe, não muda.

## Componentes de tela

- **Preview** (`index.html` + `js/app.js`): dois campos novos, ao lado de
  quantidade — "Peso/volume por unidade" (`<input type="text"
  inputmode="decimal">`, mesmo padrão anti-bug mobile já usado em
  quantidade) e "Unidade" (`<select>`: opção vazia `-` + g/ml/kg/l).
  Preenchidos pela IA quando disponível, editáveis antes de enviar.
- **Tabela** (`js/render.js`): duas colunas novas — "Criado em"
  (`formatDataHora(p.created_at)`) e "Qtd (KG/L)"
  (`formatQuantidadeTotal(calcularQuantidadeTotal(p.peso_volume_unidade,
  p.unidade_medida, p.quantidade))`).
- **Editar** (`js/app.js`, `onEditProduto`): mais dois `prompt()` na
  sequência já existente (nome → tipo → quantidade → **peso/volume →
  unidade**), mesma validação de par (preenche os dois ou nenhum).
- **Export** (`js/xlsxExport.js`): duas colunas novas — `DATA DE CRIAÇÃO` e
  `QUANTIDADE (KG/L)`, mesmas funções de formatação da tabela.

## Fluxo

1. IA responde `{ nome_produto, tipo, peso_volume_unidade, unidade_medida }`.
2. Preview mostra os 4 campos preenchidos (peso/unidade podem vir `null` →
   campos ficam em branco/`-`, editáveis).
3. Usuário confere/edita, preenche quantidade, clica "Adicionar".
4. Validação no envio: peso/volume e unidade preenchidos juntos ou os dois
   vazios — se só um estiver preenchido, mostra erro e não envia.
5. Insert inclui os dois campos novos (ou `null`/`null`).
6. Tabela e export mostram "Criado em" (sempre) e "Qtd (KG/L)" (calculado
   ou `-`).

## Tratamento de erro

- IA não identifica peso/volume: campos ficam `null`/em branco no preview,
  igual qualquer outro campo que a IA não conseguiu extrair — não bloqueia.
- Usuário preenche só um dos dois campos (peso OU unidade, não os dois):
  toast de erro no "Adicionar", mesmo padrão de validação que já existe pra
  nome/quantidade.
- Mesma regra vale no fluxo de editar (`onEditProduto`).

## Testes

- `tests/quantidadeTotal.test.js` (novo): conversão g→kg, ml→l, kg direto,
  l direto, `null` quando peso ou unidade ausente.
- `tests/format.test.js` (novo): `formatDataHora` com uma data conhecida,
  `formatQuantidadeTotal` com resultado válido e com `null`.
- `tests/analyzeSchema.test.js` (atualiza): os 5 testes existentes passam a
  esperar `peso_volume_unidade: null, unidade_medida: null` no retorno
  quando esses campos não vierem na resposta da IA (retrocompatível); mais
  2 testes novos cobrindo `peso_volume_unidade`/`unidade_medida` válidos e
  inválidos.
- `tests/xlsxExport.test.js` (atualiza): fixtures de produto ganham
  `peso_volume_unidade`/`unidade_medida`/`created_at`, e as asserções
  passam a checar as 2 colunas novas (`DATA DE CRIAÇÃO`,
  `QUANTIDADE (KG/L)`) junto das 4 já existentes.

## Decisões já tomadas (não reabrir sem motivo novo)

- Peso/volume por unidade vem da IA (campo separado), não é parseado do
  nome via regex.
- Campo editável no preview e no fluxo de editar, igual nome/tipo/quantidade.
- Conversão: g→kg e ml→l dividindo por 1000; kg/l ficam como estão.
- Sem peso/unidade → coluna mostra `-`, não bloqueia nada.
- Par peso+unidade: preenche os dois juntos ou nenhum — nunca um só (checado
  no app e reforçado com constraint no banco).
- Formato de data: dd/mm/aaaa hh:mm, fuso local do navegador.
- Formato de quantidade: `"12.500 kg"` com 3 casas decimais.
