# Classificador de Produto — Contagem de Estoque via Foto (IA)

## Visão geral

Web app simples pro time de estoque fotografar um produto, uma IA extrai nome
e tipo (seco/resfriado/congelado), o usuário confere/edita, adiciona numa
tabela compartilhada em tempo real, e exporta um xlsx no final da contagem.

## Objetivo

Facilitar a contagem física de estoque, evitando digitação manual do nome e
tipo de cada item — só a quantidade é preenchida manualmente.

## Fora de escopo (non-goals)

- Login/autenticação (link aberto, sem usuário/senha)
- Múltiplas contagens nomeadas / histórico (existe só uma tabela ativa)
- Edição do catálogo de referência pela interface (import é um processo à
  parte, manual, único)
- App mobile nativo (é web responsivo, uso majoritário via celular)
- Testes E2E automatizados

## Arquitetura

- **Frontend**: HTML/CSS/JS vanilla, estático, deploy na Vercel, mobile-first.
  Sem framework, sem build step.
- **Backend**: uma serverless function na Vercel (`/api/analyze`) que chama a
  Claude API (vision) e guarda a `ANTHROPIC_API_KEY` (nunca exposta ao
  browser).
- **Banco**: Supabase (Postgres), acessado direto do frontend via
  `supabase-js` (anon key pública), com Realtime habilitado na tabela
  `produtos`.
- **Export**: gerado 100% client-side via SheetJS (CDN), sem passar pelo
  servidor.
- **Fuzzy match do catálogo**: client-side via Fuse.js (CDN); catálogo
  inteiro (467 linhas) carregado em memória no load da página.

## Componentes de tela (single page)

1. Botão **"Tirar Foto"** — `<input type="file" accept="image/*"
   capture="environment">`. No celular abre a câmera direto; também permite
   escolher da galeria/arquivo. Sem gerenciamento de permissão separado.
2. **Card de preview** (após a IA responder):
   - nome do produto (input text, editável)
   - tipo (select: seco/resfriado/congelado, editável)
   - badge de status do catálogo: "✓ encontrado no catálogo: {marca} —
     {unidades}" ou "⚠ Produto Novo no Banco de Dados"
   - quantidade (input number, sempre manual)
   - botão "Adicionar"
3. **Tabela compartilhada** (atualiza sozinha via realtime): colunas Nome,
   Tipo, Quantidade, ações [editar] [excluir] por linha. Qualquer linha pode
   ser editada ou excluída a qualquer momento, por qualquer pessoa.
4. Botão **"Exportar tabela"** (fixo/visível no topo).

## Dados

### Tabela `produtos` (a contagem em si)

| coluna | tipo | obs |
|---|---|---|
| id | bigint identity PK | |
| nome | text | |
| tipo | text | check in ('seco','resfriado','congelado') |
| quantidade | int | |
| produto_novo | boolean | true se não bateu no catálogo no momento da criação |
| created_at | timestamptz | default now(); usado pra ordenar/renumerar no export |

Realtime (`postgres_changes`) habilitado nessa tabela — insert/update/delete
propagam pra todos os clientes conectados, sem precisar dar refresh.

### Tabela `catalogo_produtos` (referência, seed único a partir do xlsx)

| coluna | tipo | obs |
|---|---|---|
| id | bigint identity PK | |
| marca | text | pode ser vazio (produto sem marca própria na planilha original) |
| produto | text | |
| unidades | text[] | todas as variações de unidade daquela linha (até 7 no xlsx original) |

Fonte: `PRODUTOS - UNIDADES - MARCAS.xlsx` (467 linhas: Marca, Produto,
Unidades 1-7). Importada uma vez via script de seed durante a implementação.
Não editável pela UI.

## Fluxo ponta a ponta

1. Usuário clica "Tirar Foto" → seleciona/captura imagem.
2. Frontend envia a imagem (base64) pra `POST /api/analyze`.
3. `/api/analyze` chama a Claude API (vision) com prompt fixo pedindo JSON
   `{ nome_produto, tipo }`, valida o schema da resposta, devolve pro
   frontend.
   - `nome_produto`: formato "MARCA PRODUTO EMBALAGEM", ex. "REDBULL LATA
     250ML" (maiúsculo, compacto).
   - `tipo`: um de `seco | resfriado | congelado`.
4. Frontend roda fuzzy match de `nome_produto` contra `catalogo_produtos`
   (Fuse.js, em memória).
   - Match bom → badge "✓ encontrado" + mostra marca/unidades conhecidas,
     como apoio visual pra conferência.
   - Sem match → badge "⚠ Produto Novo no Banco de Dados" (informativo, não
     bloqueia).
5. Preview renderizado na tela: nome e tipo editáveis, quantidade em branco.
6. Usuário confere, ajusta se precisar, preenche quantidade, clica
   "Adicionar".
7. Insert em `produtos` (com `produto_novo` conforme o match do passo 4).
   Botão desabilita durante o insert, evita linha duplicada por duplo clique.
8. Realtime propaga o insert — tabela atualiza sozinha em todas as telas
   conectadas.
9. "Exportar tabela": busca todas as linhas de `produtos` ordenadas por
   `created_at` asc, renumera ID sequencial 1..N (ignora exclusões, sem
   buracos), gera `.xlsx` com colunas `ID | NOME DO PRODUTO | QUANTIDADE |
   TIPO`, dispara download no navegador.

## Tratamento de erro

- **Sem câmera/permissão**: input file nativo já cai pra escolha de
  arquivo/galeria — sem tela de erro dedicada.
- **Falha na análise IA** (rede, timeout, JSON inválido): toast de erro,
  abre preview em branco pra preenchimento 100% manual.
- **Falha no insert**: mostra erro, mantém os dados preenchidos na tela pra
  tentar de novo (não perde o que foi digitado).
- **Catálogo não carrega**: degrada silencioso (sem badge, sem match), resto
  do fluxo segue normal.
- **Exportar com tabela vazia**: botão desabilitado / aviso "tabela vazia".
- **Realtime cai**: reconexão automática do `supabase-js`, sem lógica extra
  necessária.

## Testes

- Validação principal: manual, no navegador (viewport mobile), fluxo real
  ponta a ponta (tirar foto → conferir preview → adicionar → ver aparecer na
  tabela → exportar).
- Automatizado (`node:test` nativo, sem framework extra), só lógica pura:
  - função de fuzzy match contra o catálogo
  - função de renumeração de ID + montagem das linhas do export xlsx
  - parsing/validação do JSON retornado pela Claude API
- Sem E2E automatizado (fora de escopo).

## Pré-requisitos / dependências externas

- `ANTHROPIC_API_KEY` (Claude API, chamada vision)
- Projeto Supabase (URL + anon key) — criar novo ou usar existente (a
  confirmar antes de implementar)
- Deploy na Vercel (conta do usuário)
- Planilha `PRODUTOS - UNIDADES - MARCAS.xlsx` como fonte do seed de
  `catalogo_produtos`

## Decisões já tomadas (não reabrir sem motivo novo)

- Sem login.
- Tabela única (sem histórico de contagens nomeadas).
- ID do export é sequencial recalculado, não o id fixo do banco.
- Aviso de "produto novo" é informativo, não bloqueia adição.
- Stack vanilla (sem React/Next.js).
