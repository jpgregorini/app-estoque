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
