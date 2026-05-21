// SVG inline para iconos KPI (sidebar + KPI bar). Devuelven strings — se
// inyectan con innerHTML para mantenerlos ligeros.

export const ICONS = {
  // Sidebar
  dashboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>`,
  cocedores: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="6" rx="7" ry="2.5"/><path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6"/><path d="M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5"/></svg>`,
  carritos:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="6" width="13" height="10" rx="1"/><circle cx="7" cy="19" r="1.5"/><circle cx="14" cy="19" r="1.5"/><path d="M16 9l5 0 0 7-3 0"/></svg>`,
  alertas:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l10 17H2L12 3z"/><line x1="12" y1="10" x2="12" y2="14"/><circle cx="12" cy="17" r="0.8" fill="currentColor"/></svg>`,
  reportes:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="16" height="18" rx="1"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/></svg>`,
  trazabilidad: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><line x1="7" y1="12" x2="10" y2="12"/><line x1="14" y1="12" x2="17" y2="12"/></svg>`,
  config:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19 12c0 .4-.04.78-.1 1.15l2.1 1.6-2 3.4-2.4-1a7 7 0 0 1-2 1.15L14 21h-4l-.6-2.7a7 7 0 0 1-2-1.15l-2.4 1-2-3.4 2.1-1.6A7 7 0 0 1 5 12c0-.4.04-.78.1-1.15L3 9.25l2-3.4 2.4 1A7 7 0 0 1 9.4 5.7L10 3h4l.6 2.7a7 7 0 0 1 2 1.15l2.4-1 2 3.4-2.1 1.6c.06.37.1.75.1 1.15z"/></svg>`,

  // KPI cards
  pot: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="12" cy="7" rx="8" ry="2.5"/><path d="M4 7v9c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5V7"/><line x1="9" y1="3" x2="9" y2="6"/><line x1="15" y1="3" x2="15" y2="6"/><path d="M8 14c1 .6 2.4 1 4 1s3-.4 4-1" opacity="0.6"/></svg>`,
  cart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="6" width="13" height="10" rx="1"/><circle cx="7" cy="19" r="1.5" fill="currentColor"/><circle cx="14" cy="19" r="1.5" fill="currentColor"/><path d="M16 9l5 0 0 7-3 0"/><line x1="6" y1="9" x2="13" y2="9"/><line x1="6" y1="12" x2="13" y2="12"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9" stroke-width="1.6"/><path d="M8 12.5l3 3 5-6.5"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2.5"/></svg>`,
  warn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l10 17H2L12 3z"/><line x1="12" y1="10" x2="12" y2="14" stroke-width="2.4"/><circle cx="12" cy="17" r="1" fill="currentColor"/></svg>`,
};
