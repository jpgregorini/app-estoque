import { similarity } from './catalogMatch.js';

export function findDuplicateProduto(nomeProduto, produtos, threshold = 0.7) {
  let best = null;
  for (const produto of produtos) {
    const score = similarity(nomeProduto, produto.nome);
    if (!best || score > best.score) {
      best = { produto, score };
    }
  }
  if (!best || best.score < threshold) {
    return null;
  }
  return best;
}
