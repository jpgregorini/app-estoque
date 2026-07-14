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
