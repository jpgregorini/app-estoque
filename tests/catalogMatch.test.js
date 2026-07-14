import { test } from 'node:test';
import assert from 'node:assert/strict';
import { similarity, findCatalogMatch } from '../js/catalogMatch.js';

test('similarity é 1 para strings idênticas', () => {
  assert.equal(similarity('REDBULL LATA 250ML', 'REDBULL LATA 250ML'), 1);
});

test('similarity é alta ignorando acento e caixa', () => {
  const score = similarity('Açaí Polpa 1kg', 'ACAI POLPA 1KG');
  assert.ok(score > 0.9, `esperado > 0.9, veio ${score}`);
});

test('findCatalogMatch acha o melhor match acima do threshold', () => {
  const catalogo = [
    { id: 1, marca: 'ADES', produto: 'BEBIDA DE SOJA', unidades: ['1LT'] },
    { id: 2, marca: 'HELLMANS', produto: 'MAIONESE', unidades: ['UND 500G'] },
  ];
  const result = findCatalogMatch('ADES BEBIDA DE SOJA 1L', catalogo);
  assert.ok(result);
  assert.equal(result.entry.id, 1);
});

test('findCatalogMatch retorna null quando nada bate bem', () => {
  const catalogo = [
    { id: 1, marca: 'ADES', produto: 'BEBIDA DE SOJA', unidades: ['1LT'] },
    { id: 2, marca: 'HELLMANS', produto: 'MAIONESE', unidades: ['UND 500G'] },
  ];
  const result = findCatalogMatch('PRODUTO TOTALMENTE DIFERENTE XYZ', catalogo);
  assert.equal(result, null);
});
