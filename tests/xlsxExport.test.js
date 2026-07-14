import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildExportRows } from '../js/xlsxExport.js';

test('ordena por created_at e renumera ID sequencialmente', () => {
  const produtos = [
    { id: 5, nome: 'MAIONESE HELLMANS 500G', quantidade: 3, tipo: 'seco', created_at: '2026-07-14T10:05:00Z' },
    { id: 2, nome: 'REDBULL LATA 250ML', quantidade: 10, tipo: 'resfriado', created_at: '2026-07-14T09:00:00Z' },
  ];
  assert.deepEqual(buildExportRows(produtos), [
    { ID: 1, 'NOME DO PRODUTO': 'REDBULL LATA 250ML', QUANTIDADE: 10, TIPO: 'resfriado' },
    { ID: 2, 'NOME DO PRODUTO': 'MAIONESE HELLMANS 500G', QUANTIDADE: 3, TIPO: 'seco' },
  ]);
});

test('lista vazia retorna array vazio', () => {
  assert.deepEqual(buildExportRows([]), []);
});

test('não deixa buraco de ID após exclusão (linha ausente simplesmente não entra)', () => {
  const produtos = [
    { id: 1, nome: 'A', quantidade: 1, tipo: 'seco', created_at: '2026-07-14T09:00:00Z' },
    { id: 3, nome: 'C', quantidade: 3, tipo: 'congelado', created_at: '2026-07-14T09:02:00Z' },
  ];
  const result = buildExportRows(produtos);
  assert.deepEqual(result.map((r) => r.ID), [1, 2]);
});
