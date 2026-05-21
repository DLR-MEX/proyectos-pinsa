// Router minimalista: muestra una sola "vista" según el ítem activo del sidebar.
// Las vistas son <section class="view" data-view="..."> dentro de <main>.

const _onChange = [];

export function onViewChange(fn) {
  _onChange.push(fn);
}

export function navigate(view) {
  document.querySelectorAll('.view').forEach(el => {
    el.classList.toggle('view-active', el.dataset.view === view);
  });
  document.querySelectorAll('.sidebar-item[data-view]').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });
  try { localStorage.setItem('chr_view', view); } catch {}
  _onChange.forEach(fn => { try { fn(view); } catch (e) { console.error(e); } });
}

// Vistas que no deben persistirse (son transientes y requieren contexto específico).
const _transientViews = new Set(['camara-detalle']);

export function initRouter(defaultView = 'resumen') {
  document.querySelectorAll('.sidebar-item[data-view]').forEach(item => {
    item.addEventListener('click', () => navigate(item.dataset.view));
  });
  let initial = defaultView;
  try {
    const saved = localStorage.getItem('chr_view');
    if (saved && !_transientViews.has(saved)) initial = saved;
  } catch {}
  navigate(initial);
}
