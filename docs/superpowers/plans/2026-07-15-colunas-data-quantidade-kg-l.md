# Colunas Data de Criação e Quantidade (KG/L) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar duas colunas (tabela + export): quando o item foi criado,
e o total em KG/L calculado a partir do peso/volume por unidade (que a IA
passa a retornar) multiplicado pela quantidade de unidades contadas.

**Architecture:** A IA (`api/analyze.js`) passa a devolver dois campos
novos — `peso_volume_unidade` (número ou `null`) e `unidade_medida` (`g`,
`ml`, `kg`, `l` ou `null`) — lidos direto da embalagem, sem parsear o nome.
Dois módulos puros e testados fazem o resto: `js/quantidadeTotal.js`
calcula o total em kg/l, `js/format.js` formata os dois valores (data e
quantidade total) pra exibição. `js/render.js` e `js/xlsxExport.js`
consomem os dois módulos; `js/app.js` carrega os campos novos no
preview/edição.

**Tech Stack:** JS vanilla (ES modules), `node:test` — mesmo padrão do
resto do projeto.

## Global Constraints

- Peso/volume por unidade vem da IA (campo separado no JSON), nunca
  parseado do nome via regex.
- Conversão: `g` e `ml` dividem por 1000 (viram kg/l); `kg` e `l` ficam como
  estão.
- Sem peso/unidade → mostra `-`, nunca bloqueia adicionar/editar.
- Peso/volume e unidade são preenchidos juntos ou os dois ficam vazios —
  nunca um só (validado no app e reforçado com constraint no banco).
- Formato de data: `dd/mm/aaaa hh:mm`, fuso horário local do navegador.
- Formato de quantidade total: `"12.500 kg"` (3 casas decimais) ou `"-"`.
- Editável no preview (antes de enviar) e no fluxo de editar depois — igual
  nome/tipo/quantidade já são hoje.

---

## Task 1: Migração do banco (2 colunas novas)

**Files:**
- Modify: `supabase/schema.sql`

**Interfaces:**
- Produces: colunas `produtos.peso_volume_unidade` (numeric, nullable) e
  `produtos.unidade_medida` (text, nullable, `check in ('g','ml','kg','l')`),
  com constraint de par (`(peso_volume_unidade is null) = (unidade_medida
  is null)`). Consumidas por todas as tasks seguintes.

- [ ] **Step 1: Aplicar a migração no projeto Supabase já provisionado**

Use a ferramenta MCP do Supabase (`apply_migration`), projeto
`ggnihhekkboexpnzxnhf`, `name: "produtos_peso_volume_unidade"`:

```sql
alter table produtos add column peso_volume_unidade numeric check (peso_volume_unidade is null or peso_volume_unidade > 0);
alter table produtos add column unidade_medida text check (unidade_medida is null or unidade_medida in ('g', 'ml', 'kg', 'l'));
alter table produtos add constraint peso_volume_unidade_par check ((peso_volume_unidade is null) = (unidade_medida is null));
```

Se a ferramenta MCP não estiver disponível, aplique o mesmo SQL pelo SQL
Editor do dashboard do Supabase.

- [ ] **Step 2: Verificar**

Use `list_tables` (ou o dashboard) no projeto `ggnihhekkboexpnzxnhf` e
confirme que `produtos` tem as duas colunas novas e a constraint de par.

- [ ] **Step 3: Atualizar `supabase/schema.sql`**

Substituir todo o conteúdo do arquivo por:

```sql
create table if not exists produtos (
  id bigint generated always as identity primary key,
  nome text not null,
  tipo text not null check (tipo in ('seco', 'resfriado', 'congelado')),
  quantidade integer not null check (quantidade >= 0),
  produto_novo boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  peso_volume_unidade numeric check (peso_volume_unidade is null or peso_volume_unidade > 0),
  unidade_medida text check (unidade_medida is null or unidade_medida in ('g', 'ml', 'kg', 'l')),
  constraint peso_volume_unidade_par check ((peso_volume_unidade is null) = (unidade_medida is null))
);

alter table produtos enable row level security;

create policy "produtos_select_public" on produtos for select using (true);
create policy "produtos_insert_public" on produtos for insert with check (true);
create policy "produtos_update_public" on produtos for update using (true);

alter publication supabase_realtime add table produtos;

create table if not exists catalogo_produtos (
  id bigint generated always as identity primary key,
  marca text,
  produto text not null,
  unidades text[] not null default '{}'
);

alter table catalogo_produtos enable row level security;

create policy "catalogo_produtos_select_public" on catalogo_produtos for select using (true);
```

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat: add peso_volume_unidade and unidade_medida columns to produtos"
```

---

## Task 2: Módulo quantidadeTotal (TDD)

**Files:**
- Create: `js/quantidadeTotal.js`
- Test: `tests/quantidadeTotal.test.js`

**Interfaces:**
- Produces: `calcularQuantidadeTotal(pesoVolumeUnidade: number | null,
  unidadeMedida: 'g'|'ml'|'kg'|'l' | null, quantidade: number): {valor:
  number, unidade: 'kg'|'l'} | null`. Consumido pelo Task 3
  (`js/format.js`), Task 6 (`js/xlsxExport.js`) e Task 7 (`js/render.js`).

- [ ] **Step 1: Escrever os testes (devem falhar)**

Criar `tests/quantidadeTotal.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularQuantidadeTotal } from '../js/quantidadeTotal.js';

test('converte gramas pra kg (multiplica por quantidade, divide por 1000)', () => {
  assert.deepEqual(calcularQuantidadeTotal(500, 'g', 3), { valor: 1.5, unidade: 'kg' });
});

test('converte mililitros pra litros', () => {
  assert.deepEqual(calcularQuantidadeTotal(250, 'ml', 10), { valor: 2.5, unidade: 'l' });
});

test('kg já vem pronto, só multiplica pela quantidade', () => {
  assert.deepEqual(calcularQuantidadeTotal(5, 'kg', 2), { valor: 10, unidade: 'kg' });
});

test('litro já vem pronto, só multiplica pela quantidade', () => {
  assert.deepEqual(calcularQuantidadeTotal(1, 'l', 6), { valor: 6, unidade: 'l' });
});

test('retorna null quando peso/volume é null', () => {
  assert.equal(calcularQuantidadeTotal(null, null, 5), null);
});

test('retorna null quando unidade é null mesmo com peso/volume preenchido', () => {
  assert.equal(calcularQuantidadeTotal(250, null, 5), null);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test tests/quantidadeTotal.test.js`
Expected: FAIL — `Cannot find module '../js/quantidadeTotal.js'`

- [ ] **Step 3: Implementar `js/quantidadeTotal.js`**

```js
export function calcularQuantidadeTotal(pesoVolumeUnidade, unidadeMedida, quantidade) {
  if (pesoVolumeUnidade == null || !unidadeMedida) {
    return null;
  }
  const totalBruto = pesoVolumeUnidade * quantidade;
  if (unidadeMedida === 'g') {
    return { valor: totalBruto / 1000, unidade: 'kg' };
  }
  if (unidadeMedida === 'ml') {
    return { valor: totalBruto / 1000, unidade: 'l' };
  }
  if (unidadeMedida === 'kg') {
    return { valor: totalBruto, unidade: 'kg' };
  }
  if (unidadeMedida === 'l') {
    return { valor: totalBruto, unidade: 'l' };
  }
  return null;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test tests/quantidadeTotal.test.js`
Expected: PASS (6 testes)

- [ ] **Step 5: Commit**

```bash
git add js/quantidadeTotal.js tests/quantidadeTotal.test.js
git commit -m "feat: add total kg/l calculation from per-unit weight/volume"
```

---

## Task 3: Módulo format (TDD)

**Files:**
- Create: `js/format.js`
- Test: `tests/format.test.js`

**Interfaces:**
- Consumes: `calcularQuantidadeTotal` de `js/quantidadeTotal.js` (Task 2) —
  usado só dentro do teste, pra montar o input de `formatQuantidadeTotal`.
- Produces: `formatDataHora(isoString: string): string` (formato `"dd/mm/aaaa
  hh:mm"`) e `formatQuantidadeTotal(resultado: {valor, unidade} | null):
  string`. Consumidos pelo Task 6 (`js/xlsxExport.js`) e Task 7
  (`js/render.js`).

**Nota sobre o teste de `formatDataHora`:** a função usa o fuso horário
local de onde ela roda (navegador do usuário, ou o processo `node` que
rodar os testes) — não converte pra UTC nem fixa um fuso. Isso significa
que o valor exato formatado depende de onde o teste roda, então o teste
**não** compara contra uma string fixa; ele monta o valor esperado usando os
mesmos métodos (`getDate`/`getMonth`/`getFullYear`/`getHours`/`getMinutes`)
que a implementação usa, e separadamente confirma o formato (`dd/mm/aaaa
hh:mm`) via regex, que esse sim é fixo independente de fuso.

- [ ] **Step 1: Escrever os testes (devem falhar)**

Criar `tests/format.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDataHora, formatQuantidadeTotal } from '../js/format.js';
import { calcularQuantidadeTotal } from '../js/quantidadeTotal.js';

test('formatDataHora segue o formato dd/mm/aaaa hh:mm', () => {
  const resultado = formatDataHora('2026-07-15T17:32:00.000Z');
  assert.match(resultado, /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
});

test('formatDataHora usa os campos locais da data (dia/mês/ano/hora/minuto com zero à esquerda)', () => {
  const iso = '2026-07-15T17:32:00.000Z';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  const esperado = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  assert.equal(formatDataHora(iso), esperado);
});

test('formatQuantidadeTotal formata com 3 casas decimais e a unidade', () => {
  const resultado = calcularQuantidadeTotal(500, 'g', 3);
  assert.equal(formatQuantidadeTotal(resultado), '1.500 kg');
});

test('formatQuantidadeTotal retorna "-" quando o resultado é null', () => {
  assert.equal(formatQuantidadeTotal(null), '-');
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test tests/format.test.js`
Expected: FAIL — `Cannot find module '../js/format.js'`

- [ ] **Step 3: Implementar `js/format.js`**

```js
export function formatDataHora(isoString) {
  const d = new Date(isoString);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatQuantidadeTotal(resultado) {
  if (!resultado) {
    return '-';
  }
  return `${resultado.valor.toFixed(3)} ${resultado.unidade}`;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test tests/format.test.js`
Expected: PASS (4 testes)

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS (26 testes — 16 já existentes + 6 de quantidadeTotal + 4 de format)

- [ ] **Step 6: Commit**

```bash
git add js/format.js tests/format.test.js
git commit -m "feat: add display formatting for date and total quantity"
```

---

## Task 4: Campos novos em analyzeSchema

**Files:**
- Modify: `js/analyzeSchema.js`
- Modify: `tests/analyzeSchema.test.js`

**Interfaces:**
- Produces: `UNIDADES_VALIDAS: string[]` (`['g', 'ml', 'kg', 'l']`);
  `parseAnalyzeResponse` agora retorna também `peso_volume_unidade: number
  | null` e `unidade_medida: 'g'|'ml'|'kg'|'l' | null`. Consumido pelo
  Task 5 (`api/analyze.js`, só `UNIDADES_VALIDAS`) e pelo Task 8
  (`js/app.js`, o formato do retorno).

- [ ] **Step 1: Atualizar os testes existentes + adicionar os novos (devem falhar)**

Substituir todo o conteúdo de `tests/analyzeSchema.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAnalyzeResponse } from '../js/analyzeSchema.js';

test('parseia resposta JSON válida', () => {
  const result = parseAnalyzeResponse('{"nome_produto": "REDBULL LATA 250ML", "tipo": "resfriado"}');
  assert.deepEqual(result, {
    nome_produto: 'REDBULL LATA 250ML',
    tipo: 'resfriado',
    peso_volume_unidade: null,
    unidade_medida: null,
  });
});

test('remove cercas de markdown antes de parsear', () => {
  const result = parseAnalyzeResponse('```json\n{"nome_produto": "ACAI POLPA 1KG", "tipo": "congelado"}\n```');
  assert.deepEqual(result, {
    nome_produto: 'ACAI POLPA 1KG',
    tipo: 'congelado',
    peso_volume_unidade: null,
    unidade_medida: null,
  });
});

test('lança erro em JSON inválido', () => {
  assert.throws(() => parseAnalyzeResponse('não é json'), /JSON válido/);
});

test('lança erro quando falta nome_produto', () => {
  assert.throws(() => parseAnalyzeResponse('{"tipo": "seco"}'), /nome_produto/);
});

test('lança erro quando tipo é inválido', () => {
  assert.throws(() => parseAnalyzeResponse('{"nome_produto": "X", "tipo": "quente"}'), /tipo/);
});

test('parseia peso_volume_unidade e unidade_medida quando presentes', () => {
  const result = parseAnalyzeResponse(
    '{"nome_produto": "REDBULL LATA 250ML", "tipo": "resfriado", "peso_volume_unidade": 250, "unidade_medida": "ml"}'
  );
  assert.deepEqual(result, {
    nome_produto: 'REDBULL LATA 250ML',
    tipo: 'resfriado',
    peso_volume_unidade: 250,
    unidade_medida: 'ml',
  });
});

test('lança erro quando unidade_medida é inválida', () => {
  assert.throws(
    () => parseAnalyzeResponse('{"nome_produto": "X", "tipo": "seco", "peso_volume_unidade": 5, "unidade_medida": "litro"}'),
    /unidade_medida/
  );
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test tests/analyzeSchema.test.js`
Expected: FAIL — os 2 primeiros testes falham por `deepEqual` (faltam
`peso_volume_unidade`/`unidade_medida` no retorno atual); os 2 novos falham
porque o campo ainda não é validado.

- [ ] **Step 3: Implementar em `js/analyzeSchema.js`**

Substituir todo o conteúdo do arquivo:

```js
export const TIPOS_VALIDOS = ['seco', 'resfriado', 'congelado'];
export const UNIDADES_VALIDAS = ['g', 'ml', 'kg', 'l'];

export function parseAnalyzeResponse(raw) {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();

  let data;
  try {
    data = JSON.parse(cleaned);
  } catch {
    throw new Error('Resposta da IA não é um JSON válido');
  }

  if (typeof data.nome_produto !== 'string' || !data.nome_produto.trim()) {
    throw new Error('nome_produto ausente ou inválido');
  }
  if (!TIPOS_VALIDOS.includes(data.tipo)) {
    throw new Error('tipo ausente ou inválido');
  }

  const pesoVolumeUnidade = data.peso_volume_unidade ?? null;
  if (pesoVolumeUnidade !== null && typeof pesoVolumeUnidade !== 'number') {
    throw new Error('peso_volume_unidade inválido');
  }

  const unidadeMedida = data.unidade_medida ?? null;
  if (unidadeMedida !== null && !UNIDADES_VALIDAS.includes(unidadeMedida)) {
    throw new Error('unidade_medida inválida');
  }

  return {
    nome_produto: data.nome_produto.trim(),
    tipo: data.tipo,
    peso_volume_unidade: pesoVolumeUnidade,
    unidade_medida: unidadeMedida,
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test tests/analyzeSchema.test.js`
Expected: PASS (7 testes)

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS (28 testes — 26 do Task 3 + 2 novos aqui, já que 2 dos 5
testes antigos foram atualizados, não adicionados)

- [ ] **Step 6: Commit**

```bash
git add js/analyzeSchema.js tests/analyzeSchema.test.js
git commit -m "feat: validate peso_volume_unidade and unidade_medida in AI response"
```

---

## Task 5: Prompt da IA pede peso/volume por unidade

**Files:**
- Modify: `api/analyze.js`

**Interfaces:**
- Consumes: `UNIDADES_VALIDAS` de `js/analyzeSchema.js` (Task 4).

- [ ] **Step 1: Atualizar `api/analyze.js`**

Substituir todo o conteúdo do arquivo:

```js
import Anthropic from '@anthropic-ai/sdk';
import { parseAnalyzeResponse, TIPOS_VALIDOS, UNIDADES_VALIDAS } from '../js/analyzeSchema.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MAX_BASE64_LENGTH = 6_000_000;

const SYSTEM_PROMPT = `Você analisa fotos de produtos de um estoque de supermercado/restaurante.
Responda SOMENTE com um JSON, sem markdown, no formato exato:
{"nome_produto": "MARCA PRODUTO EMBALAGEM", "tipo": "seco", "peso_volume_unidade": 250, "unidade_medida": "ml"}

Regras pro campo "nome_produto":
- Maiúsculo, compacto, no estilo "REDBULL LATA 250ML" ou "MAIONESE HELLMANS 500G".
- Inclua marca (se visível), descrição do produto e tamanho/embalagem (se visível).

Regras pro campo "tipo": deve ser exatamente um destes valores: ${TIPOS_VALIDOS.join(', ')}.
- "congelado": produto visivelmente congelado ou de freezer/embalagem para congelados.
- "resfriado": produto de geladeira/refrigerado (laticínios, frios, bebidas geladas, etc).
- "seco": mantimento de prateleira, não perecível na embalagem original.

Regras pros campos "peso_volume_unidade" e "unidade_medida":
- "peso_volume_unidade": o peso ou volume de UMA unidade do produto (não multiplique pela quantidade de unidades), como número (ex: 250, 500, 5).
- "unidade_medida": deve ser exatamente um destes valores: ${UNIDADES_VALIDAS.join(', ')}, correspondendo à unidade lida na embalagem (gramas, mililitros, quilos ou litros).
- Se a embalagem não mostrar peso ou volume (ex: produto vendido por unidade/peça, sem peso declarado), responda "peso_volume_unidade": null e "unidade_medida": null. Não invente um valor.

Se não conseguir identificar algo com confiança, faça sua melhor estimativa —
nunca deixe de responder no formato JSON pedido.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { imageBase64, mediaType } = req.body ?? {};
  if (!imageBase64 || !mediaType) {
    res.status(400).json({ error: 'imageBase64 e mediaType são obrigatórios' });
    return;
  }
  if (imageBase64.length > MAX_BASE64_LENGTH) {
    res.status(413).json({ error: 'Imagem muito grande' });
    return;
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1024,
      thinking: { type: 'disabled' },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: 'Analise esta foto de produto de estoque.' },
          ],
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === 'text');
    const parsed = parseAnalyzeResponse(textBlock?.text ?? '');
    res.status(200).json(parsed);
  } catch (err) {
    res.status(502).json({ error: err.message || 'Falha ao analisar imagem' });
  }
}
```

- [ ] **Step 2: Verificar sintaxe**

Run: `node --check api/analyze.js`
Expected: sem erro (nenhuma saída)

- [ ] **Step 3: Verificar os guard clauses (sem precisar de API key real)**

```bash
node --input-type=module -e "
import handler from './api/analyze.js';
function makeRes() {
  const res = { statusCode: null, body: null, status(c){this.statusCode=c;return this;}, json(p){this.body=p;return this;} };
  return res;
}
let res = makeRes();
await handler({ method: 'GET', body: {} }, res);
console.log('GET:', res.statusCode, res.body);
res = makeRes();
await handler({ method: 'POST', body: {} }, res);
console.log('missing fields:', res.statusCode, res.body);
"
```

Expected: `GET: 405 { error: 'Method not allowed' }` e `missing fields: 400
{ error: 'imageBase64 e mediaType são obrigatórios' }` — prova que a
mudança no prompt não quebrou os guard clauses (eles retornam antes de
qualquer chamada à IA, então não precisam de `ANTHROPIC_API_KEY`).

- [ ] **Step 4: Commit**

```bash
git add api/analyze.js
git commit -m "feat: ask Claude vision for per-unit weight/volume"
```

---

## Task 6: Colunas novas no export

**Files:**
- Modify: `js/xlsxExport.js`
- Modify: `tests/xlsxExport.test.js`

**Interfaces:**
- Consumes: `calcularQuantidadeTotal` de `js/quantidadeTotal.js` (Task 2);
  `formatDataHora`, `formatQuantidadeTotal` de `js/format.js` (Task 3).
- Produces: `buildExportRows` agora inclui as chaves `'DATA DE CRIAÇÃO'` e
  `'QUANTIDADE (KG/L)'` em cada linha, além das 4 já existentes.

- [ ] **Step 1: Atualizar os testes (devem falhar)**

Substituir todo o conteúdo de `tests/xlsxExport.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildExportRows } from '../js/xlsxExport.js';
import { formatDataHora } from '../js/format.js';

test('ordena por created_at e renumera ID sequencialmente', () => {
  const produtos = [
    {
      id: 5,
      nome: 'MAIONESE HELLMANS 500G',
      quantidade: 3,
      tipo: 'seco',
      created_at: '2026-07-14T10:05:00Z',
      peso_volume_unidade: 500,
      unidade_medida: 'g',
    },
    {
      id: 2,
      nome: 'REDBULL LATA 250ML',
      quantidade: 10,
      tipo: 'resfriado',
      created_at: '2026-07-14T09:00:00Z',
      peso_volume_unidade: 250,
      unidade_medida: 'ml',
    },
  ];
  assert.deepEqual(buildExportRows(produtos), [
    {
      ID: 1,
      'NOME DO PRODUTO': 'REDBULL LATA 250ML',
      QUANTIDADE: 10,
      TIPO: 'resfriado',
      'DATA DE CRIAÇÃO': formatDataHora('2026-07-14T09:00:00Z'),
      'QUANTIDADE (KG/L)': '2.500 l',
    },
    {
      ID: 2,
      'NOME DO PRODUTO': 'MAIONESE HELLMANS 500G',
      QUANTIDADE: 3,
      TIPO: 'seco',
      'DATA DE CRIAÇÃO': formatDataHora('2026-07-14T10:05:00Z'),
      'QUANTIDADE (KG/L)': '1.500 kg',
    },
  ]);
});

test('lista vazia retorna array vazio', () => {
  assert.deepEqual(buildExportRows([]), []);
});

test('não deixa buraco de ID após exclusão (linha ausente simplesmente não entra)', () => {
  const produtos = [
    { id: 1, nome: 'A', quantidade: 1, tipo: 'seco', created_at: '2026-07-14T09:00:00Z' },
    { id: 3, nome: 'C', quantidade: 3, tipo: 'congelado', created_at: '2026-07-14T09:02:00Z' },
  ];
  const result = buildExportRows(produtos);
  assert.deepEqual(result.map((r) => r.ID), [1, 2]);
});

test('produto sem peso/volume mostra "-" na coluna de quantidade total', () => {
  const produtos = [
    { id: 1, nome: 'ABACATE', quantidade: 5, tipo: 'resfriado', created_at: '2026-07-14T09:00:00Z' },
  ];
  const result = buildExportRows(produtos);
  assert.equal(result[0]['QUANTIDADE (KG/L)'], '-');
});
```

(A terceira teste, "não deixa buraco de ID...", continua sem
`peso_volume_unidade`/`unidade_medida` nos fixtures de propósito — ela só
confere a sequência de `ID`, não a linha inteira, então não precisa dos
campos novos. O quarto teste, novo, cobre exatamente esse caso de fixture
sem os campos.)

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test tests/xlsxExport.test.js`
Expected: FAIL — o primeiro teste falha por `deepEqual` (faltam as 2
colunas novas no retorno atual); o quarto teste falha porque a chave
`'QUANTIDADE (KG/L)'` ainda não existe.

- [ ] **Step 3: Implementar em `js/xlsxExport.js`**

Substituir todo o conteúdo do arquivo:

```js
import { calcularQuantidadeTotal } from './quantidadeTotal.js';
import { formatDataHora, formatQuantidadeTotal } from './format.js';

export function buildExportRows(produtos) {
  const sorted = [...produtos].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );
  return sorted.map((p, index) => ({
    ID: index + 1,
    'NOME DO PRODUTO': p.nome,
    QUANTIDADE: p.quantidade,
    TIPO: p.tipo,
    'DATA DE CRIAÇÃO': formatDataHora(p.created_at),
    'QUANTIDADE (KG/L)': formatQuantidadeTotal(
      calcularQuantidadeTotal(p.peso_volume_unidade, p.unidade_medida, p.quantidade)
    ),
  }));
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test tests/xlsxExport.test.js`
Expected: PASS (4 testes)

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS (29 testes)

- [ ] **Step 6: Commit**

```bash
git add js/xlsxExport.js tests/xlsxExport.test.js
git commit -m "feat: add creation date and total kg/l columns to xlsx export"
```

---

## Task 7: Colunas novas na tabela + campos no preview

**Files:**
- Modify: `index.html`
- Modify: `js/render.js`

**Interfaces:**
- Consumes: `calcularQuantidadeTotal` de `js/quantidadeTotal.js` (Task 2);
  `formatDataHora`, `formatQuantidadeTotal` de `js/format.js` (Task 3).
- Produces: elementos `#preview-peso-volume` (input) e `#preview-unidade`
  (select) em `index.html`, consumidos pelo Task 8 (`js/app.js`).

- [ ] **Step 1: Atualizar `index.html`**

Encontrar o cabeçalho da tabela:

```html
        <thead>
          <tr>
            <th>Nome</th>
            <th>Tipo</th>
            <th>Quantidade</th>
            <th></th>
          </tr>
        </thead>
```

Substituir por:

```html
        <thead>
          <tr>
            <th>Nome</th>
            <th>Tipo</th>
            <th>Quantidade</th>
            <th>Criado em</th>
            <th>Qtd (KG/L)</th>
            <th></th>
          </tr>
        </thead>
```

Encontrar o campo de quantidade no preview:

```html
        <label>Quantidade
          <input type="text" id="preview-quantidade" inputmode="numeric" pattern="[0-9]*" />
        </label>
        <button id="add-btn">Adicionar</button>
```

Substituir por:

```html
        <label>Quantidade
          <input type="text" id="preview-quantidade" inputmode="numeric" pattern="[0-9]*" />
        </label>
        <label>Peso/volume por unidade
          <input type="text" id="preview-peso-volume" inputmode="decimal" />
        </label>
        <label>Unidade
          <select id="preview-unidade">
            <option value="">-</option>
            <option value="g">g</option>
            <option value="ml">ml</option>
            <option value="kg">kg</option>
            <option value="l">l</option>
          </select>
        </label>
        <button id="add-btn">Adicionar</button>
```

- [ ] **Step 2: Atualizar `renderTable` em `js/render.js`**

No topo do arquivo, adicionar os imports:

```js
import { calcularQuantidadeTotal } from './quantidadeTotal.js';
import { formatDataHora, formatQuantidadeTotal } from './format.js';
```

Dentro de `renderTable`, encontrar o `tr.innerHTML`:

```js
    tr.innerHTML = `
      <td>${escapeHtml(p.nome)}</td>
      <td>${escapeHtml(p.tipo)}</td>
      <td>${p.quantidade}</td>
      <td class="col-acoes">
        <button class="edit-btn" type="button">Editar</button>
        <button class="delete-btn" type="button">Excluir</button>
      </td>
    `;
```

Substituir por:

```js
    tr.innerHTML = `
      <td>${escapeHtml(p.nome)}</td>
      <td>${escapeHtml(p.tipo)}</td>
      <td>${p.quantidade}</td>
      <td>${formatDataHora(p.created_at)}</td>
      <td>${formatQuantidadeTotal(calcularQuantidadeTotal(p.peso_volume_unidade, p.unidade_medida, p.quantidade))}</td>
      <td class="col-acoes">
        <button class="edit-btn" type="button">Editar</button>
        <button class="delete-btn" type="button">Excluir</button>
      </td>
    `;
```

O resto do arquivo (`renderCatalogBadge`, `escapeHtml`,
`renderDuplicateBadge`) fica igual.

- [ ] **Step 3: Verificar sintaxe**

Run: `node --check js/render.js`
Expected: sem erro (nenhuma saída)

- [ ] **Step 4: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS (29 testes — este task não adiciona teste novo, só reusa
módulos já testados)

- [ ] **Step 5: Verificar manualmente (visual, sem foto real)**

```bash
npx --yes serve -l 4174 . &
sleep 2
curl -s http://localhost:4174/ | grep -o 'preview-peso-volume\|preview-unidade\|Criado em\|Qtd (KG/L)'
```

Expected: as 4 strings aparecem na saída, confirmando que os elementos
novos existem no HTML servido.

- [ ] **Step 6: Commit**

```bash
git add index.html js/render.js
git commit -m "feat: add creation date and total kg/l columns to the table, plus preview inputs"
```

---

## Task 8: Wiring completo em app.js

**Files:**
- Modify: `js/app.js`

**Interfaces:**
- Consumes: `#preview-peso-volume`, `#preview-unidade` de `index.html`
  (Task 7); retorno de `parseAnalyzeResponse` agora incluindo
  `peso_volume_unidade`/`unidade_medida` (Task 4, via `/api/analyze`,
  Task 5).

- [ ] **Step 1: Substituir todo o conteúdo de `js/app.js`**

```js
import { supabase } from './supabaseClient.js';
import { findCatalogMatch } from './catalogMatch.js';
import { findDuplicateProduto } from './duplicateCheck.js';
import { renderCatalogBadge, renderDuplicateBadge, renderTable } from './render.js';
import { buildExportRows } from './xlsxExport.js';

const UNIDADES_VALIDAS = ['g', 'ml', 'kg', 'l'];

let catalogo = [];
let produtos = [];
let currentMatch = null;

const photoInput = document.getElementById('photo-input');
const previewSection = document.getElementById('preview-section');
const previewNome = document.getElementById('preview-nome');
const previewTipo = document.getElementById('preview-tipo');
const previewQuantidade = document.getElementById('preview-quantidade');
const previewPesoVolume = document.getElementById('preview-peso-volume');
const previewUnidade = document.getElementById('preview-unidade');
const addBtn = document.getElementById('add-btn');
const exportBtn = document.getElementById('export-btn');
const toast = document.getElementById('toast');

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  toast.className = 'toast toast-error';
  setTimeout(() => { toast.hidden = true; }, 4000);
}

function resizeImageForUpload(file, maxDimension = 1024, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler arquivo de imagem'));
    reader.onload = () => {
      img.onerror = () => reject(new Error('Falha ao carregar imagem'));
      img.onload = () => {
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve({ base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function handlePhotoSelected(event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;

  addBtn.disabled = true;
  previewSection.hidden = false;
  previewNome.value = '';
  previewTipo.value = 'seco';
  previewQuantidade.value = '';
  previewPesoVolume.value = '';
  previewUnidade.value = '';
  currentMatch = null;
  renderCatalogBadge(null);
  renderDuplicateBadge(null);

  try {
    const { base64, mediaType } = await resizeImageForUpload(file);
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64, mediaType }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Erro ${response.status}`);
    }
    const { nome_produto, tipo, peso_volume_unidade, unidade_medida } = await response.json();
    previewNome.value = nome_produto;
    previewTipo.value = tipo;
    previewPesoVolume.value = peso_volume_unidade ?? '';
    previewUnidade.value = unidade_medida ?? '';
    currentMatch = findCatalogMatch(nome_produto, catalogo);
    renderCatalogBadge(currentMatch);
    renderDuplicateBadge(findDuplicateProduto(nome_produto, produtos));
  } catch (err) {
    showToast(`Não deu pra analisar a foto: ${err.message}. Preencha manualmente.`);
  } finally {
    addBtn.disabled = false;
  }
}

async function handleAdd() {
  const nome = previewNome.value.trim();
  const tipo = previewTipo.value;
  const quantidadeStr = previewQuantidade.value.trim();
  const quantidade = Number(quantidadeStr);
  const pesoVolumeStr = previewPesoVolume.value.trim();
  const unidadeMedida = previewUnidade.value || null;

  if (!nome) return showToast('Preencha o nome do produto.');
  if (!quantidadeStr || !Number.isFinite(quantidade) || quantidade < 0) return showToast('Preencha uma quantidade válida.');

  let pesoVolumeUnidade = null;
  if (pesoVolumeStr || unidadeMedida) {
    if (!pesoVolumeStr || !unidadeMedida) {
      return showToast('Preencha peso/volume e unidade juntos, ou deixe os dois em branco.');
    }
    pesoVolumeUnidade = Number(pesoVolumeStr.replace(',', '.'));
    if (!Number.isFinite(pesoVolumeUnidade) || pesoVolumeUnidade <= 0) {
      return showToast('Peso/volume por unidade inválido.');
    }
  }

  addBtn.disabled = true;
  try {
    const { error } = await supabase.from('produtos').insert({
      nome,
      tipo,
      quantidade,
      produto_novo: currentMatch === null,
      peso_volume_unidade: pesoVolumeUnidade,
      unidade_medida: unidadeMedida,
    });
    if (error) throw error;
    previewSection.hidden = true;
  } catch (err) {
    showToast(`Erro ao adicionar: ${err.message}`);
  } finally {
    addBtn.disabled = false;
  }
}

async function onEditProduto(produto) {
  const novoNome = window.prompt('Nome do produto:', produto.nome);
  if (novoNome === null) return;
  const novoTipo = window.prompt('Tipo (seco/resfriado/congelado):', produto.tipo);
  if (novoTipo === null) return;
  if (!['seco', 'resfriado', 'congelado'].includes(novoTipo)) {
    window.alert('Tipo inválido. Use: seco, resfriado ou congelado.');
    return;
  }
  const novaQuantidadeStr = window.prompt('Quantidade:', String(produto.quantidade));
  if (novaQuantidadeStr === null) return;
  const novaQuantidade = Number(novaQuantidadeStr);
  if (!Number.isFinite(novaQuantidade) || novaQuantidade < 0) {
    window.alert('Quantidade inválida.');
    return;
  }
  const novoPesoVolumeStr = window.prompt(
    'Peso/volume por unidade (deixe em branco se não souber):',
    produto.peso_volume_unidade != null ? String(produto.peso_volume_unidade) : ''
  );
  if (novoPesoVolumeStr === null) return;
  const novaUnidadeStr = window.prompt(
    'Unidade (g/ml/kg/l — deixe em branco se peso/volume estiver em branco):',
    produto.unidade_medida ?? ''
  );
  if (novaUnidadeStr === null) return;

  const pesoVolumeTrim = novoPesoVolumeStr.trim();
  const unidadeTrim = novaUnidadeStr.trim();
  let novoPesoVolumeUnidade = null;
  let novaUnidadeFinal = null;
  if (pesoVolumeTrim || unidadeTrim) {
    if (!pesoVolumeTrim || !unidadeTrim || !UNIDADES_VALIDAS.includes(unidadeTrim)) {
      window.alert('Preencha peso/volume e uma unidade válida (g/ml/kg/l) juntos, ou deixe os dois em branco.');
      return;
    }
    novoPesoVolumeUnidade = Number(pesoVolumeTrim.replace(',', '.'));
    if (!Number.isFinite(novoPesoVolumeUnidade) || novoPesoVolumeUnidade <= 0) {
      window.alert('Peso/volume por unidade inválido.');
      return;
    }
    novaUnidadeFinal = unidadeTrim;
  }

  const { error } = await supabase
    .from('produtos')
    .update({
      nome: novoNome.trim(),
      tipo: novoTipo,
      quantidade: novaQuantidade,
      peso_volume_unidade: novoPesoVolumeUnidade,
      unidade_medida: novaUnidadeFinal,
    })
    .eq('id', produto.id);
  if (error) window.alert(`Erro ao salvar: ${error.message}`);
}

async function onDeleteProduto(produto) {
  if (!window.confirm(`Excluir "${produto.nome}"?`)) return;
  const { error } = await supabase
    .from('produtos')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', produto.id);
  if (error) window.alert(`Erro ao excluir: ${error.message}`);
}

function applyRealtimeChange(payload) {
  if (payload.eventType === 'INSERT') {
    if (payload.new.deleted_at) return;
    produtos = [...produtos, payload.new].sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at)
    );
  } else if (payload.eventType === 'UPDATE') {
    if (payload.new.deleted_at) {
      produtos = produtos.filter((p) => p.id !== payload.new.id);
    } else {
      produtos = produtos.map((p) => (p.id === payload.new.id ? payload.new : p));
    }
  } else if (payload.eventType === 'DELETE') {
    produtos = produtos.filter((p) => p.id !== payload.old.id);
  }
  renderTable(produtos, { onEdit: onEditProduto, onDelete: onDeleteProduto });
}

function exportToXlsx(rows) {
  const data = buildExportRows(rows);
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Estoque');
  const dateStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `contagem-estoque-${dateStr}.xlsx`);
}

async function init() {
  const { data: catalogData, error: catalogError } = await supabase.from('catalogo_produtos').select('*');
  if (catalogError) {
    console.warn('Catálogo não carregou, seguindo sem match:', catalogError.message);
  } else {
    catalogo = catalogData;
  }

  const { data: produtosData, error: produtosError } = await supabase
    .from('produtos')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (produtosError) {
    showToast(`Erro ao carregar tabela: ${produtosError.message}`);
  } else {
    produtos = produtosData;
  }
  renderTable(produtos, { onEdit: onEditProduto, onDelete: onDeleteProduto });

  supabase
    .channel('produtos-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'produtos' }, applyRealtimeChange)
    .subscribe();

  photoInput.addEventListener('change', handlePhotoSelected);
  addBtn.addEventListener('click', handleAdd);
  exportBtn.addEventListener('click', () => exportToXlsx(produtos));
}

init();
```

- [ ] **Step 2: Verificar sintaxe**

Run: `node --check js/app.js`
Expected: sem erro (nenhuma saída)

- [ ] **Step 3: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS (29 testes — este task não adiciona teste novo, é só
wiring de DOM)

- [ ] **Step 4: Verificar manualmente (real, precisa de foto/API key/deploy)**

Este é o teste de aceitação final da feature — só totalmente verificável no
app já deployado (precisa de câmera real e `ANTHROPIC_API_KEY`). Se
estiver rodando isso numa sessão sem esses recursos, valide o que der (
`node --check`, suíte de testes) e deixe claro no relatório que a
verificação real fica pro usuário: tirar foto de um produto com peso/volume
visível na embalagem, conferir que os campos de peso/volume/unidade vêm
preenchidos no preview, adicionar, conferir as colunas "Criado em" e "Qtd
(KG/L)" na tabela, editar um produto e confirmar que os dois novos prompts
aparecem, exportar e conferir as 2 colunas novas no xlsx.

- [ ] **Step 5: Commit**

```bash
git add js/app.js
git commit -m "feat: wire per-unit weight/volume into preview, add, and edit flows"
```
