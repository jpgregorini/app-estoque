import { supabase } from './supabaseClient.js';
import { findCatalogMatch } from './catalogMatch.js';
import { findDuplicateProduto } from './duplicateCheck.js';
import { renderCatalogBadge, renderDuplicateBadge, renderTable } from './render.js';
import { buildExportRows } from './xlsxExport.js';

const UNIDADES_VALIDAS = ['g', 'ml', 'kg', 'l'];

let catalogo = [];
let produtos = [];
let currentMatch = null;

const photoInput = document.getElementById('photo-input');
const previewSection = document.getElementById('preview-section');
const previewNome = document.getElementById('preview-nome');
const previewTipo = document.getElementById('preview-tipo');
const previewQuantidade = document.getElementById('preview-quantidade');
const previewPesoVolume = document.getElementById('preview-peso-volume');
const previewUnidade = document.getElementById('preview-unidade');
const addBtn = document.getElementById('add-btn');
const exportBtn = document.getElementById('export-btn');
const toast = document.getElementById('toast');

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  toast.className = 'toast toast-error';
  setTimeout(() => { toast.hidden = true; }, 4000);
}

function resizeImageForUpload(file, maxDimension = 1024, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler arquivo de imagem'));
    reader.onload = () => {
      img.onerror = () => reject(new Error('Falha ao carregar imagem'));
      img.onload = () => {
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve({ base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function handlePhotoSelected(event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;

  addBtn.disabled = true;
  previewSection.hidden = false;
  previewNome.value = '';
  previewTipo.value = 'seco';
  previewQuantidade.value = '';
  previewPesoVolume.value = '';
  previewUnidade.value = '';
  currentMatch = null;
  renderCatalogBadge(null);
  renderDuplicateBadge(null);

  try {
    const { base64, mediaType } = await resizeImageForUpload(file);
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64, mediaType }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Erro ${response.status}`);
    }
    const { nome_produto, tipo, peso_volume_unidade, unidade_medida } = await response.json();
    previewNome.value = nome_produto;
    previewTipo.value = tipo;
    previewPesoVolume.value = peso_volume_unidade ?? '';
    previewUnidade.value = unidade_medida ?? '';
    currentMatch = findCatalogMatch(nome_produto, catalogo);
    renderCatalogBadge(currentMatch);
    renderDuplicateBadge(findDuplicateProduto(nome_produto, produtos));
  } catch (err) {
    showToast(`Não deu pra analisar a foto: ${err.message}. Preencha manualmente.`);
  } finally {
    addBtn.disabled = false;
  }
}

async function handleAdd() {
  const nome = previewNome.value.trim();
  const tipo = previewTipo.value;
  const quantidadeStr = previewQuantidade.value.trim();
  const quantidade = Number(quantidadeStr);
  const pesoVolumeStr = previewPesoVolume.value.trim();
  const unidadeMedida = previewUnidade.value || null;

  if (!nome) return showToast('Preencha o nome do produto.');
  if (!quantidadeStr || !Number.isFinite(quantidade) || quantidade < 0) return showToast('Preencha uma quantidade válida.');

  let pesoVolumeUnidade = null;
  if (pesoVolumeStr || unidadeMedida) {
    if (!pesoVolumeStr || !unidadeMedida) {
      return showToast('Preencha peso/volume e unidade juntos, ou deixe os dois em branco.');
    }
    pesoVolumeUnidade = Number(pesoVolumeStr.replace(',', '.'));
    if (!Number.isFinite(pesoVolumeUnidade) || pesoVolumeUnidade <= 0) {
      return showToast('Peso/volume por unidade inválido.');
    }
  }

  addBtn.disabled = true;
  try {
    const { error } = await supabase.from('produtos').insert({
      nome,
      tipo,
      quantidade,
      produto_novo: currentMatch === null,
      peso_volume_unidade: pesoVolumeUnidade,
      unidade_medida: unidadeMedida,
    });
    if (error) throw error;
    previewSection.hidden = true;
  } catch (err) {
    showToast(`Erro ao adicionar: ${err.message}`);
  } finally {
    addBtn.disabled = false;
  }
}

async function onEditProduto(produto) {
  const novoNome = window.prompt('Nome do produto:', produto.nome);
  if (novoNome === null) return;
  const novoTipo = window.prompt('Tipo (seco/resfriado/congelado):', produto.tipo);
  if (novoTipo === null) return;
  if (!['seco', 'resfriado', 'congelado'].includes(novoTipo)) {
    window.alert('Tipo inválido. Use: seco, resfriado ou congelado.');
    return;
  }
  const novaQuantidadeStr = window.prompt('Quantidade:', String(produto.quantidade));
  if (novaQuantidadeStr === null) return;
  const novaQuantidade = Number(novaQuantidadeStr);
  if (!Number.isFinite(novaQuantidade) || novaQuantidade < 0) {
    window.alert('Quantidade inválida.');
    return;
  }
  const novoPesoVolumeStr = window.prompt(
    'Peso/volume por unidade (deixe em branco se não souber):',
    produto.peso_volume_unidade != null ? String(produto.peso_volume_unidade) : ''
  );
  if (novoPesoVolumeStr === null) return;
  const novaUnidadeStr = window.prompt(
    'Unidade (g/ml/kg/l — deixe em branco se peso/volume estiver em branco):',
    produto.unidade_medida ?? ''
  );
  if (novaUnidadeStr === null) return;

  const pesoVolumeTrim = novoPesoVolumeStr.trim();
  const unidadeTrim = novaUnidadeStr.trim();
  let novoPesoVolumeUnidade = null;
  let novaUnidadeFinal = null;
  if (pesoVolumeTrim || unidadeTrim) {
    if (!pesoVolumeTrim || !unidadeTrim || !UNIDADES_VALIDAS.includes(unidadeTrim)) {
      window.alert('Preencha peso/volume e uma unidade válida (g/ml/kg/l) juntos, ou deixe os dois em branco.');
      return;
    }
    novoPesoVolumeUnidade = Number(pesoVolumeTrim.replace(',', '.'));
    if (!Number.isFinite(novoPesoVolumeUnidade) || novoPesoVolumeUnidade <= 0) {
      window.alert('Peso/volume por unidade inválido.');
      return;
    }
    novaUnidadeFinal = unidadeTrim;
  }

  const { error } = await supabase
    .from('produtos')
    .update({
      nome: novoNome.trim(),
      tipo: novoTipo,
      quantidade: novaQuantidade,
      peso_volume_unidade: novoPesoVolumeUnidade,
      unidade_medida: novaUnidadeFinal,
    })
    .eq('id', produto.id);
  if (error) window.alert(`Erro ao salvar: ${error.message}`);
}

async function onDeleteProduto(produto) {
  if (!window.confirm(`Excluir "${produto.nome}"?`)) return;
  const { error } = await supabase
    .from('produtos')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', produto.id);
  if (error) window.alert(`Erro ao excluir: ${error.message}`);
}

function applyRealtimeChange(payload) {
  if (payload.eventType === 'INSERT') {
    if (payload.new.deleted_at) return;
    produtos = [...produtos, payload.new].sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at)
    );
  } else if (payload.eventType === 'UPDATE') {
    if (payload.new.deleted_at) {
      produtos = produtos.filter((p) => p.id !== payload.new.id);
    } else {
      produtos = produtos.map((p) => (p.id === payload.new.id ? payload.new : p));
    }
  } else if (payload.eventType === 'DELETE') {
    produtos = produtos.filter((p) => p.id !== payload.old.id);
  }
  renderTable(produtos, { onEdit: onEditProduto, onDelete: onDeleteProduto });
}

function exportToXlsx(rows) {
  const data = buildExportRows(rows);
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Estoque');
  const dateStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `contagem-estoque-${dateStr}.xlsx`);
}

async function init() {
  const { data: catalogData, error: catalogError } = await supabase.from('catalogo_produtos').select('*');
  if (catalogError) {
    console.warn('Catálogo não carregou, seguindo sem match:', catalogError.message);
  } else {
    catalogo = catalogData;
  }

  const { data: produtosData, error: produtosError } = await supabase
    .from('produtos')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (produtosError) {
    showToast(`Erro ao carregar tabela: ${produtosError.message}`);
  } else {
    produtos = produtosData;
  }
  renderTable(produtos, { onEdit: onEditProduto, onDelete: onDeleteProduto });

  supabase
    .channel('produtos-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'produtos' }, applyRealtimeChange)
    .subscribe();

  photoInput.addEventListener('change', handlePhotoSelected);
  addBtn.addEventListener('click', handleAdd);
  exportBtn.addEventListener('click', () => exportToXlsx(produtos));
}

init();
