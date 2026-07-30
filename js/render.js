import { calcularQuantidadeTotal } from './quantidadeTotal.js';
import { formatDataHora, formatQuantidadeTotal } from './format.js';

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
      <td>${formatDataHora(p.created_at)}</td>
      <td>${formatQuantidadeTotal(calcularQuantidadeTotal(p.peso_volume_unidade, p.unidade_medida, p.quantidade))}</td>
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
