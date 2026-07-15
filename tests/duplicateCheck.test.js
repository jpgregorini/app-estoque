import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findDuplicateProduto } from '../js/duplicateCheck.js';

test('acha duplicata com nome quase idêntico (variação de digitação da IA)', () => {
  const produtos = [
    { id: 1, nome: 'REDBULL LATA 250ML', quantidade: 5 },
    { id: 2, nome: 'ARROZ BRANCO 5KG', quantidade: 10 },
  ];
  const result = findDuplicateProduto('RED BULL LATA 250ML', produtos);
  assert.ok(result);
  assert.equal(result.produto.id, 1);
});

test('não acha duplicata em lista vazia', () => {
  assert.equal(findDuplicateProduto('REDBULL LATA 250ML', []), null);
});

test('não confunde produtos parecidos mas diferentes (threshold 0.7 é mais rígido que o do catálogo)', () => {
  const produtos = [{ id: 1, nome: 'SUCO DE UVA 1L', quantidade: 3 }];
  const result = findDuplicateProduto('SUCO DE LARANJA 1L', produtos);
  assert.equal(result, null);
});

test('não acha duplicata quando nome é completamente diferente', () => {
  const produtos = [{ id: 1, nome: 'REDBULL LATA 250ML', quantidade: 5 }];
  const result = findDuplicateProduto('ARROZ BRANCO 5KG', produtos);
  assert.equal(result, null);
});
