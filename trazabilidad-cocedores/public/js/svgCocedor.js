// Generador de SVG inline del cocedor cilíndrico visto en perspectiva.
// Modo "exterior": cilindro con puerta abierta (vista 3D), carritos asomando.
// Modo "interior": vista frontal con charolas apiladas (16 por carrito).

const COL = {
  bodyTop:    '#2A4660',
  bodyBot:    '#0F1C2C',
  rim:        '#4F7CA8',
  rimHi:      '#8FB6DD',
  cavity:     '#06101A',
  rail:       '#2B3D52',
  cart:       '#7A8FA5',
  cartHi:     '#B6C7DA',
  shelf:      '#2E80D8',
  shelfHot:   '#F5A623',
  ground:     '#0A1320',
};

/**
 * Cocedor exterior — cilindro horizontal con tapa frontal abierta.
 * @param {object} opts
 * @param {string} opts.state    EN_PROCESO | LISTO | ESPERA | MANTENIMIENTO | DESACTIVADO
 * @param {number} opts.carritos número de carritos cargados (0..28)
 * @param {boolean} opts.selected
 */
export function svgCocedorExterior({ state = 'ESPERA', carritos = 0, selected = false } = {}) {
  const hot = state === 'EN_PROCESO';
  const dim = state === 'DESACTIVADO' || state === 'MANTENIMIENTO';
  const opacity = dim ? 0.5 : 1;
  const glow = hot ? `<filter id="g1"><feGaussianBlur stdDeviation="2"/></filter>` : '';
  const innerColor = hot ? '#F5A623' : (state === 'LISTO' ? '#00C896' : '#1B3553');

  // Carritos asomando por la apertura (máx 2 visibles, el resto sobreentendido).
  const visibleCarritos = Math.min(carritos, 2);
  const carts = Array.from({ length: visibleCarritos }, (_, i) => {
    const x = 22 + i * 11;
    return `
      <rect x="${x}" y="52" width="9" height="32" rx="1" fill="${COL.cart}" stroke="${COL.cartHi}" stroke-width="0.5" opacity="${opacity}"/>
      <line x1="${x+1}" y1="58" x2="${x+8}" y2="58" stroke="${COL.cartHi}" stroke-width="0.4"/>
      <line x1="${x+1}" y1="64" x2="${x+8}" y2="64" stroke="${COL.cartHi}" stroke-width="0.4"/>
      <line x1="${x+1}" y1="70" x2="${x+8}" y2="70" stroke="${COL.cartHi}" stroke-width="0.4"/>
      <line x1="${x+1}" y1="76" x2="${x+8}" y2="76" stroke="${COL.cartHi}" stroke-width="0.4"/>
      <circle cx="${x+1.5}" cy="83" r="1.2" fill="${COL.bodyBot}"/>
      <circle cx="${x+7.5}" cy="83" r="1.2" fill="${COL.bodyBot}"/>
    `;
  }).join('');

  return `
<svg class="cocedor-svg" viewBox="0 0 110 130" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bodyGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${COL.bodyTop}"/>
      <stop offset="1" stop-color="${COL.bodyBot}"/>
    </linearGradient>
    <radialGradient id="cavityGrad" cx="0.5" cy="0.5" r="0.7">
      <stop offset="0" stop-color="${innerColor}" stop-opacity="${hot ? 0.5 : 0.25}"/>
      <stop offset="1" stop-color="${COL.cavity}"/>
    </radialGradient>
    ${glow}
  </defs>

  <!-- Sombra base -->
  <ellipse cx="55" cy="120" rx="45" ry="4" fill="${COL.ground}" opacity="0.7"/>

  <!-- Cilindro: cuerpo principal -->
  <g opacity="${opacity}">
    <!-- Cuerpo lateral -->
    <rect x="14" y="34" width="82" height="62" fill="url(#bodyGrad)" stroke="${COL.rim}" stroke-width="0.7"/>
    <!-- Tapa trasera (sombra circular indicando profundidad) -->
    <ellipse cx="96" cy="65" rx="6" ry="31" fill="${COL.bodyTop}" stroke="${COL.rim}" stroke-width="0.5"/>
    <!-- Banda decorativa -->
    <rect x="14" y="38" width="82" height="2" fill="${COL.rim}" opacity="0.5"/>
    <rect x="14" y="92" width="82" height="2" fill="${COL.rim}" opacity="0.5"/>

    <!-- Manómetro lateral -->
    <circle cx="80" cy="48" r="3.5" fill="${COL.rim}" stroke="${COL.rimHi}" stroke-width="0.4"/>
    <circle cx="80" cy="48" r="2.2" fill="${innerColor}" opacity="0.8"/>

    <!-- Boca frontal (apertura) -->
    <ellipse cx="14" cy="65" rx="6" ry="31" fill="url(#cavityGrad)" stroke="${COL.rim}" stroke-width="0.7"/>
    <!-- Reborde aro frontal -->
    <ellipse cx="14" cy="65" rx="6" ry="31" fill="none" stroke="${COL.rimHi}" stroke-width="1.2" opacity="0.9"/>

    <!-- Patas -->
    <rect x="22" y="96" width="3" height="20" fill="${COL.bodyBot}"/>
    <rect x="85" y="96" width="3" height="20" fill="${COL.bodyBot}"/>
  </g>

  ${carts}

  <!-- Indicador de estado: punto luminoso arriba -->
  <circle cx="55" cy="30" r="2.4"
          fill="${stateColor(state)}"
          ${hot ? 'filter="url(#g1)"' : ''}
          opacity="${dim ? 0.4 : 1}">
    ${hot ? '<animate attributeName="opacity" values="1;0.4;1" dur="1.5s" repeatCount="indefinite"/>' : ''}
  </circle>

  ${selected ? `<rect x="2" y="20" width="106" height="100" rx="6" fill="none" stroke="#2E80D8" stroke-width="1.4" stroke-dasharray="4 3" opacity="0.9"/>` : ''}
</svg>`;
}

/**
 * Cocedor vista interna pequeña — frontal mostrando las charolas apiladas.
 */
export function svgCocedorInterior({ state = 'ESPERA', carritos = 0 } = {}) {
  const hot = state === 'EN_PROCESO';
  const innerColor = hot ? 'rgba(245,166,35,0.30)' : (state === 'LISTO' ? 'rgba(0,200,150,0.25)' : 'rgba(46,128,216,0.18)');

  // Render: 4 carritos visibles (vista frontal del cocedor), cada uno con
  // ~6 líneas de charola horizontales.
  const carts = Math.min(carritos || 0, 4);
  const cartCells = Array.from({ length: 4 }, (_, i) => {
    const filled = i < carts;
    const x = 10 + i * 12;
    const fill = filled ? '#5A6B7A' : 'rgba(95,107,122,0.18)';
    const stroke = filled ? '#B6C7DA' : '#3B4856';
    return `
      <rect x="${x}" y="18" width="10" height="34" fill="${fill}" stroke="${stroke}" stroke-width="0.4"/>
      ${filled ? Array.from({ length: 6 }, (_, k) =>
        `<line x1="${x+1}" y1="${22 + k*5}" x2="${x+9}" y2="${22 + k*5}" stroke="${stroke}" stroke-width="0.3"/>`
      ).join('') : ''}
    `;
  }).join('');

  return `
<svg class="interna-svg" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <!-- Marco cilíndrico vista frontal -->
  <rect x="4" y="8" width="56" height="50" rx="6" fill="${innerColor}" stroke="#4F7CA8" stroke-width="1"/>
  <rect x="6" y="10" width="52" height="46" rx="5" fill="#06101A" stroke="#2B3D52" stroke-width="0.5"/>
  <!-- Riel inferior -->
  <line x1="6" y1="56" x2="58" y2="56" stroke="#2B3D52" stroke-width="0.6"/>
  ${cartCells}
  <!-- Tornillería decorativa -->
  <circle cx="8" cy="12" r="1" fill="#4F7CA8"/>
  <circle cx="56" cy="12" r="1" fill="#4F7CA8"/>
  <circle cx="8" cy="54" r="1" fill="#4F7CA8"/>
  <circle cx="56" cy="54" r="1" fill="#4F7CA8"/>
</svg>`;
}

function stateColor(state) {
  switch (state) {
    case 'EN_PROCESO':    return '#2E80D8';
    case 'LISTO':         return '#00C896';
    case 'ESPERA':        return '#F5A623';
    case 'MANTENIMIENTO': return '#8B9DAE';
    case 'DESACTIVADO':   return '#5A6B7A';
    default:              return '#5A6B7A';
  }
}

export function svgCarritoMini() {
  return `
<svg viewBox="0 0 60 60" width="60" height="60" xmlns="http://www.w3.org/2000/svg">
  <rect x="14" y="10" width="32" height="40" rx="2" fill="#7A8FA5" stroke="#B6C7DA" stroke-width="0.8"/>
  <line x1="16" y1="18" x2="44" y2="18" stroke="#B6C7DA" stroke-width="0.5"/>
  <line x1="16" y1="26" x2="44" y2="26" stroke="#B6C7DA" stroke-width="0.5"/>
  <line x1="16" y1="34" x2="44" y2="34" stroke="#B6C7DA" stroke-width="0.5"/>
  <line x1="16" y1="42" x2="44" y2="42" stroke="#B6C7DA" stroke-width="0.5"/>
  <circle cx="18" cy="54" r="2" fill="#0F1C2C"/>
  <circle cx="42" cy="54" r="2" fill="#0F1C2C"/>
</svg>`;
}
