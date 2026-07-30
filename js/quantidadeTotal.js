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
