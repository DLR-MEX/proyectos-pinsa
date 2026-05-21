// Stage 3D Babylon de los 11 cocedores en planta.
// Wrapper sobre scene3dCocedores que mantiene la API previa
// (renderCocedoresStage / onSelect / onOpenDetail / getSelected).

import { $ } from './dom.js';
import {
  initCocedoresScene, updateCocedoresScene, selectId as sceneSelectId,
} from './scene3dCocedores.js';

let _selectedId = 'cs02';
let _onSelectCb = null;
let _onOpenDetailCb = null;
let _initialized = false;
let _initFailed   = false;
let _pendingSnapshot = null;

export function onSelect(cb)     { _onSelectCb = cb; }
export function onOpenDetail(cb) { _onOpenDetailCb = cb; }
export function getSelected()    { return _selectedId; }

export function renderCocedoresStage(snapshot) {
  _pendingSnapshot = snapshot;
  if (_initFailed) return;
  if (!_initialized) {
    const canvas = $('#cocedores-canvas');
    const labels = $('#cocedores-labels');
    const stage  = $('#cocedores-stage');
    if (!canvas || !labels || !stage) {
      console.warn('[cocedoresStage] canvas/labels no listos aún');
      return;
    }
    if (typeof BABYLON === 'undefined') {
      // Babylon aún no cargó (CDN lento). Reintentamos en 250 ms hasta 5 s.
      console.warn('[cocedoresStage] BABYLON no disponible aún, reintentando…');
      _scheduleRetry();
      return;
    }
    try {
      initCocedoresScene({
        canvas,
        labelsRoot: labels,
        ids: snapshot.cocedores.map(c => c.id),
        onSelect: (id) => {
          _selectedId = id;
          _onSelectCb?.(id);
        },
        onOpenDetail: (id) => {
          _selectedId = id;
          _onOpenDetailCb?.(id);
        },
      });
      sceneSelectId(_selectedId);
      _initialized = true;
      console.log('[cocedoresStage] escena 3D inicializada OK');
      const loading = $('#stage-loading');
      if (loading) loading.classList.add('is-hidden');
    } catch (e) {
      _initFailed = true;
      console.error('[cocedoresStage] error al iniciar escena 3D:', e);
      _showError(stage, e.message);
      return;
    }
  }
  try {
    updateCocedoresScene(snapshot);
  } catch (e) {
    console.error('[cocedoresStage] error al actualizar escena 3D:', e);
  }
}

let _retryHandle = null;
let _retryAttempts = 0;
function _scheduleRetry() {
  if (_retryHandle) return;
  _retryHandle = setInterval(() => {
    _retryAttempts++;
    if (typeof BABYLON !== 'undefined') {
      clearInterval(_retryHandle);
      _retryHandle = null;
      console.log('[cocedoresStage] BABYLON detectado tras', _retryAttempts, 'reintentos');
      if (_pendingSnapshot) renderCocedoresStage(_pendingSnapshot);
    } else if (_retryAttempts > 60) {  // 60 × 250ms = 15s para CDN lenta
      clearInterval(_retryHandle);
      _retryHandle = null;
      _initFailed = true;
      _showError($('#cocedores-stage'),
        'Babylon.js no se cargó. Revisa tu conexión / bloqueador / firewall (CDN: cdn.babylonjs.com).');
    }
  }, 250);
}

function _showError(stage, msg) {
  const canvas = stage.querySelector('#cocedores-canvas');
  if (canvas) canvas.style.display = 'none';
  const existing = stage.querySelector('.stage-error');
  if (existing) existing.remove();
  const err = document.createElement('div');
  err.className = 'stage-error';
  err.style.cssText = `
    position:absolute; inset:20px; display:flex; flex-direction:column;
    align-items:center; justify-content:center; gap:8px;
    text-align:center; color:#FF4B4B; font-family:var(--font-ui);
    background:rgba(255,255,255,0.92); border:1px dashed rgba(255,75,75,0.45);
    border-radius:6px; padding:20px; z-index:10;
  `;
  err.innerHTML = `
    <div style="font-size:0.78rem; font-weight:700; letter-spacing:1.4px; text-transform:uppercase">
      ⚠ Render 3D no disponible
    </div>
    <div style="font-size:0.72rem; color:var(--c-text-mid); max-width:480px">${msg}</div>
  `;
  stage.append(err);
}
