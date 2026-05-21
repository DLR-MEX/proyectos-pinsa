// Escena 3D Babylon.js — vista interior de UNA cámara seleccionada.
// Cuarto frigorífico: piso, 3 paredes + techo, 4 evaporadores cassette en el
// fondo, grid 4×3 de pilas de pallets (3 niveles = 36 cajas). El color de las
// cajas se pinta con un heatmap procedural con hot spot (Gaussiano) para que
// el cuarto NO se vea uniforme — la mayoría frío + un cluster naranja cerca
// de la puerta como en `public/images/camaras.jpeg`.

import { colorFloatsForMode } from './colorScales.js';

const B = () => window.BABYLON;

// ── Layout (metros) ──────────────────────────────────────────────────────
const ROOM_W = 9.0;     // ancho   (eje X)
const ROOM_D = 6.0;     // profund.(eje Z) — del fondo hacia la puerta
const ROOM_H = 3.6;     // alto    (eje Y)

// Grid de pallets: 4 columnas × 3 filas (Z) × 3 niveles (Y).
const GRID_COLS = 4;
const GRID_ROWS = 3;
const GRID_LVLS = 3;
const BOX_W = 0.95;
const BOX_H = 0.70;
const BOX_D = 0.95;
const BOX_GAP_X = 1.05;   // pitch X entre cajas
const BOX_GAP_Z = 1.20;   // pitch Z entre filas
const BOX_GAP_Y = 0.74;   // pitch Y entre niveles

// ── Estado del módulo ────────────────────────────────────────────────────
let _scene  = null;
let _engine = null;
let _camera = null;
let _canvasRef = null;
let _chambersConfig = null;
let _renderLoopRunning = false;

let _activeCamId = null;
let _heatmapMode = 'temp';
let _lastSnapshot = null;

let _boxes = [];          // array de meshes pintables del heatmap
let _evapHousings = [];   // housings de las 4 unidades cassette
let _evapFans = [];       // discos de los ventiladores (animados)
let _evapAccents = [];    // bordes/badge LED
let _heatSlices = [];     // slices semi-transparentes del heatmap volumétrico
let _logoTex = null;      // textura compartida "cartón + logo PINSA"
let _sensorTex = null;    // DynamicTexture del sensor T/H en pared izquierda

// ─────────────────────────────────────────────────────────────────────────
export function initScene3dInterior(canvas, chambersConfig) {
  if (_scene) return;       // singleton
  _canvasRef = canvas;
  _chambersConfig = chambersConfig;

  const { Engine, Scene, Color3, Color4, Vector3,
          ArcRotateCamera, HemisphericLight, PointLight } = B();

  _engine = new Engine(canvas, true, {
    stencil: true,
    antialias: true,
    adaptToDeviceRatio: true,
  });

  _scene = new Scene(_engine);
  _scene.clearColor = new Color4(0.78, 0.80, 0.83, 1);

  // Cámara: posicionada en la "puerta" (frente, z negativo) mirando al fondo.
  _camera = new ArcRotateCamera('camInterior',
    -Math.PI / 2,          // alpha — mirando hacia +Z (fondo)
    Math.PI / 2.6,         // beta — ligeramente alto
    11,                    // radio
    new Vector3(0, 1.4, 0.5),
    _scene);
  _camera.attachControl(canvas, true);
  _camera.lowerRadiusLimit = 5;
  _camera.upperRadiusLimit = 15;
  _camera.upperBetaLimit = Math.PI / 2.05;
  _camera.lowerBetaLimit = Math.PI / 4.5;
  _camera.wheelPrecision = 30;
  _camera.minZ = 0.1;
  _camera.panningSensibility = 2000;

  const hasFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (hasFinePointer) {
    canvas.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
  }

  // Iluminación: hemi neutra + 2 spots LED desde el techo.
  const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), _scene);
  hemi.intensity = 0.65;
  hemi.diffuse = new Color3(0.80, 0.82, 0.85);
  hemi.groundColor = new Color3(0.25, 0.27, 0.30);

  const led1 = new PointLight('led1', new Vector3(-2.0, ROOM_H - 0.3,  1.0), _scene);
  led1.intensity = 0.40;
  led1.diffuse = new Color3(0.88, 0.90, 0.95);
  const led2 = new PointLight('led2', new Vector3( 2.0, ROOM_H - 0.3, -1.5), _scene);
  led2.intensity = 0.40;
  led2.diffuse = new Color3(0.88, 0.90, 0.95);

  buildRoom(_scene);
  buildEvaporators(_scene);
  buildBoxGrid(_scene);
  buildHeatVolume(_scene);
  buildSensor(_scene);

  window.addEventListener('resize', () => _engine && _engine.resize());
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => _engine && _engine.resize());
    ro.observe(canvas);
  }

  // Animación de fans (rotación cuando ON).
  _scene.registerBeforeRender(() => {
    const dt = _engine.getDeltaTime() / 1000;
    for (const fan of _evapFans) {
      if (fan._on) fan.rotation.z += dt * 6.0;
    }
  });

  // No arrancamos el loop aquí — lo controla la vista (pause/resume).
}

// ── Cuarto: piso + 3 paredes + techo ─────────────────────────────────────
function buildRoom(scene) {
  const { MeshBuilder, StandardMaterial, Color3, DynamicTexture, Texture } = B();

  // ── Piso epoxy industrial gris azulado con tiles ──────────────────────
  const floor = MeshBuilder.CreateGround('floorInt', { width: ROOM_W, height: ROOM_D }, scene);
  floor.position.y = 0;
  const floorMat = new StandardMaterial('floorMatInt', scene);
  const tileTex = new DynamicTexture('tileTex', { width: 512, height: 512 }, scene, false);
  const tctx = tileTex.getContext();
  tctx.fillStyle = '#B8BFC8';
  tctx.fillRect(0, 0, 512, 512);
  tctx.strokeStyle = 'rgba(150,160,180,0.55)';
  tctx.lineWidth = 1.5;
  for (let i = 0; i <= 8; i++) {
    const p = (i / 8) * 512;
    tctx.beginPath(); tctx.moveTo(p, 0); tctx.lineTo(p, 512); tctx.stroke();
    tctx.beginPath(); tctx.moveTo(0, p); tctx.lineTo(512, p); tctx.stroke();
  }
  tctx.fillStyle = 'rgba(120,150,180,0.05)';
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) tctx.fillRect(c * 64 + 8, r * 64 + 8, 48, 48);
  tileTex.update();
  tileTex.wrapU = Texture.WRAP_ADDRESSMODE;
  tileTex.wrapV = Texture.WRAP_ADDRESSMODE;
  tileTex.uScale = 3; tileTex.vScale = 2;
  floorMat.diffuseTexture = tileTex;
  floorMat.specularColor = new Color3(0.30, 0.32, 0.36);
  floorMat.emissiveColor = new Color3(0.10, 0.11, 0.12);
  floor.material = floorMat;

  // Drain de desagüe (rejilla metálica) cerca del frente, off-center.
  const drainMat = new StandardMaterial('drainMat', scene);
  drainMat.diffuseColor  = new Color3(0.45, 0.48, 0.54);
  drainMat.specularColor = new Color3(0.65, 0.68, 0.74);
  drainMat.emissiveColor = new Color3(0.08, 0.09, 0.10);
  const drain = MeshBuilder.CreateBox('drain', { width: 0.55, height: 0.02, depth: 0.55 }, scene);
  drain.position.set(2.6, 0.011, -ROOM_D / 2 + 0.9);
  drain.material = drainMat;
  // Rejilla de barras del drain.
  for (let i = 0; i < 5; i++) {
    const bar = MeshBuilder.CreateBox(`drainBar_${i}`, { width: 0.45, height: 0.025, depth: 0.045 }, scene);
    bar.position.set(2.6, 0.018, -ROOM_D / 2 + 0.9 - 0.22 + i * 0.11);
    bar.material = drainMat;
  }

  // ── Material de paredes: blanco-azulado mate (paneles aislantes) ──────
  const wallMat = new StandardMaterial('wallMatInt', scene);
  wallMat.diffuseColor  = new Color3(0.88, 0.90, 0.94);
  wallMat.specularColor = new Color3(0.25, 0.28, 0.34);
  wallMat.emissiveColor = new Color3(0.10, 0.12, 0.14);
  wallMat.backFaceCulling = false;

  // Pared del fondo, izquierda, derecha.
  const back = MeshBuilder.CreatePlane('wallBack', { width: ROOM_W, height: ROOM_H }, scene);
  back.position.set(0, ROOM_H / 2, ROOM_D / 2);
  back.rotation.y = Math.PI;
  back.material = wallMat;

  const left = MeshBuilder.CreatePlane('wallLeft', { width: ROOM_D, height: ROOM_H }, scene);
  left.position.set(-ROOM_W / 2, ROOM_H / 2, 0);
  left.rotation.y = Math.PI / 2;
  left.material = wallMat;

  const right = MeshBuilder.CreatePlane('wallRight', { width: ROOM_D, height: ROOM_H }, scene);
  right.position.set(ROOM_W / 2, ROOM_H / 2, 0);
  right.rotation.y = -Math.PI / 2;
  right.material = wallMat;

  // Techo blanco con leve textura.
  const ceil = MeshBuilder.CreatePlane('ceil', { width: ROOM_W, height: ROOM_D }, scene);
  ceil.position.set(0, ROOM_H, 0);
  ceil.rotation.x = -Math.PI / 2;
  const ceilMat = new StandardMaterial('ceilMatInt', scene);
  ceilMat.diffuseColor  = new Color3(0.80, 0.82, 0.86);
  ceilMat.specularColor = new Color3(0.18, 0.20, 0.24);
  ceilMat.emissiveColor = new Color3(0.10, 0.12, 0.14);
  ceil.material = ceilMat;

  // ── Bandas verticales de unión de paneles modulares ────────────────────
  // Tono azul-acero más oscuro que la pared, sugiere las juntas verticales
  // entre paneles aislantes (PIR / poliuretano) de una cámara frigorífica.
  const seamMat = new StandardMaterial('seamMat', scene);
  seamMat.diffuseColor  = new Color3(0.60, 0.64, 0.70);
  seamMat.specularColor = new Color3(0.55, 0.58, 0.62);
  seamMat.emissiveColor = new Color3(0.08, 0.09, 0.10);

  const SEAM_W = 0.05, SEAM_THICK = 0.02;
  // Paredes laterales: 4 juntas distribuidas en Z.
  for (let i = 1; i <= 4; i++) {
    const z = -ROOM_D / 2 + (i / 5) * ROOM_D;
    // Izquierda
    const sL = MeshBuilder.CreateBox(`seamL_${i}`, { width: SEAM_THICK, height: ROOM_H - 0.04, depth: SEAM_W }, scene);
    sL.position.set(-ROOM_W / 2 + 0.012, ROOM_H / 2, z);
    sL.material = seamMat;
    // Derecha
    const sR = MeshBuilder.CreateBox(`seamR_${i}`, { width: SEAM_THICK, height: ROOM_H - 0.04, depth: SEAM_W }, scene);
    sR.position.set(ROOM_W / 2 - 0.012, ROOM_H / 2, z);
    sR.material = seamMat;
  }
  // Pared del fondo: 4 juntas en X.
  for (let i = 1; i <= 4; i++) {
    const x = -ROOM_W / 2 + (i / 5) * ROOM_W;
    const s = MeshBuilder.CreateBox(`seamB_${i}`, { width: SEAM_W, height: ROOM_H - 0.04, depth: SEAM_THICK }, scene);
    s.position.set(x, ROOM_H / 2, ROOM_D / 2 - 0.012);
    s.material = seamMat;
  }
  // Zócalo perimetral (rodapié inox) — barra horizontal baja.
  const skirtMat = new StandardMaterial('skirtMat', scene);
  skirtMat.diffuseColor  = new Color3(0.55, 0.62, 0.70);
  skirtMat.specularColor = new Color3(0.85, 0.88, 0.92);
  skirtMat.emissiveColor = new Color3(0.06, 0.08, 0.10);
  const SKIRT_H = 0.12;
  const skBack  = MeshBuilder.CreateBox('skBack',  { width: ROOM_W, height: SKIRT_H, depth: 0.04 }, scene);
  skBack.position.set(0, SKIRT_H / 2, ROOM_D / 2 - 0.02);
  skBack.material = skirtMat;
  const skLeft  = MeshBuilder.CreateBox('skLeft',  { width: 0.04, height: SKIRT_H, depth: ROOM_D }, scene);
  skLeft.position.set(-ROOM_W / 2 + 0.02, SKIRT_H / 2, 0);
  skLeft.material = skirtMat;
  const skRight = MeshBuilder.CreateBox('skRight', { width: 0.04, height: SKIRT_H, depth: ROOM_D }, scene);
  skRight.position.set(ROOM_W / 2 - 0.02, SKIRT_H / 2, 0);
  skRight.material = skirtMat;

  // ── Marco frontal (soleta industrial de cuarto frío) ───────────────────
  // Estructura metálica que rodea la "entrada" — sugiere puerta corrediza.
  const frameMat = new StandardMaterial('doorFrameMat', scene);
  frameMat.diffuseColor  = new Color3(0.45, 0.52, 0.62);
  frameMat.specularColor = new Color3(0.80, 0.85, 0.90);
  frameMat.emissiveColor = new Color3(0.06, 0.08, 0.10);

  const FZ = -ROOM_D / 2 + 0.06;
  const FY = ROOM_H;
  // Travesaño superior con bisel (un box grueso).
  const lintel = MeshBuilder.CreateBox('lintel', { width: ROOM_W, height: 0.45, depth: 0.30 }, scene);
  lintel.position.set(0, FY - 0.22, FZ);
  lintel.material = frameMat;

  // Etiqueta superior con número de cámara — DynamicTexture
  const labelTex = new DynamicTexture('lintelLabel', { width: 1024, height: 128 }, scene, false);
  const lctx = labelTex.getContext();
  lctx.fillStyle = '#EDF1F5';
  lctx.fillRect(0, 0, 1024, 128);
  lctx.fillStyle = '#00539F';
  lctx.fillRect(0, 0, 1024, 6);
  lctx.fillRect(0, 122, 1024, 6);
  lctx.fillStyle = '#0F172A';
  lctx.font = 'bold 64px "Rajdhani","Arial",sans-serif';
  lctx.textAlign = 'center';
  lctx.textBaseline = 'middle';
  lctx.fillText('CÁMARA FRIGORÍFICA · PINSA CONGELADOS', 512, 70);
  labelTex.update();

  const labelMat = new StandardMaterial('lintelLabelMat', scene);
  labelMat.diffuseTexture = labelTex;
  labelMat.emissiveColor  = new Color3(0.20, 0.24, 0.30);
  labelMat.specularColor  = new Color3(0.10, 0.12, 0.16);
  const labelPlane = MeshBuilder.CreatePlane('lintelLabelPlane',
    { width: ROOM_W - 0.6, height: 0.30 }, scene);
  labelPlane.position.set(0, FY - 0.22, FZ - 0.155);
  labelPlane.material = labelMat;
  labelPlane.rotation.y = Math.PI;

  // Jambas verticales (marcos laterales).
  const jambL = MeshBuilder.CreateBox('jambL', { width: 0.20, height: ROOM_H - 0.40, depth: 0.20 }, scene);
  jambL.position.set(-ROOM_W / 2 + 0.10, (ROOM_H - 0.40) / 2, FZ);
  jambL.material = frameMat;
  const jambR = MeshBuilder.CreateBox('jambR', { width: 0.20, height: ROOM_H - 0.40, depth: 0.20 }, scene);
  jambR.position.set(ROOM_W / 2 - 0.10, (ROOM_H - 0.40) / 2, FZ);
  jambR.material = frameMat;

  // Cortina de tiras de PVC translúcidas — 8 lonjas verticales en la entrada.
  const stripMat = new StandardMaterial('stripMat', scene);
  stripMat.diffuseColor  = new Color3(0.85, 0.95, 1.0);
  stripMat.emissiveColor = new Color3(0.12, 0.16, 0.22);
  stripMat.alpha = 0.22;
  stripMat.backFaceCulling = false;
  const STRIP_N = 8;
  const STRIP_W = (ROOM_W - 0.60) / STRIP_N;
  for (let i = 0; i < STRIP_N; i++) {
    const sx = -ROOM_W / 2 + 0.30 + STRIP_W / 2 + i * STRIP_W;
    const strip = MeshBuilder.CreatePlane(`strip_${i}`, { width: STRIP_W * 0.92, height: ROOM_H - 0.5 }, scene);
    strip.position.set(sx, (ROOM_H - 0.5) / 2 + 0.08, FZ + 0.02);
    strip.material = stripMat;
  }
}

// ── 4 evaporadores cassette en el techo, alineados con la pared del fondo
function buildEvaporators(scene) {
  const { MeshBuilder, StandardMaterial, Color3 } = B();

  const housingMat = new StandardMaterial('evapHousingMat', scene);
  housingMat.diffuseColor  = new Color3(0.78, 0.82, 0.88);
  housingMat.specularColor = new Color3(0.30, 0.35, 0.40);
  housingMat.emissiveColor = new Color3(0.10, 0.12, 0.16);

  const grilleMat = new StandardMaterial('evapGrilleMat', scene);
  grilleMat.diffuseColor  = new Color3(0.38, 0.42, 0.48);
  grilleMat.specularColor = new Color3(0.40, 0.44, 0.50);
  grilleMat.emissiveColor = new Color3(0.07, 0.08, 0.10);

  const fanMat = new StandardMaterial('evapFanMat', scene);
  fanMat.diffuseColor  = new Color3(0.36, 0.42, 0.50);
  fanMat.specularColor = new Color3(0.55, 0.60, 0.66);
  fanMat.emissiveColor = new Color3(0.08, 0.10, 0.12);

  const accentMat = new StandardMaterial('evapAccentMat', scene);
  accentMat.diffuseColor  = new Color3(0.0, 0.78, 0.59);  // verde PINSA
  accentMat.emissiveColor = new Color3(0.0, 0.40, 0.30);
  accentMat.specularColor = new Color3(0.6, 0.7, 0.65);
  _evapAccents.length = 0;

  const N_UNITS  = 4;
  const UNIT_W   = 1.5;
  const UNIT_D   = 0.95;
  const UNIT_H   = 0.42;
  const Y        = ROOM_H - UNIT_H / 2 - 0.05;
  const Z        = ROOM_D / 2 - UNIT_D / 2 - 0.15;  // pegados a la pared del fondo
  const totalW   = N_UNITS * UNIT_W + (N_UNITS - 1) * 0.35;
  const startX   = -totalW / 2 + UNIT_W / 2;

  _evapHousings.length = 0;
  _evapFans.length = 0;

  for (let i = 0; i < N_UNITS; i++) {
    const cx = startX + i * (UNIT_W + 0.35);

    // Housing principal (caja metálica).
    const housing = MeshBuilder.CreateBox(`evapHousing_${i}`, { width: UNIT_W, height: UNIT_H, depth: UNIT_D }, scene);
    housing.position.set(cx, Y, Z);
    housing.material = housingMat;
    _evapHousings.push(housing);

    // Frente (rejilla inclinada hacia el cuarto).
    const grille = MeshBuilder.CreateBox(`evapGrille_${i}`, { width: UNIT_W - 0.06, height: UNIT_H - 0.08, depth: 0.04 }, scene);
    grille.position.set(cx, Y - 0.02, Z - UNIT_D / 2 - 0.01);
    grille.rotation.x = 0.22;     // ligera inclinación hacia abajo
    grille.material = grilleMat;

    // Banda LED acento sobre la rejilla.
    const led = MeshBuilder.CreateBox(`evapLed_${i}`, { width: UNIT_W - 0.20, height: 0.04, depth: 0.025 }, scene);
    led.position.set(cx, Y + UNIT_H / 2 - 0.04, Z - UNIT_D / 2 - 0.02);
    led.material = accentMat;
    _evapAccents.push(led);

    // 2 ventiladores axiales debajo del housing (hub + 4 paletas planas).
    [-1, 1].forEach((sgn, k) => {
      const fanX = cx + sgn * (UNIT_W / 4);
      const fanY = Y - UNIT_H / 2 - 0.02;
      const fanZ = Z - 0.08;

      // Disco "shroud" alrededor del fan
      const shroud = MeshBuilder.CreateTorus(`evapShroud_${i}_${k}`, { diameter: 0.42, thickness: 0.04, tessellation: 20 }, scene);
      shroud.rotation.x = Math.PI / 2;
      shroud.position.set(fanX, fanY, fanZ);
      shroud.material = housingMat;

      // Hub + paletas
      const fan = MeshBuilder.CreateCylinder(`evapFan_${i}_${k}`, { diameter: 0.10, height: 0.04, tessellation: 12 }, scene);
      fan.rotation.x = Math.PI / 2;
      fan.position.set(fanX, fanY, fanZ);
      fan.material = fanMat;
      fan._on = false;

      // 4 paletas radiales
      for (let p = 0; p < 4; p++) {
        const blade = MeshBuilder.CreateBox(`evapBlade_${i}_${k}_${p}`,
          { width: 0.18, height: 0.025, depth: 0.04 }, scene);
        blade.parent = fan;
        const ang = (p / 4) * Math.PI * 2;
        blade.position.set(Math.cos(ang) * 0.10, Math.sin(ang) * 0.10, 0);
        blade.rotation.z = ang;
        blade.material = fanMat;
      }
      _evapFans.push(fan);
    });
  }
}

// ── Textura compartida "caja de cartón con logo PINSA" ───────────────────
function buildBoxLogoTexture(scene) {
  if (_logoTex) return _logoTex;
  const { DynamicTexture } = B();
  const tex = new DynamicTexture('pinsaCardboardTex', { width: 256, height: 256 }, scene, false);
  const ctx = tex.getContext();

  const drawPlaceholder = () => {
    // Base cartón.
    ctx.fillStyle = '#E8DCC2';
    ctx.fillRect(0, 0, 256, 256);
    // Tape marrón arriba y abajo.
    ctx.fillStyle = '#9A7B52';
    ctx.fillRect(0, 0, 256, 10);
    ctx.fillRect(0, 246, 256, 10);
    // Stripe PINSA azul al centro.
    ctx.fillStyle = '#00539F';
    ctx.fillRect(0, 96, 256, 64);
    // Texto PINSA fallback.
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 44px "Rajdhani","Arial Black",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PINSA', 128, 128);
    // Subtítulo.
    ctx.fillStyle = '#5A6B7A';
    ctx.font = 'bold 13px "Rajdhani","Arial",sans-serif';
    ctx.fillText('CONGELADOS', 128, 190);
    // Icono ❄ esquina.
    ctx.fillStyle = '#5BB8F5';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('❄', 30, 30);
    ctx.fillText('❄', 226, 30);
    tex.update();
  };

  drawPlaceholder();

  // Carga el logo real y lo dibuja encima de la stripe.
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    // Redibuja stripe limpia.
    ctx.fillStyle = '#00539F';
    ctx.fillRect(0, 96, 256, 64);
    // Encaja el logo manteniendo aspecto.
    const ratio = img.width / img.height;
    let h = 50, w = h * ratio;
    if (w > 200) { w = 200; h = w / ratio; }
    ctx.drawImage(img, (256 - w) / 2, 96 + (64 - h) / 2, w, h);
    tex.update();
  };
  img.onerror = () => { /* mantiene el placeholder */ };
  img.src = '/images/xlogopinsa.png';

  _logoTex = tex;
  return tex;
}

// ── Grid de pallets: 4×3 columnas/filas, 3 niveles, con logo PINSA ───────
function buildBoxGrid(scene) {
  const { MeshBuilder, StandardMaterial, Color3 } = B();

  const logoTex = buildBoxLogoTexture(scene);
  _boxes.length = 0;
  const totalX = (GRID_COLS - 1) * BOX_GAP_X;
  const totalZ = (GRID_ROWS - 1) * BOX_GAP_Z;
  const startX = -totalX / 2;
  const startZ = -totalZ / 2 + 0.2;

  for (let lvl = 0; lvl < GRID_LVLS; lvl++) {
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const box = MeshBuilder.CreateBox(`palletBox_${lvl}_${r}_${c}`,
          { width: BOX_W, height: BOX_H, depth: BOX_D }, scene);
        const x = startX + c * BOX_GAP_X;
        const z = startZ + r * BOX_GAP_Z;
        const y = BOX_H / 2 + 0.12 + lvl * BOX_GAP_Y;
        box.position.set(x, y, z);

        const mat = new StandardMaterial(`palletMat_${lvl}_${r}_${c}`, scene);
        // El diffuseColor MULTIPLICA la textura — el heatmap teñirá la caja
        // sin perder el logo. emissiveColor añade brillo coloreado en frío/calor.
        mat.diffuseTexture = logoTex;
        mat.diffuseColor   = new Color3(1.0, 1.0, 1.0);
        mat.emissiveColor  = new Color3(0.05, 0.08, 0.10);
        mat.specularColor  = new Color3(0.20, 0.22, 0.26);
        box.material = mat;
        _boxes.push(box);
      }
    }
  }

  // Pallet de madera debajo de cada pila (un solo tablón rectangular oscuro).
  const palletMat = new StandardMaterial('woodPalletMat', scene);
  palletMat.diffuseColor  = new Color3(0.42, 0.30, 0.20);
  palletMat.specularColor = new Color3(0.15, 0.12, 0.10);
  palletMat.emissiveColor = new Color3(0.06, 0.04, 0.03);

  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const x = startX + c * BOX_GAP_X;
      const z = startZ + r * BOX_GAP_Z;
      const pallet = MeshBuilder.CreateBox(`pallet_${r}_${c}`,
        { width: BOX_W * 1.05, height: 0.10, depth: BOX_D * 1.05 }, scene);
      pallet.position.set(x, 0.06, z);
      pallet.material = palletMat;
    }
  }
}

// ── Heatmap volumétrico estilo Malinalco ─────────────────────────────────
// Slices semi-transparentes perpendiculares al eje Z, interpolan entre
// 2 "sensores virtuales": frente (puerta = setpoint) y fondo (carga térmica).
function buildHeatVolume(scene) {
  const { MeshBuilder, StandardMaterial, Color3, Engine, Material } = B();
  _heatSlices.length = 0;

  const SLICES = 7;
  const Z_FRONT = -ROOM_D / 2 + 0.6;
  const Z_BACK  =  ROOM_D / 2 - 0.6;

  for (let i = 0; i < SLICES; i++) {
    const t = SLICES > 1 ? i / (SLICES - 1) : 0;
    const z = Z_FRONT + t * (Z_BACK - Z_FRONT);

    const slice = MeshBuilder.CreatePlane(`heatSlice_${i}`,
      { width: ROOM_W * 0.94, height: ROOM_H * 0.85 }, scene);
    slice.position.set(0, ROOM_H * 0.50, z);
    // Plano facing -Z (cara visible hacia la puerta).
    slice.rotation.y = Math.PI;
    slice.isPickable = false;

    const mat = new StandardMaterial(`heatSliceMat_${i}`, scene);
    mat.disableLighting = true;
    mat.emissiveColor = new Color3(0, 0.4, 0.6);
    mat.diffuseColor  = new Color3(0, 0, 0);
    mat.specularColor = new Color3(0, 0, 0);
    mat.alpha = 0.075;
    mat.backFaceCulling = false;
    if (Engine && 'ALPHA_COMBINE' in Engine) mat.alphaMode = Engine.ALPHA_COMBINE;
    if (Material && 'MATERIAL_ALPHABLEND' in Material) mat.transparencyMode = Material.MATERIAL_ALPHABLEND;
    slice.material = mat;
    slice._tParam = t;

    _heatSlices.push(slice);
  }
}

// ── Heatmap procedural con hot spot ──────────────────────────────────────
function hashCamId(camId, axis) {
  // Hash determinista a [-1, 1] aproximado, distinto por axis.
  let h = 2166136261 ^ (axis * 16777619);
  for (let i = 0; i < camId.length; i++) {
    h = (h ^ camId.charCodeAt(i)) * 16777619 >>> 0;
  }
  return ((h % 1000) / 1000) * 2 - 1;
}

function paintBoxesProcedural(tempValue, camId) {
  // Centro del hot spot dentro de la planta del cuarto (sin tocar los bordes).
  const hotX = hashCamId(camId, 0) * 1.8;
  const hotZ = hashCamId(camId, 1) * 1.2;
  const HOT_DELTA = 22;
  const SIGMA2    = 2.4;

  for (const box of _boxes) {
    const dx = box.position.x - hotX;
    const dz = box.position.z - hotZ;
    const d2 = dx * dx + dz * dz;
    const falloff = Math.exp(-d2 / SIGMA2);
    const t = tempValue + falloff * HOT_DELTA;
    const [r, g, b] = colorFloatsForMode('temp', t, camId);
    // Diffuse mezclado con un poco de blanco para que el logo de la textura
    // siga siendo legible aunque la caja esté tintada por el heatmap.
    const mix = 0.55;
    box.material.diffuseColor.set(
      r * mix + (1 - mix),
      g * mix + (1 - mix),
      b * mix + (1 - mix),
    );
    box.material.emissiveColor.set(r * 0.30, g * 0.30, b * 0.30);
  }
}

function paintBoxesUniform(value, mode, camId) {
  const [r, g, b] = colorFloatsForMode(mode, value, camId);
  const mix = 0.55;
  for (const box of _boxes) {
    box.material.diffuseColor.set(
      r * mix + (1 - mix),
      g * mix + (1 - mix),
      b * mix + (1 - mix),
    );
    box.material.emissiveColor.set(r * 0.30, g * 0.30, b * 0.30);
  }
}

// Pinta los slices del volumen heatmap interpolando entre frente (puerta) y
// fondo (atrás). El frente arranca cerca del valor real medido (zona fría),
// el fondo añade un delta para sugerir acumulación térmica.
function updateHeatVolume(tempValue, camId, mode) {
  if (!_heatSlices.length) return;
  const valFront = tempValue;
  const valBack  = mode === 'hum' ? tempValue : tempValue + 14;

  for (const slice of _heatSlices) {
    const t = slice._tParam;
    const v = valFront + (valBack - valFront) * t;
    const [r, g, b] = colorFloatsForMode(mode, v, camId);
    slice.material.emissiveColor.set(r * 1.4, g * 1.4, b * 1.4);
  }
}

function setHeatVolumeVisible(visible) {
  for (const s of _heatSlices) s.setEnabled(visible);
}

function paintEvaporatorState(on) {
  // Banda LED verde brillante si ON, gris apagado si OFF. Fans giran cuando ON.
  for (const led of _evapAccents) {
    if (on) {
      led.material.diffuseColor.set(0.0, 0.78, 0.59);
      led.material.emissiveColor.set(0.0, 0.45, 0.32);
    } else {
      led.material.diffuseColor.set(0.30, 0.34, 0.38);
      led.material.emissiveColor.set(0.05, 0.06, 0.07);
    }
  }
  for (const fan of _evapFans) {
    fan._on = on;
  }
}

// ── Sensor T/H en pared izquierda ────────────────────────────────────────
// Caja cuadrada tipo sonda industrial montada en la pared izquierda,
// centrada horizontal y verticalmente. Muestra temperatura y humedad
// con colores del heatmap (actualiza junto con cada snapshot).
function buildSensor(scene) {
  const { MeshBuilder, StandardMaterial, Color3, DynamicTexture } = B();

  // Pared izquierda en x = -ROOM_W/2. El sensor sobresale ~4cm hacia el interior.
  const DEPTH = 0.04;
  const SX = -ROOM_W / 2 + DEPTH / 2;
  const SY = ROOM_H / 2;   // centrado verticalmente
  const SZ = 0;             // centrado en profundidad (mitad del cuarto)

  // Carcasa plástica blanco-grisácea
  const housing = MeshBuilder.CreateBox('sensorHousing',
    { width: DEPTH, height: 0.22, depth: 0.18 }, scene);
  housing.position.set(SX, SY, SZ);
  housing.isPickable = false;

  const housingMat = new StandardMaterial('sensorHousingMat', scene);
  housingMat.diffuseColor  = new Color3(0.78, 0.82, 0.88);
  housingMat.specularColor = new Color3(0.50, 0.55, 0.65);
  housingMat.emissiveColor = new Color3(0.05, 0.06, 0.08);
  housing.material = housingMat;

  // Marco metálico alrededor de la pantalla (ligeramente más grande que el screen)
  const bezel = MeshBuilder.CreateBox('sensorBezel',
    { width: 0.008, height: 0.195, depth: 0.165 }, scene);
  bezel.position.set(SX + DEPTH / 2 + 0.004, SY, SZ);
  bezel.isPickable = false;
  const bezelMat = new StandardMaterial('sensorBezelMat', scene);
  bezelMat.diffuseColor  = new Color3(0.32, 0.38, 0.46);
  bezelMat.specularColor = new Color3(0.75, 0.80, 0.88);
  bezelMat.emissiveColor = new Color3(0.03, 0.04, 0.06);
  bezel.material = bezelMat;

  // Tornillos decorativos en esquinas del sensor
  const boltMat = new StandardMaterial('sensorBoltMat', scene);
  boltMat.diffuseColor  = new Color3(0.52, 0.58, 0.66);
  boltMat.specularColor = new Color3(0.90, 0.92, 0.96);
  [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([sy, sz], i) => {
    const bolt = MeshBuilder.CreateCylinder(`sensorBolt_${i}`,
      { diameter: 0.012, height: 0.01, tessellation: 10 }, scene);
    bolt.rotation.z = Math.PI / 2;
    bolt.position.set(SX + DEPTH / 2 + 0.005, SY + sy * 0.09, SZ + sz * 0.076);
    bolt.material = boltMat;
    bolt.isPickable = false;
  });

  // ── Pantalla — DynamicTexture 256×280 (ratio ≈ 0.91 = 0.16/0.175) ──────
  // La textura se pinta en paintSensor() con cada snapshot recibido.
  const TEX_W = 256, TEX_H = 280;
  const tex = new DynamicTexture('sensorTex', { width: TEX_W, height: TEX_H }, scene, false);
  tex.hasAlpha = false;

  const screenMat = new StandardMaterial('sensorScreenMat', scene);
  screenMat.diffuseTexture  = tex;
  screenMat.emissiveTexture = tex;
  screenMat.disableLighting = true;
  screenMat.backFaceCulling = false;

  // La pantalla ocupa la cara +X del sensor (facing hacia el interior del cuarto)
  // rotation.y = π/2 → normal = +X (usando el convenio left-hand de Babylon)
  const screen = MeshBuilder.CreatePlane('sensorScreen',
    { width: 0.155, height: 0.170 }, scene);
  screen.rotation.y = Math.PI / 2;
  screen.position.set(SX + DEPTH / 2 + 0.001, SY, SZ);
  screen.material = screenMat;
  screen.isPickable = false;

  _sensorTex = tex;
  paintSensor(NaN, NaN, null);
}

// Pinta (o repinta) la DynamicTexture del sensor con los valores actuales.
// Se llama desde applySnapshot3dInterior en cada snapshot recibido.
function paintSensor(tempValue, humValue, camId) {
  if (!_sensorTex) return;
  const ctx = _sensorTex.getContext();
  const W = 256, H = 280;
  ctx.clearRect(0, 0, W, H);

  // Fondo oscuro tipo panel de control
  ctx.fillStyle = '#080F18';
  ctx.fillRect(0, 0, W, H);

  // Borde interior
  ctx.strokeStyle = 'rgba(46,128,216,0.55)';
  ctx.lineWidth = 2;
  ctx.strokeRect(2, 2, W - 4, H - 4);

  // ── Header ─────────────────────────────────────────────────────────────
  ctx.fillStyle = '#00539F';
  ctx.fillRect(0, 0, W, 28);
  ctx.fillStyle = '#E3F1FF';
  ctx.font = 'bold 13px "Rajdhani","Arial",sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('T / H  SENSOR', W / 2, 14);

  // ── Temperatura ─────────────────────────────────────────────────────────
  const tColor = sensorHeatColor('temp', tempValue, camId);
  ctx.fillStyle = '#8B9DAE';
  ctx.font = 'bold 11px "Rajdhani","Arial",sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('TEMPERATURA', 12, 34);

  ctx.fillStyle = tColor;
  ctx.font = 'bold 48px "JetBrains Mono","Consolas",monospace';
  ctx.textBaseline = 'top';
  ctx.fillText(Number.isFinite(tempValue) ? `${tempValue.toFixed(1)}°C` : '--°C', 10, 48);

  // ── Separador ───────────────────────────────────────────────────────────
  ctx.strokeStyle = 'rgba(46,128,216,0.28)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(12, 118); ctx.lineTo(W - 12, 118); ctx.stroke();

  // ── Humedad ─────────────────────────────────────────────────────────────
  const hColor = sensorHeatColor('hum', humValue, camId);
  ctx.fillStyle = '#8B9DAE';
  ctx.font = 'bold 11px "Rajdhani","Arial",sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('HUMEDAD', 12, 126);

  ctx.fillStyle = hColor;
  ctx.font = 'bold 48px "JetBrains Mono","Consolas",monospace';
  ctx.textBaseline = 'top';
  ctx.fillText(Number.isFinite(humValue) ? `${humValue.toFixed(0)} %` : '-- %', 10, 140);

  // ── Indicador de estado ─────────────────────────────────────────────────
  const online = Number.isFinite(tempValue) || Number.isFinite(humValue);
  ctx.fillStyle = online ? '#00C896' : '#5A6B7A';
  ctx.beginPath();
  ctx.arc(W / 2, 232, 8, 0, Math.PI * 2);
  ctx.fill();
  // Halo
  ctx.strokeStyle = online ? 'rgba(0,200,150,0.35)' : 'rgba(90,107,122,0.35)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(W / 2, 232, 14, 0, Math.PI * 2);
  ctx.stroke();

  // Etiqueta de estado
  ctx.fillStyle = online ? '#00C896' : '#5A6B7A';
  ctx.font = 'bold 9px "Rajdhani","Arial",sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(online ? 'EN LÍNEA' : 'SIN DATOS', W / 2, 248);

  _sensorTex.update();
}

function sensorHeatColor(mode, value, camId) {
  if (!Number.isFinite(value)) return '#5A6B7A';
  const [r, g, b] = colorFloatsForMode(mode, value, camId ?? '');
  return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
}

// ── API pública ──────────────────────────────────────────────────────────

export function setActiveChamber(camId) {
  _activeCamId = camId;
  // Forzar repintado inmediato con el último snapshot disponible.
  if (_lastSnapshot) applySnapshot3dInterior(_lastSnapshot);
}

export function getActiveChamber() {
  return _activeCamId;
}

export function applySnapshot3dInterior(snapshot) {
  _lastSnapshot = snapshot;
  if (!_activeCamId || !snapshot) return;
  const cam = snapshot.chambers?.find(c => c.id === _activeCamId);
  if (!cam) return;

  if (_heatmapMode === 'hum') {
    const hv = cam.hum?.value;
    if (cam.enabled && Number.isFinite(hv)) {
      paintBoxesUniform(hv, 'hum', cam.id);
      updateHeatVolume(hv, cam.id, 'hum');
      setHeatVolumeVisible(true);
    } else {
      paintBoxesUniform(NaN, 'hum', cam.id);
      setHeatVolumeVisible(false);
    }
  } else {
    const tv = cam.temp?.value;
    if (cam.enabled && Number.isFinite(tv)) {
      paintBoxesProcedural(tv, cam.id);
      updateHeatVolume(tv, cam.id, 'temp');
      setHeatVolumeVisible(true);
    } else {
      paintBoxesUniform(NaN, 'temp', cam.id);
      setHeatVolumeVisible(false);
    }
  }

  paintEvaporatorState(!!cam.equipos?.evaporador);
  paintSensor(cam.temp?.value ?? NaN, cam.hum?.value ?? NaN, cam.id);
}

export function setHeatmapModeInterior(mode) {
  _heatmapMode = mode === 'hum' ? 'hum' : 'temp';
  if (_lastSnapshot) applySnapshot3dInterior(_lastSnapshot);
}

export function pauseRenderInterior() {
  if (!_engine || !_renderLoopRunning) return;
  _engine.stopRenderLoop();
  _renderLoopRunning = false;
}

export function resumeRenderInterior() {
  if (!_engine || _renderLoopRunning) return;
  _engine.runRenderLoop(() => _scene.render());
  _renderLoopRunning = true;
  // Mismo patrón que resumeRender3d: doble rAF para asegurar que el canvas
  // ya tiene su tamaño real tras la transición de visibilidad.
  const doResize = () => { if (_engine) _engine.resize(); };
  requestAnimationFrame(() => { requestAnimationFrame(doResize); });
}

export function isReadyInterior() {
  return !!_scene;
}
