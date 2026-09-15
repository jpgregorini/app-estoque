export function formatDataHora(isoString) {
  const d = new Date(isoString);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const numeroPtBr = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

export function formatQuantidadeTotal(resultado) {
  if (!resultado) {
    return '-';
  }
  return `${numeroPtBr.format(resultado.valor)} ${resultado.unidade.toUpperCase()}`;
}
