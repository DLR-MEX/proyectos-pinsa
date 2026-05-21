// Router minimalista por data-view. Persiste vista activa en localStorage.
// Soporta vistas "contextuales" (no listadas en sidebar, ej. detalle-cocedor).

const SIDEBAR_VIEWS = new Set([
  'dashboard', 'cocedores', 'carritos', 'alertas',
  'reportes', 'trazabilidad', 'config',
]);

const STORAGE_KEY = 'pinsa-coc-view';

const listeners = new Set();
let _current = null;

export function initRouter() {
  const initial = _readStored() ?? 'dashboard';
  show(initial, { silent: true });
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-go-view]');
    if (!trigger) return;
    e.preventDefault();
    show(trigger.dataset.goView, { ctx: trigger.dataset.ctx });
  });
}

export function show(viewId, { silent = false, ctx = null } = {}) {
  if (_current === viewId && !ctx) return;
  _current = viewId;

  // Ocultar todas, mostrar la activa
  document.querySelectorAll('[data-view]').forEach(node => {
    const match = node.dataset.view === viewId;
    if (node.classList.contains('view')) {
      node.style.display = match ? '' : 'none';
    }
  });

  // Sidebar active state (solo si es view del sidebar)
  if (SIDEBAR_VIEWS.has(viewId)) {
    document.querySelectorAll('.sidebar-item').forEach(n => {
      n.classList.toggle('active', n.dataset.view === viewId);
    });
    _writeStored(viewId);
  }

  if (!silent) {
    listeners.forEach(fn => { try { fn(viewId, ctx); } catch {} });
  } else {
    // Igual notificamos a los listeners en boot para que pinten contenido inicial
    listeners.forEach(fn => { try { fn(viewId, ctx); } catch {} });
  }
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function current() { return _current; }

function _readStored() {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}
function _writeStored(v) {
  try { localStorage.setItem(STORAGE_KEY, v); } catch {}
}
