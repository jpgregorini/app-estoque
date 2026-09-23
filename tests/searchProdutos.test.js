import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filtrarProdutos } from '../js/searchProdutos.js';

const PRODUTOS = [
  { id: 1, nome: 'AÇÚCAR REFINADO UNIÃO 2KG' },
  { id: 2, nome: 'ITALAC LEITE INTEGRAL 1L' },
  { id: 3, nome: "MAIONESE HELLMANN'S 500G" },
];

const nomes = (lista) => lista.map((p) => p.nome);

test('termo em branco devolve todos os produtos', () => {
  assert.deepEqual(filtrarProdutos(PRODUTOS, ''), PRODUTOS);
  assert.deepEqual(filtrarProdutos(PRODUTOS, '   '), PRODUTOS);
});

test('acha por pedaço do nome', () => {
  assert.deepEqual(nomes(filtrarProdutos(PRODUTOS, 'leite')), ['ITALAC LEITE INTEGRAL 1L']);
});

test('ignora maiúsculas e minúsculas', () => {
  assert.deepEqual(nomes(filtrarProdutos(PRODUTOS, 'MaIoNeSe')), ["MAIONESE HELLMANN'S 500G"]);
});

test('ignora acentos nos dois lados (busca e nome)', () => {
  assert.deepEqual(nomes(filtrarProdutos(PRODUTOS, 'acucar')), ['AÇÚCAR REFINADO UNIÃO 2KG']);
  assert.deepEqual(nomes(filtrarProdutos(PRODUTOS, 'AÇÚCAR')), ['AÇÚCAR REFINADO UNIÃO 2KG']);
  assert.deepEqual(nomes(filtrarProdutos(PRODUTOS, 'uniao')), ['AÇÚCAR REFINADO UNIÃO 2KG']);
});

test('vários termos precisam todos aparecer, em qualquer ordem', () => {
  assert.deepEqual(nomes(filtrarProdutos(PRODUTOS, 'uniao 2kg')), ['AÇÚCAR REFINADO UNIÃO 2KG']);
  assert.deepEqual(nomes(filtrarProdutos(PRODUTOS, '2kg uniao')), ['AÇÚCAR REFINADO UNIÃO 2KG']);
  assert.deepEqual(filtrarProdutos(PRODUTOS, 'uniao leite'), []);
});

test('espaços extras entre os termos não quebram a busca', () => {
  assert.deepEqual(nomes(filtrarProdutos(PRODUTOS, '  uniao   2kg  ')), ['AÇÚCAR REFINADO UNIÃO 2KG']);
});

test('sem resultado devolve lista vazia', () => {
  assert.deepEqual(filtrarProdutos(PRODUTOS, 'inexistente'), []);
});

test('não altera a lista original nem a ordem', () => {
  const copia = [...PRODUTOS];
  const resultado = filtrarProdutos(PRODUTOS, 'a');
  assert.deepEqual(PRODUTOS, copia);
  assert.deepEqual(nomes(resultado), nomes(PRODUTOS.filter((p) => nomes([p])[0].toLowerCase().includes('a'))));
});

test('produto sem nome não quebra a busca', () => {
  assert.deepEqual(filtrarProdutos([{ id: 9, nome: null }], 'leite'), []);
});
