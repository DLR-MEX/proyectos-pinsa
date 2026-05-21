// Panel "Entrada de carritos" — muestra el último carrito que ingresó
// (último movimiento con evento IN).

import { $ } from './dom.js';
import { svgCarritoMini } from './svgCocedor.js';

export function renderEntradaCarrito(ultimoMov) {
  const root = $('#entrada-carrito');
  if (!root) return;

  const mov = ultimoMov;
  if (!mov) {
    root.innerHTML = `
      <div class="entrada-carrito-stage">${svgCarritoMini()}</div>
      <div class="entrada-info-title" style="color:var(--c-text-dim)">Sin lectura reciente</div>
    `;
    return;
  }

  root.innerHTML = `
    <div class="entrada-carrito-stage">
      ${svgCarritoMini()}
      <span class="entrada-arrow">▶</span>
      <span class="entrada-check">✓</span>
    </div>
    <div class="entrada-info-title">Carrito detectado</div>
    <div class="entrada-info-meta">
      <span>ID:</span> <strong>${mov.carritoId}</strong><br>
      <span>Lote:</span> <strong>${mov.lote ?? '—'}</strong><br>
      <span>Talla:</span> <strong>${mov.talla ?? '—'}</strong><br>
      <span>Subtalla:</span> <strong>${mov.subtalla ?? '—'}</strong>
    </div>
  `;
}
