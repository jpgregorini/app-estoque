function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function filtrarProdutos(produtos, termo) {
  const termos = normalizar(termo).split(/\s+/).filter(Boolean);
  if (termos.length === 0) {
    return produtos;
  }
  return produtos.filter((produto) => {
    const nome = normalizar(produto.nome);
    return termos.every((t) => nome.includes(t));
  });
}
