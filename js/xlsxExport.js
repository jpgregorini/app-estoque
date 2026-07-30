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
