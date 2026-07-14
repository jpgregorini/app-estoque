function normalize(str) {
  return str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function bigrams(str) {
  const grams = [];
  for (let i = 0; i < str.length - 1; i++) {
    grams.push(str.slice(i, i + 2));
  }
  return grams;
}

function diceCoefficient(a, b) {
  const bigramsA = bigrams(a);
  const bigramsB = bigrams(b);
  if (bigramsA.length === 0 || bigramsB.length === 0) {
    return a === b ? 1 : 0;
  }
  const bMap = new Map();
  for (const gram of bigramsB) {
    bMap.set(gram, (bMap.get(gram) || 0) + 1);
  }
  let matches = 0;
  for (const gram of bigramsA) {
    const count = bMap.get(gram) || 0;
    if (count > 0) {
      matches++;
      bMap.set(gram, count - 1);
    }
  }
  return (2 * matches) / (bigramsA.length + bigramsB.length);
}

export function similarity(a, b) {
  return diceCoefficient(normalize(a), normalize(b));
}

export function findCatalogMatch(nomeProduto, catalogo, threshold = 0.35) {
  let best = null;
  for (const entry of catalogo) {
    const label = `${entry.marca ?? ''} ${entry.produto}`.trim();
    const score = similarity(nomeProduto, label);
    if (!best || score > best.score) {
      best = { entry, score };
    }
  }
  if (!best || best.score < threshold) {
    return null;
  }
  return best;
}

export { normalize };
