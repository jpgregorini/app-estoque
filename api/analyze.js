import Anthropic from '@anthropic-ai/sdk';
import { parseAnalyzeResponse, TIPOS_VALIDOS } from '../js/analyzeSchema.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MAX_BASE64_LENGTH = 6_000_000;

const SYSTEM_PROMPT = `Você analisa fotos de produtos de um estoque de supermercado/restaurante.
Responda SOMENTE com um JSON, sem markdown, no formato exato:
{"nome_produto": "MARCA PRODUTO EMBALAGEM", "tipo": "seco"}

Regras pro campo "nome_produto":
- Maiúsculo, compacto, no estilo "REDBULL LATA 250ML" ou "MAIONESE HELLMANS 500G".
- Inclua marca (se visível), descrição do produto e tamanho/embalagem (se visível).

Regras pro campo "tipo": deve ser exatamente um destes valores: ${TIPOS_VALIDOS.join(', ')}.
- "congelado": produto visivelmente congelado ou de freezer/embalagem para congelados.
- "resfriado": produto de geladeira/refrigerado (laticínios, frios, bebidas geladas, etc).
- "seco": mantimento de prateleira, não perecível na embalagem original.

Se não conseguir identificar algo com confiança, faça sua melhor estimativa —
nunca deixe de responder no formato JSON pedido.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { imageBase64, mediaType } = req.body ?? {};
  if (!imageBase64 || !mediaType) {
    res.status(400).json({ error: 'imageBase64 e mediaType são obrigatórios' });
    return;
  }
  if (imageBase64.length > MAX_BASE64_LENGTH) {
    res.status(413).json({ error: 'Imagem muito grande' });
    return;
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1024,
      thinking: { type: 'disabled' },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: 'Analise esta foto de produto de estoque.' },
          ],
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === 'text');
    const parsed = parseAnalyzeResponse(textBlock?.text ?? '');
    res.status(200).json(parsed);
  } catch (err) {
    res.status(502).json({ error: err.message || 'Falha ao analisar imagem' });
  }
}
