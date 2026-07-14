# Classificador de Produto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first web app where a stock-counting team photographs a
product, an AI (Claude vision) extracts its name and type (seco/resfriado/congelado),
the team confirms/edits and submits it into a live shared table, and exports the
final table as an `.xlsx`.

**Architecture:** Static vanilla HTML/CSS/JS (no framework, no build step) deployed
on Vercel. One Vercel serverless function (`/api/analyze`) proxies to the Claude
API so the API key never reaches the browser. Supabase (Postgres) holds the shared
`produtos` table (Realtime enabled) and a read-only reference `catalogo_produtos`
table seeded once from the user's existing spreadsheet, used for client-side fuzzy
matching. Export is generated entirely client-side with SheetJS.

**Tech Stack:** HTML/CSS/JS (ES modules, no bundler), Vercel serverless functions
(Node, `@anthropic-ai/sdk`), Supabase (`@supabase/supabase-js` v2, Postgres,
Realtime, RLS), SheetJS (CDN) for `.xlsx` export, Node's built-in `node:test` for
unit tests.

## Global Constraints

- Sem login/autenticação — link aberto, qualquer um com acesso usa direto.
- Existe só uma tabela de contagem ativa (sem histórico de contagens nomeadas).
- `tipo` é restrito a exatamente: `seco`, `resfriado`, `congelado`.
- O ID exportado no xlsx é sequencial recalculado (1..N por `created_at`), nunca o
  `id` fixo do banco (que pode ter buracos após exclusões).
- O aviso "Produto Novo no Banco de Dados" é informativo — nunca bloqueia o
  usuário de adicionar o item.
- Stack vanilla: sem React/Next.js/bundler/build step.
- Testes automatizados cobrem só lógica pura: fuzzy match do catálogo,
  renumeração/montagem das linhas do export, parsing do JSON da IA. O resto
  (câmera, fluxo de tela, realtime) é validado manualmente no navegador.
- `catalogo_produtos` não é editável pela UI — é seed único, feito por script.

---

## Task 1: Provisionar Supabase (schema + config pública)

**Files:**
- Create: `supabase/schema.sql`
- Create: `js/config.js`
- Create: `.gitignore`

**Interfaces:**
- Produces: tabelas Postgres `produtos` e `catalogo_produtos` (ver colunas
  abaixo), com Realtime habilitado em `produtos`.
- Produces: `js/config.js` exportando `SUPABASE_URL` (string) e
  `SUPABASE_ANON_KEY` (string), consumido pelo Task 7 (`js/supabaseClient.js`).

- [ ] **Step 1: Criar o projeto Supabase**

Use a ferramenta MCP do Supabase (`create_project`) com:
- `name`: `classificador-produto`
- `organization_id`: `lfhkddklbzmzsyxoiwfm` (única org disponível na conta)
- `region`: `sa-east-1` (São Paulo — mais perto do time que vai usar o app)

Se a ferramenta MCP não estiver disponível na sessão que executar este plano,
crie o projeto equivalente pelo [dashboard do Supabase](https://supabase.com/dashboard)
com os mesmos valores.

Espera: projeto criado, com um `project ref`/`project id` retornado. Guarde esse
id — é usado nos próximos passos.

- [ ] **Step 2: Escrever o schema SQL**

Criar `supabase/schema.sql`:

```sql
create table if not exists produtos (
  id bigint generated always as identity primary key,
  nome text not null,
  tipo text not null check (tipo in ('seco', 'resfriado', 'congelado')),
  quantidade integer not null check (quantidade >= 0),
  produto_novo boolean not null default false,
  created_at timestamptz not null default now()
);

alter table produtos enable row level security;

create policy "produtos_select_public" on produtos for select using (true);
create policy "produtos_insert_public" on produtos for insert with check (true);
create policy "produtos_update_public" on produtos for update using (true);
create policy "produtos_delete_public" on produtos for delete using (true);

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

- [ ] **Step 3: Aplicar o schema**

Use a ferramenta MCP do Supabase (`apply_migration`), passando o projeto criado
no Step 1, `name: "init_schema"`, e o conteúdo de `supabase/schema.sql` como
`query`. Alternativa sem MCP: `psql` direto na connection string do projeto, ou
colar o SQL no SQL Editor do dashboard.

- [ ] **Step 4: Verificar**

Use a ferramenta MCP `list_tables` (ou o dashboard) e confirme que `produtos` e
`catalogo_produtos` existem com as colunas acima.

- [ ] **Step 5: Buscar URL + anon key públicas**

Use as ferramentas MCP `get_project_url` e `get_publishable_keys` (ou
Project Settings → API no dashboard) pra pegar a URL do projeto e a chave
`anon`/`publishable`. Essa chave é pública por design (protegida pelas policies
de RLS acima) — pode ser commitada.

- [ ] **Step 6: Escrever `js/config.js`**

```js
export const SUPABASE_URL = 'COLE_AQUI_A_URL_DO_PROJETO';
export const SUPABASE_ANON_KEY = 'COLE_AQUI_A_ANON_KEY';
```

Substitua os dois valores pelos obtidos no Step 5.

- [ ] **Step 7: `.gitignore`**

```
node_modules/
.vercel
```

- [ ] **Step 8: Commit**

```bash
git add supabase/schema.sql js/config.js .gitignore
git commit -m "feat: provision Supabase schema and public client config"
```

---

## Task 2: Seed do catálogo de referência

**Files:**
- Create: `package.json`
- Create: `scripts/seed-catalog.js`

**Interfaces:**
- Consumes: tabela `catalogo_produtos` (Task 1).
- Produces: ~465 linhas em `catalogo_produtos`, consumidas pelo Task 8 (fuzzy
  match) via `supabase.from('catalogo_produtos').select('*')`.

- [ ] **Step 1: Inicializar `package.json`**

```bash
npm init -y
npm pkg set type=module
npm pkg set scripts.test="node --test tests/"
npm pkg set scripts.seed:catalog="node scripts/seed-catalog.js"
npm install @supabase/supabase-js @anthropic-ai/sdk
npm install --save-dev xlsx
```

- [ ] **Step 2: Escrever `scripts/seed-catalog.js`**

```js
import { createClient } from '@supabase/supabase-js';
import xlsx from 'xlsx';

const SOURCE_PATH = process.argv[2] ?? '/Users/jpgregorini/Desktop/PRODUTOS - UNIDADES - MARCAS.xlsx';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY antes de rodar.');
  process.exit(1);
}

function normalizeMarca(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (/^-+$/.test(trimmed)) return null;
  return trimmed;
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const workbook = xlsx.readFile(SOURCE_PATH);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null });
const [, ...dataRows] = rows;

const catalogo = [];
let marcaAtual = null;

for (const row of dataRows) {
  const [marca, produto, ...unidadeCols] = row;
  if (!produto) continue;
  if (marca) marcaAtual = normalizeMarca(marca);
  const unidades = unidadeCols
    .filter((value) => value !== null && value !== undefined && String(value).trim() !== '')
    .map((value) => String(value).trim());
  catalogo.push({ marca: marcaAtual, produto: String(produto).trim(), unidades });
}

console.log(`Lidas ${catalogo.length} linhas de produto. Inserindo no Supabase...`);

const { error } = await supabase.from('catalogo_produtos').insert(catalogo);
if (error) {
  console.error('Falha ao inserir:', error.message);
  process.exit(1);
}

console.log('Seed concluído.');
```

- [ ] **Step 3: Obter a service role key (uso local, único, nunca commitada)**

No dashboard do Supabase: Project Settings → API → `service_role` key. Exportar
só no shell local, nunca escrever em arquivo do repo:

```bash
export SUPABASE_URL="<url do projeto, mesma do js/config.js>"
export SUPABASE_SERVICE_ROLE_KEY="<service_role key>"
```

- [ ] **Step 4: Rodar o seed**

```bash
npm run seed:catalog
```

Espera: log `Lidas 465 linhas de produto...` seguido de `Seed concluído.`

- [ ] **Step 5: Verificar a contagem no banco**

Use a ferramenta MCP `execute_sql` (ou SQL Editor do dashboard):

```sql
select count(*) from catalogo_produtos;
```

Espera: `465`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json scripts/seed-catalog.js
git commit -m "feat: seed catalogo_produtos from source spreadsheet"
```

---

## Task 3: Módulo de fuzzy match do catálogo (TDD)

**Files:**
- Create: `js/catalogMatch.js`
- Test: `tests/catalogMatch.test.js`

**Interfaces:**
- Produces: `normalize(str: string): string`, `similarity(a: string, b: string): number`
  (0..1), `findCatalogMatch(nomeProduto: string, catalogo: Array<{id, marca, produto, unidades}>, threshold = 0.35): {entry, score} | null`.
  Consumido pelo Task 8 (`js/app.js`).

- [ ] **Step 1: Escrever os testes (devem falhar)**

Criar `tests/catalogMatch.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { similarity, findCatalogMatch } from '../js/catalogMatch.js';

test('similarity é 1 para strings idênticas', () => {
  assert.equal(similarity('REDBULL LATA 250ML', 'REDBULL LATA 250ML'), 1);
});

test('similarity é alta ignorando acento e caixa', () => {
  const score = similarity('Açaí Polpa 1kg', 'ACAI POLPA 1KG');
  assert.ok(score > 0.9, `esperado > 0.9, veio ${score}`);
});

test('findCatalogMatch acha o melhor match acima do threshold', () => {
  const catalogo = [
    { id: 1, marca: 'ADES', produto: 'BEBIDA DE SOJA', unidades: ['1LT'] },
    { id: 2, marca: 'HELLMANS', produto: 'MAIONESE', unidades: ['UND 500G'] },
  ];
  const result = findCatalogMatch('ADES BEBIDA DE SOJA 1L', catalogo);
  assert.ok(result);
  assert.equal(result.entry.id, 1);
});

test('findCatalogMatch retorna null quando nada bate bem', () => {
  const catalogo = [
    { id: 1, marca: 'ADES', produto: 'BEBIDA DE SOJA', unidades: ['1LT'] },
    { id: 2, marca: 'HELLMANS', produto: 'MAIONESE', unidades: ['UND 500G'] },
  ];
  const result = findCatalogMatch('PRODUTO TOTALMENTE DIFERENTE XYZ', catalogo);
  assert.equal(result, null);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test tests/catalogMatch.test.js`
Expected: FAIL — `Cannot find module '../js/catalogMatch.js'`

- [ ] **Step 3: Implementar `js/catalogMatch.js`**

```js
function normalize(str) {
  return str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function bigrams(str) {
  const grams = [];
  for (let i = 0; i < str.length - 1; i++) {
    grams.push(str.slice(i, i + 2));
  }
  return grams;
}

function diceCoefficient(a, b) {
  const bigramsA = bigrams(a);
  const bigramsB = bigrams(b);
  if (bigramsA.length === 0 || bigramsB.length === 0) {
    return a === b ? 1 : 0;
  }
  const bMap = new Map();
  for (const gram of bigramsB) {
    bMap.set(gram, (bMap.get(gram) || 0) + 1);
  }
  let matches = 0;
  for (const gram of bigramsA) {
    const count = bMap.get(gram) || 0;
    if (count > 0) {
      matches++;
      bMap.set(gram, count - 1);
    }
  }
  return (2 * matches) / (bigramsA.length + bigramsB.length);
}

export function similarity(a, b) {
  return diceCoefficient(normalize(a), normalize(b));
}

export function findCatalogMatch(nomeProduto, catalogo, threshold = 0.35) {
  let best = null;
  for (const entry of catalogo) {
    const label = `${entry.marca ?? ''} ${entry.produto}`.trim();
    const score = similarity(nomeProduto, label);
    if (!best || score > best.score) {
      best = { entry, score };
    }
  }
  if (!best || best.score < threshold) {
    return null;
  }
  return best;
}

export { normalize };
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test tests/catalogMatch.test.js`
Expected: PASS (4 testes)

- [ ] **Step 5: Commit**

```bash
git add js/catalogMatch.js tests/catalogMatch.test.js
git commit -m "feat: add fuzzy catalog matching"
```

---

## Task 4: Módulo de validação da resposta da IA (TDD)

**Files:**
- Create: `js/analyzeSchema.js`
- Test: `tests/analyzeSchema.test.js`

**Interfaces:**
- Produces: `TIPOS_VALIDOS: string[]`, `parseAnalyzeResponse(raw: string): { nome_produto: string, tipo: string }` (lança `Error` se inválido).
  Consumido pelo Task 6 (`api/analyze.js`).

- [ ] **Step 1: Escrever os testes (devem falhar)**

Criar `tests/analyzeSchema.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAnalyzeResponse } from '../js/analyzeSchema.js';

test('parseia resposta JSON válida', () => {
  const result = parseAnalyzeResponse('{"nome_produto": "REDBULL LATA 250ML", "tipo": "resfriado"}');
  assert.deepEqual(result, { nome_produto: 'REDBULL LATA 250ML', tipo: 'resfriado' });
});

test('remove cercas de markdown antes de parsear', () => {
  const result = parseAnalyzeResponse('```json\n{"nome_produto": "ACAI POLPA 1KG", "tipo": "congelado"}\n```');
  assert.deepEqual(result, { nome_produto: 'ACAI POLPA 1KG', tipo: 'congelado' });
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
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test tests/analyzeSchema.test.js`
Expected: FAIL — `Cannot find module '../js/analyzeSchema.js'`

- [ ] **Step 3: Implementar `js/analyzeSchema.js`**

```js
export const TIPOS_VALIDOS = ['seco', 'resfriado', 'congelado'];

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

  return { nome_produto: data.nome_produto.trim(), tipo: data.tipo };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test tests/analyzeSchema.test.js`
Expected: PASS (5 testes)

- [ ] **Step 5: Commit**

```bash
git add js/analyzeSchema.js tests/analyzeSchema.test.js
git commit -m "feat: add AI response schema validation"
```

---

## Task 5: Módulo de montagem das linhas do export (TDD)

**Files:**
- Create: `js/xlsxExport.js`
- Test: `tests/xlsxExport.test.js`

**Interfaces:**
- Produces: `buildExportRows(produtos: Array<{nome, tipo, quantidade, created_at}>): Array<{ID: number, 'NOME DO PRODUTO': string, QUANTIDADE: number, TIPO: string}>`.
  Consumido pelo Task 10 (`js/app.js`, wrapper de download com SheetJS).

- [ ] **Step 1: Escrever os testes (devem falhar)**

Criar `tests/xlsxExport.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildExportRows } from '../js/xlsxExport.js';

test('ordena por created_at e renumera ID sequencialmente', () => {
  const produtos = [
    { id: 5, nome: 'MAIONESE HELLMANS 500G', quantidade: 3, tipo: 'seco', created_at: '2026-07-14T10:05:00Z' },
    { id: 2, nome: 'REDBULL LATA 250ML', quantidade: 10, tipo: 'resfriado', created_at: '2026-07-14T09:00:00Z' },
  ];
  assert.deepEqual(buildExportRows(produtos), [
    { ID: 1, 'NOME DO PRODUTO': 'REDBULL LATA 250ML', QUANTIDADE: 10, TIPO: 'resfriado' },
    { ID: 2, 'NOME DO PRODUTO': 'MAIONESE HELLMANS 500G', QUANTIDADE: 3, TIPO: 'seco' },
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
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test tests/xlsxExport.test.js`
Expected: FAIL — `Cannot find module '../js/xlsxExport.js'`

- [ ] **Step 3: Implementar `js/xlsxExport.js`**

```js
export function buildExportRows(produtos) {
  const sorted = [...produtos].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );
  return sorted.map((p, index) => ({
    ID: index + 1,
    'NOME DO PRODUTO': p.nome,
    QUANTIDADE: p.quantidade,
    TIPO: p.tipo,
  }));
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test tests/xlsxExport.test.js`
Expected: PASS (3 testes)

- [ ] **Step 5: Commit**

```bash
git add js/xlsxExport.js tests/xlsxExport.test.js
git commit -m "feat: add export row builder with sequential ID renumbering"
```

---

## Task 6: Serverless function `/api/analyze`

**Files:**
- Create: `api/analyze.js`
- Create: `.env.example`

**Interfaces:**
- Consumes: `parseAnalyzeResponse` e `TIPOS_VALIDOS` de `js/analyzeSchema.js` (Task 4).
- Produces: endpoint HTTP `POST /api/analyze` — body `{ imageBase64: string, mediaType: string }`
  → `200 { nome_produto: string, tipo: string }` ou `4xx/5xx { error: string }`.
  Consumido pelo Task 8 (`js/app.js`, via `fetch('/api/analyze')`).

- [ ] **Step 1: Escrever `api/analyze.js`**

```js
import Anthropic from '@anthropic-ai/sdk';
import { parseAnalyzeResponse, TIPOS_VALIDOS } from '../js/analyzeSchema.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MAX_BASE64_LENGTH = 6_000_000;

const SYSTEM_PROMPT = `Você analisa fotos de produtos de um estoque de supermercado/restaurante.
Responda SOMENTE com um JSON, sem markdown, no formato exato:
{"nome_produto": "MARCA PRODUTO EMBALAGEM", "tipo": "seco"}

Regras pro campo "nome_produto":
- Maiúsculo, compacto, no estilo "REDBULL LATA 250ML" ou "MAIONESE HELLMANS 500G".
- Inclua marca (se visível), descrição do produto e tamanho/embalagem (se visível).

Regras pro campo "tipo": deve ser exatamente um destes valores: ${TIPOS_VALIDOS.join(', ')}.
- "congelado": produto visivelmente congelado ou de freezer/embalagem para congelados.
- "resfriado": produto de geladeira/refrigerado (laticínios, frios, bebidas geladas, etc).
- "seco": mantimento de prateleira, não perecível na embalagem original.

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
      max_tokens: 256,
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

- [ ] **Step 2: Criar `.env.example`**

```
ANTHROPIC_API_KEY=
```

- [ ] **Step 3: Configurar a env var localmente e instalar Vercel CLI**

```bash
npm install --global vercel
vercel login
vercel link
vercel env add ANTHROPIC_API_KEY development
```

Cole sua `ANTHROPIC_API_KEY` quando solicitado.

- [ ] **Step 4: Rodar local e verificar os guard clauses**

```bash
vercel dev &
sleep 3
curl -s -X POST http://localhost:3000/api/analyze -H 'Content-Type: application/json' -d '{}'
curl -s -X GET http://localhost:3000/api/analyze
```

Expected: primeira chamada → `{"error":"imageBase64 e mediaType são obrigatórios"}` (400);
segunda → `{"error":"Method not allowed"}` (405). O caminho feliz (foto real → JSON
válido) é validado no Task 11, com foto de verdade.

- [ ] **Step 5: Commit**

```bash
git add api/analyze.js .env.example
git commit -m "feat: add /api/analyze serverless function"
```

---

## Task 7: Shell da página + cliente Supabase

**Files:**
- Create: `index.html`
- Create: `styles.css`
- Create: `js/supabaseClient.js`

**Interfaces:**
- Consumes: `SUPABASE_URL`, `SUPABASE_ANON_KEY` de `js/config.js` (Task 1).
- Produces: `supabase` (cliente `@supabase/supabase-js` já inicializado),
  consumido pelo Task 8/9/10 (`js/app.js`). Produz também os elementos DOM
  (`#photo-input`, `#preview-section`, `#preview-nome`, `#preview-tipo`,
  `#preview-quantidade`, `#add-btn`, `#export-btn`, `#toast`,
  `#produtos-tbody`, `#catalog-badge`) que `js/app.js` e `js/render.js`
  (Tasks 8-10) vão referenciar por `id`.

- [ ] **Step 1: Escrever `index.html`**

```html
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Contagem de Estoque</title>
  <link rel="stylesheet" href="styles.css" />
  <script src="https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js"></script>
</head>
<body>
  <header>
    <h1>Contagem de Estoque</h1>
    <button id="export-btn" disabled>Exportar tabela</button>
  </header>

  <main>
    <section id="capture-section">
      <label for="photo-input" class="photo-button">📷 Tirar Foto</label>
      <input type="file" id="photo-input" accept="image/*" capture="environment" hidden />
    </section>

    <section id="preview-section" hidden>
      <div id="preview-card">
        <div id="catalog-badge" class="badge"></div>
        <label>Nome do produto
          <input type="text" id="preview-nome" />
        </label>
        <label>Tipo
          <select id="preview-tipo">
            <option value="seco">Seco</option>
            <option value="resfriado">Resfriado</option>
            <option value="congelado">Congelado</option>
          </select>
        </label>
        <label>Quantidade
          <input type="number" id="preview-quantidade" min="0" step="1" />
        </label>
        <button id="add-btn">Adicionar</button>
      </div>
    </section>

    <div id="toast" hidden></div>

    <section id="table-section">
      <table id="produtos-table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Tipo</th>
            <th>Quantidade</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="produtos-tbody"></tbody>
      </table>
    </section>
  </main>

  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Escrever `styles.css`**

```css
:root {
  font-family: system-ui, -apple-system, sans-serif;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  padding: 1rem;
  max-width: 480px;
  margin-inline: auto;
  background: #f7f7f7;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

h1 { font-size: 1.25rem; }

button {
  font-size: 1rem;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  border: none;
  background: #1f6feb;
  color: white;
  cursor: pointer;
}

button:disabled {
  background: #aaa;
  cursor: not-allowed;
}

.photo-button {
  display: block;
  text-align: center;
  padding: 1rem;
  background: #1f6feb;
  color: white;
  border-radius: 8px;
  font-size: 1.1rem;
  cursor: pointer;
}

#preview-card {
  background: white;
  padding: 1rem;
  border-radius: 8px;
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

#preview-card label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.9rem;
}

#preview-card input, #preview-card select {
  font-size: 1rem;
  padding: 0.5rem;
  border-radius: 6px;
  border: 1px solid #ccc;
}

.badge {
  padding: 0.5rem;
  border-radius: 6px;
  font-size: 0.85rem;
}

.badge-found { background: #d4edda; color: #155724; }
.badge-new { background: #fff3cd; color: #856404; }

#toast {
  margin-top: 1rem;
  padding: 0.75rem;
  border-radius: 6px;
}

.toast-error { background: #f8d7da; color: #721c24; }
.toast-ok { background: #d4edda; color: #155724; }

table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 1rem;
  background: white;
}

th, td {
  padding: 0.5rem;
  text-align: left;
  border-bottom: 1px solid #eee;
  font-size: 0.9rem;
}

.col-acoes button {
  font-size: 0.8rem;
  padding: 0.4rem 0.6rem;
  margin-right: 0.25rem;
}
```

- [ ] **Step 3: Escrever `js/supabaseClient.js`**

```js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

- [ ] **Step 4: Verificar manualmente**

```bash
npx serve .
```

Abrir `http://localhost:3000` no navegador. Confirmar: página carrega sem erro
no console, botão "Exportar tabela" aparece desabilitado, botão "Tirar Foto"
aparece. No console do navegador, rodar:

```js
const { data, error } = await (await import('./js/supabaseClient.js')).supabase.from('produtos').select('*');
console.log(data, error);
```

Expected: `data` é um array vazio (`[]`), `error` é `null` — confirma que a
conexão com o Supabase e as policies de RLS estão corretas.

- [ ] **Step 5: Commit**

```bash
git add index.html styles.css js/supabaseClient.js
git commit -m "feat: add page shell and Supabase client"
```

---

## Task 8: Captura de foto, análise IA e preview editável

**Files:**
- Create: `js/render.js` (parcial — `renderCatalogBadge` usado aqui; `renderTable` completo no Task 9)
- Create: `js/app.js` (parcial — captura + preview; insert/realtime completos no Task 9)

**Interfaces:**
- Consumes: `findCatalogMatch` de `js/catalogMatch.js` (Task 3); endpoint
  `POST /api/analyze` (Task 6); `supabase` de `js/supabaseClient.js` (Task 7).
- Produces: `renderCatalogBadge(match: {entry, score} | null): void`, usado
  também pelo Task 9. `currentMatch` (estado em `js/app.js`), consumido pelo
  Task 9 no insert (`produto_novo: currentMatch === null`).

- [ ] **Step 1: Escrever `js/render.js` (parte 1 — badge)**

```js
export function renderCatalogBadge(match) {
  const el = document.getElementById('catalog-badge');
  if (match) {
    const unidades = (match.entry.unidades || []).join(', ');
    el.textContent = `✓ encontrado no catálogo: ${match.entry.marca ?? ''} ${match.entry.produto} (${unidades})`;
    el.className = 'badge badge-found';
  } else {
    el.textContent = '⚠ Produto Novo no Banco de Dados';
    el.className = 'badge badge-new';
  }
}
```

- [ ] **Step 2: Escrever `js/app.js` (parte 1 — captura + análise + preview)**

```js
import { supabase } from './supabaseClient.js';
import { findCatalogMatch } from './catalogMatch.js';
import { renderCatalogBadge } from './render.js';

let catalogo = [];
let currentMatch = null;

const photoInput = document.getElementById('photo-input');
const previewSection = document.getElementById('preview-section');
const previewNome = document.getElementById('preview-nome');
const previewTipo = document.getElementById('preview-tipo');
const previewQuantidade = document.getElementById('preview-quantidade');
const addBtn = document.getElementById('add-btn');
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
  currentMatch = null;
  renderCatalogBadge(null);

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
    const { nome_produto, tipo } = await response.json();
    previewNome.value = nome_produto;
    previewTipo.value = tipo;
    currentMatch = findCatalogMatch(nome_produto, catalogo);
    renderCatalogBadge(currentMatch);
  } catch (err) {
    showToast(`Não deu pra analisar a foto: ${err.message}. Preencha manualmente.`);
  } finally {
    addBtn.disabled = false;
  }
}

async function init() {
  const { data: catalogData, error: catalogError } = await supabase.from('catalogo_produtos').select('*');
  if (catalogError) {
    console.warn('Catálogo não carregou, seguindo sem match:', catalogError.message);
  } else {
    catalogo = catalogData;
  }

  photoInput.addEventListener('change', handlePhotoSelected);
}

init();
```

- [ ] **Step 3: Verificar manualmente**

Com `vercel dev` rodando (junta frontend + `/api/analyze` na mesma origem),
abrir no celular (mesma rede) ou no navegador desktop, clicar "Tirar Foto",
escolher uma foto de produto real. Confirmar: preview aparece com nome e tipo
preenchidos, badge mostra "encontrado" ou "Produto Novo" de forma coerente com
o catálogo. Desconectar a internet e tentar de novo: confirmar que aparece o
toast de erro e o preview abre em branco, editável.

- [ ] **Step 4: Commit**

```bash
git add js/render.js js/app.js
git commit -m "feat: wire photo capture, AI analysis and editable preview"
```

---

## Task 9: Tabela compartilhada, realtime, editar/excluir

**Files:**
- Modify: `js/render.js` (adicionar `renderTable`)
- Modify: `js/app.js` (adicionar insert, realtime, edit, delete)

**Interfaces:**
- Consumes: `supabase` (Task 7); `currentMatch`, `catalogo` (Task 8).
- Produces: `renderTable(produtos: Array<{id, nome, tipo, quantidade}>, handlers: {onEdit, onDelete}): void`,
  consumido pelo Task 10 (export lê o mesmo array `produtos` mantido aqui).

- [ ] **Step 1: Adicionar `renderTable` em `js/render.js`**

```js
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

export function renderTable(produtos, handlers) {
  const tbody = document.getElementById('produtos-tbody');
  tbody.innerHTML = '';
  for (const p of produtos) {
    const tr = document.createElement('tr');
    tr.dataset.id = p.id;
    tr.innerHTML = `
      <td>${escapeHtml(p.nome)}</td>
      <td>${escapeHtml(p.tipo)}</td>
      <td>${p.quantidade}</td>
      <td class="col-acoes">
        <button class="edit-btn" type="button">Editar</button>
        <button class="delete-btn" type="button">Excluir</button>
      </td>
    `;
    tr.querySelector('.edit-btn').addEventListener('click', () => handlers.onEdit(p));
    tr.querySelector('.delete-btn').addEventListener('click', () => handlers.onDelete(p));
    tbody.appendChild(tr);
  }
  document.getElementById('export-btn').disabled = produtos.length === 0;
}
```

- [ ] **Step 2: Atualizar `js/app.js`**

Adicionar os imports, o estado `produtos`, e as funções de insert/realtime/
edit/delete. Arquivo completo:

```js
import { supabase } from './supabaseClient.js';
import { findCatalogMatch } from './catalogMatch.js';
import { renderCatalogBadge, renderTable } from './render.js';

let catalogo = [];
let produtos = [];
let currentMatch = null;

const photoInput = document.getElementById('photo-input');
const previewSection = document.getElementById('preview-section');
const previewNome = document.getElementById('preview-nome');
const previewTipo = document.getElementById('preview-tipo');
const previewQuantidade = document.getElementById('preview-quantidade');
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
  currentMatch = null;
  renderCatalogBadge(null);

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
    const { nome_produto, tipo } = await response.json();
    previewNome.value = nome_produto;
    previewTipo.value = tipo;
    currentMatch = findCatalogMatch(nome_produto, catalogo);
    renderCatalogBadge(currentMatch);
  } catch (err) {
    showToast(`Não deu pra analisar a foto: ${err.message}. Preencha manualmente.`);
  } finally {
    addBtn.disabled = false;
  }
}

async function handleAdd() {
  const nome = previewNome.value.trim();
  const tipo = previewTipo.value;
  const quantidade = Number(previewQuantidade.value);

  if (!nome) return showToast('Preencha o nome do produto.');
  if (!Number.isFinite(quantidade) || quantidade < 0) return showToast('Preencha uma quantidade válida.');

  addBtn.disabled = true;
  try {
    const { error } = await supabase.from('produtos').insert({
      nome,
      tipo,
      quantidade,
      produto_novo: currentMatch === null,
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
  const { error } = await supabase
    .from('produtos')
    .update({ nome: novoNome.trim(), tipo: novoTipo, quantidade: novaQuantidade })
    .eq('id', produto.id);
  if (error) window.alert(`Erro ao salvar: ${error.message}`);
}

async function onDeleteProduto(produto) {
  if (!window.confirm(`Excluir "${produto.nome}"?`)) return;
  const { error } = await supabase.from('produtos').delete().eq('id', produto.id);
  if (error) window.alert(`Erro ao excluir: ${error.message}`);
}

function applyRealtimeChange(payload) {
  if (payload.eventType === 'INSERT') {
    produtos = [...produtos, payload.new].sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at)
    );
  } else if (payload.eventType === 'UPDATE') {
    produtos = produtos.map((p) => (p.id === payload.new.id ? payload.new : p));
  } else if (payload.eventType === 'DELETE') {
    produtos = produtos.filter((p) => p.id !== payload.old.id);
  }
  renderTable(produtos, { onEdit: onEditProduto, onDelete: onDeleteProduto });
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
}

init();
```

- [ ] **Step 3: Verificar manualmente (2 abas)**

Abrir o app em duas abas (ou navegador + celular) lado a lado. Adicionar um
item na aba 1. Confirmar que a linha aparece na aba 2 sem dar refresh. Editar
a linha na aba 2 (botão "Editar", preencher os 3 prompts). Confirmar que
atualiza nas duas abas. Excluir na aba 1. Confirmar que some das duas.

- [ ] **Step 4: Commit**

```bash
git add js/render.js js/app.js
git commit -m "feat: add shared realtime table with edit/delete"
```

---

## Task 10: Botão "Exportar tabela"

**Files:**
- Modify: `js/app.js`

**Interfaces:**
- Consumes: `buildExportRows` de `js/xlsxExport.js` (Task 5); global `XLSX`
  (carregado via CDN no `index.html`, Task 7); array `produtos` (Task 9).

- [ ] **Step 1: Adicionar a função de export e o listener em `js/app.js`**

No topo do arquivo, adicionar o import:

```js
import { buildExportRows } from './xlsxExport.js';
```

No final do arquivo, antes de `init()`, adicionar:

```js
function exportToXlsx(rows) {
  const data = buildExportRows(rows);
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Estoque');
  const dateStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `contagem-estoque-${dateStr}.xlsx`);
}
```

Dentro de `init()`, junto dos outros `addEventListener`, adicionar:

```js
  exportBtn.addEventListener('click', () => exportToXlsx(produtos));
```

- [ ] **Step 2: Verificar manualmente**

Com pelo menos 2 itens na tabela, clicar "Exportar tabela". Confirmar que
baixa um arquivo `contagem-estoque-AAAA-MM-DD.xlsx`. Abrir o arquivo e
conferir: colunas exatas `ID`, `NOME DO PRODUTO`, `QUANTIDADE`, `TIPO`; ID
começa em 1 e é sequencial. Excluir um item do meio da tabela, exportar de
novo, confirmar que o ID continua sequencial sem buraco. Esvaziar a tabela
(excluir tudo) e confirmar que o botão "Exportar tabela" fica desabilitado.

- [ ] **Step 3: Commit**

```bash
git add js/app.js
git commit -m "feat: wire xlsx table export"
```

---

## Task 11: Deploy na Vercel + smoke test ponta a ponta

**Files:**
- Nenhum arquivo novo (configuração de infraestrutura).

**Interfaces:**
- Consumes: todo o app (Tasks 1-10).

- [ ] **Step 1: Configurar env var de produção**

```bash
vercel env add ANTHROPIC_API_KEY production
```

Cole a `ANTHROPIC_API_KEY` quando solicitado.

- [ ] **Step 2: Deploy**

```bash
vercel --prod
```

Anotar a URL de produção retornada.

- [ ] **Step 3: Smoke test no celular, com foto real**

Abrir a URL de produção no navegador do celular. Executar o fluxo completo:
1. "Tirar Foto" → fotografar um produto real do estoque.
2. Conferir preview: nome e tipo fazem sentido; badge de catálogo aparece
   (achou ou "Produto Novo", ambos são resultado válido dependendo do
   produto).
3. Editar o nome se a IA errou algo, preencher quantidade, "Adicionar".
4. Confirmar que a linha aparece na tabela.
5. Repetir com um segundo produto (idealmente um que exista no catálogo
   original e um que não exista), confirmar os dois badges na prática.
6. Editar uma linha da tabela, excluir outra — confirmar que funciona.
7. "Exportar tabela" — abrir o xlsx baixado no celular ou transferir pro
   computador, conferir colunas e valores.

- [ ] **Step 4: Registrar a URL final**

Depois de confirmado o smoke test, comunicar a URL de produção pro time que
vai usar o app na contagem.
