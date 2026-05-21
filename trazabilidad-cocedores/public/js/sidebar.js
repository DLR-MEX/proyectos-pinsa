// Sidebar: 7 items + badge de alertas. Click → router.show()

import { $, el, clear } from './dom.js';
import { ICONS } from './svgIcons.js';
import { show as routerShow } from './router.js';

const ITEMS = [
  { id: 'dashboard',    label: 'Dashboard',     icon: ICONS.dashboard },
  { id: 'cocedores',    label: 'Cocedores',     icon: ICONS.cocedores },
  { id: 'carritos',     label: 'Carritos',      icon: ICONS.carritos },
  { id: 'alertas',      label: 'Alertas',       icon: ICONS.alertas, badge: true },
  { id: 'reportes',     label: 'Reportes',      icon: ICONS.reportes },
  { id: 'trazabilidad', label: 'Trazabilidad',  icon: ICONS.trazabilidad },
  { id: 'config',       label: 'Configuración', icon: ICONS.config },
];

export function initSidebar() {
  const root = $('#sidebar-nav');
  clear(root);
  for (const it of ITEMS) {
    const li = el('li', {
      class: 'sidebar-item',
      role: 'button',
      tabindex: 0,
      dataset: { view: it.id },
      onclick: () => routerShow(it.id),
      onkeydown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); routerShow(it.id); }
      },
    });
    li.innerHTML = `
      <span class="sidebar-icon">${it.icon}</span>
      <span>${it.label}</span>
      ${it.badge ? `<span class="sidebar-badge" id="alert-badge">0</span>` : ''}
    `;
    root.append(li);
  }
}

export function setAlertBadge(count) {
  const b = $('#alert-badge');
  if (!b) return;
  b.textContent = String(count);
  b.classList.toggle('has-alerts', count > 0);
}
