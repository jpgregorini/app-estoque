import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDataHora, formatQuantidadeTotal } from '../js/format.js';
import { calcularQuantidadeTotal } from '../js/quantidadeTotal.js';

test('formatDataHora segue o formato dd/mm/aaaa hh:mm', () => {
  const resultado = formatDataHora('2026-07-15T17:32:00.000Z');
  assert.match(resultado, /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
});

test('formatDataHora usa os campos locais da data (dia/mês/ano/hora/minuto com zero à esquerda)', () => {
  const iso = '2026-07-15T17:32:00.000Z';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  const esperado = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  assert.equal(formatDataHora(iso), esperado);
});

test('formatQuantidadeTotal usa vírgula decimal (pt-BR) e unidade maiúscula', () => {
  const resultado = calcularQuantidadeTotal(500, 'g', 3);
  assert.equal(formatQuantidadeTotal(resultado), '1,5 KG');
});

test('formatQuantidadeTotal não mostra casas decimais em valor inteiro (açúcar 2KG x 50)', () => {
  const resultado = calcularQuantidadeTotal(2, 'kg', 50);
  assert.equal(formatQuantidadeTotal(resultado), '100 KG');
});

test('formatQuantidadeTotal usa ponto só como separador de milhar', () => {
  const resultado = calcularQuantidadeTotal(1, 'l', 1500);
  assert.equal(formatQuantidadeTotal(resultado), '1.500 L');
});

test('formatQuantidadeTotal limita a 3 casas decimais', () => {
  assert.equal(formatQuantidadeTotal({ valor: 0.3333333, unidade: 'kg' }), '0,333 KG');
});

test('formatQuantidadeTotal retorna "-" quando o resultado é null', () => {
  assert.equal(formatQuantidadeTotal(null), '-');
});
