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

test('formatQuantidadeTotal formata com 3 casas decimais e a unidade', () => {
  const resultado = calcularQuantidadeTotal(500, 'g', 3);
  assert.equal(formatQuantidadeTotal(resultado), '1.500 kg');
});

test('formatQuantidadeTotal retorna "-" quando o resultado é null', () => {
  assert.equal(formatQuantidadeTotal(null), '-');
});
