import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildExportRows } from '../js/xlsxExport.js';
import { formatDataHora } from '../js/format.js';

test('ordena por created_at e renumera ID sequencialmente', () => {
  const produtos = [
    {
      id: 5,
      nome: 'MAIONESE HELLMANS 500G',
      quantidade: 3,
      tipo: 'seco',
      created_at: '2026-07-14T10:05:00Z',
      peso_volume_unidade: 500,
      unidade_medida: 'g',
    },
    {
      id: 2,
      nome: 'REDBULL LATA 250ML',
      quantidade: 10,
      tipo: 'resfriado',
      created_at: '2026-07-14T09:00:00Z',
      peso_volume_unidade: 250,
      unidade_medida: 'ml',
    },
  ];
  assert.deepEqual(buildExportRows(produtos), [
    {
      ID: 1,
      'NOME DO PRODUTO': 'REDBULL LATA 250ML',
      QUANTIDADE: 10,
      TIPO: 'resfriado',
      'DATA DE CRIAÇÃO': formatDataHora('2026-07-14T09:00:00Z'),
      'QUANTIDADE (KG/L)': '2,5 L',
    },
    {
      ID: 2,
      'NOME DO PRODUTO': 'MAIONESE HELLMANS 500G',
      QUANTIDADE: 3,
      TIPO: 'seco',
      'DATA DE CRIAÇÃO': formatDataHora('2026-07-14T10:05:00Z'),
      'QUANTIDADE (KG/L)': '1,5 KG',
    },
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

test('produto sem peso/volume mostra "-" na coluna de quantidade total', () => {
  const produtos = [
    { id: 1, nome: 'ABACATE', quantidade: 5, tipo: 'resfriado', created_at: '2026-07-14T09:00:00Z' },
  ];
  const result = buildExportRows(produtos);
  assert.equal(result[0]['QUANTIDADE (KG/L)'], '-');
});
