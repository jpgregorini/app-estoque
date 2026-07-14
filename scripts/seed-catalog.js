import { createClient } from '@supabase/supabase-js';
import xlsx from 'xlsx';

const SOURCE_PATH = process.argv[2] ?? '/Users/jpgregorini/Desktop/PRODUTOS - UNIDADES - MARCAS.xlsx';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY antes de rodar.');
  process.exit(1);
}

function normalizeMarca(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (/^-+$/.test(trimmed)) return null;
  return trimmed;
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const workbook = xlsx.readFile(SOURCE_PATH);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null });
const [, ...dataRows] = rows;

const catalogo = [];
let marcaAtual = null;

for (const row of dataRows) {
  const [marca, produto, ...unidadeCols] = row;
  if (!produto) continue;
  if (marca) marcaAtual = normalizeMarca(marca);
  const unidades = unidadeCols
    .filter((value) => value !== null && value !== undefined && String(value).trim() !== '')
    .map((value) => String(value).trim());
  catalogo.push({ marca: marcaAtual, produto: String(produto).trim(), unidades });
}

console.log(`Lidas ${catalogo.length} linhas de produto. Inserindo no Supabase...`);

const { error } = await supabase.from('catalogo_produtos').insert(catalogo);
if (error) {
  console.error('Falha ao inserir:', error.message);
  process.exit(1);
}

console.log('Seed concluído.');
