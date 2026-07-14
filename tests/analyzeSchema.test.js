import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAnalyzeResponse } from '../js/analyzeSchema.js';

test('parseia resposta JSON válida', () => {
  const result = parseAnalyzeResponse('{"nome_produto": "REDBULL LATA 250ML", "tipo": "resfriado"}');
  assert.deepEqual(result, { nome_produto: 'REDBULL LATA 250ML', tipo: 'resfriado' });
});

test('remove cercas de markdown antes de parsear', () => {
  const result = parseAnalyzeResponse('```json\n{"nome_produto": "ACAI POLPA 1KG", "tipo": "congelado"}\n```');
  assert.deepEqual(result, { nome_produto: 'ACAI POLPA 1KG', tipo: 'congelado' });
});

test('lança erro em JSON inválido', () => {
  assert.throws(() => parseAnalyzeResponse('não é json'), /JSON válido/);
});

test('lança erro quando falta nome_produto', () => {
  assert.throws(() => parseAnalyzeResponse('{"tipo": "seco"}'), /nome_produto/);
});

test('lança erro quando tipo é inválido', () => {
  assert.throws(() => parseAnalyzeResponse('{"nome_produto": "X", "tipo": "quente"}'), /tipo/);
});
