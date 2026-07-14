import { supabase } from './supabaseClient.js';
import { findCatalogMatch } from './catalogMatch.js';
import { renderCatalogBadge } from './render.js';

let catalogo = [];
let currentMatch = null;

const photoInput = document.getElementById('photo-input');
const previewSection = document.getElementById('preview-section');
const previewNome = document.getElementById('preview-nome');
const previewTipo = document.getElementById('preview-tipo');
const previewQuantidade = document.getElementById('preview-quantidade');
const addBtn = document.getElementById('add-btn');
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
  currentMatch = null;
  renderCatalogBadge(null);

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
    const { nome_produto, tipo } = await response.json();
    previewNome.value = nome_produto;
    previewTipo.value = tipo;
    currentMatch = findCatalogMatch(nome_produto, catalogo);
    renderCatalogBadge(currentMatch);
  } catch (err) {
    showToast(`Não deu pra analisar a foto: ${err.message}. Preencha manualmente.`);
  } finally {
    addBtn.disabled = false;
  }
}

async function init() {
  const { data: catalogData, error: catalogError } = await supabase.from('catalogo_produtos').select('*');
  if (catalogError) {
    console.warn('Catálogo não carregou, seguindo sem match:', catalogError.message);
  } else {
    catalogo = catalogData;
  }

  photoInput.addEventListener('change', handlePhotoSelected);
}

init();
