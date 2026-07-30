import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularQuantidadeTotal } from '../js/quantidadeTotal.js';

test('converte gramas pra kg (multiplica por quantidade, divide por 1000)', () => {
  assert.deepEqual(calcularQuantidadeTotal(500, 'g', 3), { valor: 1.5, unidade: 'kg' });
});

test('converte mililitros pra litros', () => {
  assert.deepEqual(calcularQuantidadeTotal(250, 'ml', 10), { valor: 2.5, unidade: 'l' });
});

test('kg já vem pronto, só multiplica pela quantidade', () => {
  assert.deepEqual(calcularQuantidadeTotal(5, 'kg', 2), { valor: 10, unidade: 'kg' });
});

test('litro já vem pronto, só multiplica pela quantidade', () => {
  assert.deepEqual(calcularQuantidadeTotal(1, 'l', 6), { valor: 6, unidade: 'l' });
});

test('retorna null quando peso/volume é null', () => {
  assert.equal(calcularQuantidadeTotal(null, null, 5), null);
});

test('retorna null quando unidade é null mesmo com peso/volume preenchido', () => {
  assert.equal(calcularQuantidadeTotal(250, null, 5), null);
});
