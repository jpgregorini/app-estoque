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
