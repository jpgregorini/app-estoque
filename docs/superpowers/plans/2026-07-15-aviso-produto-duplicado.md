# Aviso de Produto Duplicado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Avisar visualmente (sem bloquear) quando o nome sugerido pela IA
parecer duplicata de um produto já presente na tabela compartilhada.

**Architecture:** Reaproveita a função pura `similarity` já existente em
`js/catalogMatch.js`. Um novo módulo puro, `js/duplicateCheck.js`, aplica
essa função comparando o nome sugerido contra `produtos` (array já mantido
em memória e sincronizado via Realtime). `js/app.js` chama esse check no
mesmo ponto onde já calcula o match de catálogo, e `js/render.js` ganha uma
função de renderização pro novo badge.

**Tech Stack:** JS vanilla (ES modules), `node:test` pros testes — mesmo
padrão dos módulos existentes.

## Global Constraints

- Fuzzy match (não exato), reaproveitando `similarity` de `js/catalogMatch.js`.
- Threshold de duplicata: **0.7** (mais rígido que o 0.35 do catálogo).
- Aviso é informativo — nunca bloqueia o envio do formulário.
- Check roda uma vez, no momento em que a IA responde — não recalcula se o
  usuário editar o nome manualmente depois (mesma limitação do badge de
  catálogo existente).
- Só compara contra produtos ativos (o array `produtos` já exclui
  soft-deletados).

---

## Task 1: Módulo duplicateCheck (TDD)

**Files:**
- Create: `js/duplicateCheck.js`
- Test: `tests/duplicateCheck.test.js`

**Interfaces:**
- Consumes: `similarity` de `js/catalogMatch.js` (já existe, assinatura
  `similarity(a: string, b: string): number`).
- Produces: `findDuplicateProduto(nomeProduto: string, produtos: Array<{id,
  nome, quantidade}>, threshold = 0.7): { produto, score } | null`. Consumido
  pelo Task 2 (`js/app.js`).

- [ ] **Step 1: Escrever os testes (devem falhar)**

Criar `tests/duplicateCheck.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findDuplicateProduto } from '../js/duplicateCheck.js';

test('acha duplicata com nome quase idêntico (variação de digitação da IA)', () => {
  const produtos = [
    { id: 1, nome: 'REDBULL LATA 250ML', quantidade: 5 },
    { id: 2, nome: 'ARROZ BRANCO 5KG', quantidade: 10 },
  ];
  const result = findDuplicateProduto('RED BULL LATA 250ML', produtos);
  assert.ok(result);
  assert.equal(result.produto.id, 1);
});

test('não acha duplicata em lista vazia', () => {
  assert.equal(findDuplicateProduto('REDBULL LATA 250ML', []), null);
});

test('não confunde produtos parecidos mas diferentes (threshold 0.7 é mais rígido que o do catálogo)', () => {
  const produtos = [{ id: 1, nome: 'SUCO DE UVA 1L', quantidade: 3 }];
  const result = findDuplicateProduto('SUCO DE LARANJA 1L', produtos);
  assert.equal(result, null);
});

test('não acha duplicata quando nome é completamente diferente', () => {
  const produtos = [{ id: 1, nome: 'REDBULL LATA 250ML', quantidade: 5 }];
  const result = findDuplicateProduto('ARROZ BRANCO 5KG', produtos);
  assert.equal(result, null);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test tests/duplicateCheck.test.js`
Expected: FAIL — `Cannot find module '../js/duplicateCheck.js'`

- [ ] **Step 3: Implementar `js/duplicateCheck.js`**

```js
import { similarity } from './catalogMatch.js';

export function findDuplicateProduto(nomeProduto, produtos, threshold = 0.7) {
  let best = null;
  for (const produto of produtos) {
    const score = similarity(nomeProduto, produto.nome);
    if (!best || score > best.score) {
      best = { produto, score };
    }
  }
  if (!best || best.score < threshold) {
    return null;
  }
  return best;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test tests/duplicateCheck.test.js`
Expected: PASS (4 testes)

- [ ] **Step 5: Rodar a suíte inteira pra garantir que nada quebrou**

Run: `npm test`
Expected: PASS (16 testes — 12 já existentes + 4 novos)

- [ ] **Step 6: Commit**

```bash
git add js/duplicateCheck.js tests/duplicateCheck.test.js
git commit -m "feat: add duplicate product detection against live table"
```

---

## Task 2: Badge de aviso no preview

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `js/render.js`
- Modify: `js/app.js`

**Interfaces:**
- Consumes: `findDuplicateProduto` de `js/duplicateCheck.js` (Task 1); array
  `produtos` já mantido em `js/app.js` (existente).
- Produces: `renderDuplicateBadge(match: {produto, score} | null): void` em
  `js/render.js`.

- [ ] **Step 1: Adicionar o elemento do badge em `index.html`**

Encontrar esta linha (dentro de `#preview-card`, logo após `#catalog-badge`):

```html
        <div id="catalog-badge" class="badge"></div>
```

Adicionar logo abaixo dela:

```html
        <div id="catalog-badge" class="badge"></div>
        <div id="duplicate-badge" class="badge" hidden></div>
```

- [ ] **Step 2: Adicionar o estilo em `styles.css`**

Encontrar:

```css
.badge-found { background: #d4edda; color: #155724; }
.badge-new { background: #fff3cd; color: #856404; }
```

Adicionar logo abaixo:

```css
.badge-found { background: #d4edda; color: #155724; }
.badge-new { background: #fff3cd; color: #856404; }
.badge-duplicate { background: #f8d7da; color: #721c24; }
```

- [ ] **Step 3: Adicionar `renderDuplicateBadge` em `js/render.js`**

No final do arquivo, adicionar:

```js
export function renderDuplicateBadge(match) {
  const el = document.getElementById('duplicate-badge');
  if (match) {
    el.textContent = `⚠ Possível duplicata: "${match.produto.nome}" já está na tabela com quantidade ${match.produto.quantidade}.`;
    el.className = 'badge badge-duplicate';
    el.hidden = false;
  } else {
    el.textContent = '';
    el.hidden = true;
  }
}
```

- [ ] **Step 4: Atualizar `js/app.js`**

No topo do arquivo, atualizar os imports. Trocar:

```js
import { findCatalogMatch } from './catalogMatch.js';
import { renderCatalogBadge, renderTable } from './render.js';
```

por:

```js
import { findCatalogMatch } from './catalogMatch.js';
import { findDuplicateProduto } from './duplicateCheck.js';
import { renderCatalogBadge, renderDuplicateBadge, renderTable } from './render.js';
```

Dentro de `handlePhotoSelected`, no bloco de reset (antes do `try`), trocar:

```js
  currentMatch = null;
  renderCatalogBadge(null);
```

por:

```js
  currentMatch = null;
  renderCatalogBadge(null);
  renderDuplicateBadge(null);
```

Dentro do bloco `try`, logo depois da linha que chama `renderCatalogBadge(currentMatch);`, adicionar:

```js
    currentMatch = findCatalogMatch(nome_produto, catalogo);
    renderCatalogBadge(currentMatch);
    renderDuplicateBadge(findDuplicateProduto(nome_produto, produtos));
```

(Substitui as duas linhas existentes — a de `findCatalogMatch`/`renderCatalogBadge` fica igual, só adiciona a terceira linha do duplicate check logo depois.)

Não mexer em mais nada no arquivo — `handleAdd`, `onEditProduto`,
`onDeleteProduto`, `applyRealtimeChange`, `init`, etc. ficam exatamente como
estão.

- [ ] **Step 5: Verificar sintaxe**

Run: `node --check js/app.js && node --check js/render.js`
Expected: sem erro (nenhuma saída)

- [ ] **Step 6: Rodar a suíte de testes**

Run: `npm test`
Expected: PASS (16 testes — este task não adiciona teste novo, só reusa os
já existentes pra confirmar que nada quebrou)

- [ ] **Step 7: Verificar manualmente (sem foto real — ver nota abaixo)**

Este passo depende de tirar uma foto real e de `ANTHROPIC_API_KEY`, então só
é totalmente verificável em produção (app já está deployado). Se estiver
rodando isso numa sessão sem câmera/API key disponível, valide o que der:
sirva a pasta estaticamente (`npx serve .`) e confirme no console do
navegador que `document.getElementById('duplicate-badge')` existe e começa
`hidden`. O teste real — tirar foto de um produto já existente na tabela e
ver o aviso aparecer — fica pro usuário confirmar no app já deployado.

- [ ] **Step 8: Commit**

```bash
git add index.html styles.css js/render.js js/app.js
git commit -m "feat: warn when a scanned product looks like a duplicate already in the table"
```
