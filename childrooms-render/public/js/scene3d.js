// Escena 3D Babylon.js para las 6 cámaras de refrigeración.
// - 6 cubos representando cámaras + puerta delantera + marco azul superior.
// - Tuberías cilíndricas verdes/grises conectando TODOS los pares adyacentes.
// - Etiquetas con DynamicTexture sobre cada cámara: temp / hum / kW.
// - El color del cuerpo del cubo se interpola por temperatura (estilo Malinalco).

import { colorFloatsForMode } from './colorScales.js';

const B = () => window.BABYLON;

// ── Layout 3D ─────────────────────────────────────────────────────────────
const CHAMBER_W   = 2.6;
const CHAMBER_H   = 3.0;
const CHAMBER_D   = 2.2;
// Spacing entre centros: cada cámara mide 2.6 de ancho y el compresor sobresale
// ~0.5 del lateral derecho. Con 4.4 queda ~1.8 de gap libre entre paredes para
// que el compresor de la cámara N no se solape con la pared de la N+1.
const SPACING     = 4.4;
const PIPE_Y      = CHAMBER_H + 0.8;
const PIPE_RADIUS = 0.07;

let _scene  = null;
let _engine = null;
let _camera = null;

const _chamberMeshes = {};       // camId -> { box, bodyMat, frame, labelTex, ... }
const _pipeSegments  = [];       // [{ a, b, active, meshes }]
let _glowLayer = null;
let _alertRanges = null;
let _heatmapMode = 'temp';       // 'temp' | 'hum' — qué variable colorea el cuarto
let _lastSnapshot = null;        // último snapshot para repintar al cambiar modo
let _onChamberClick = null;      // callback opcional al hacer click en una cámara
let _chambersConfig = null;      // referencia al config para validar enabled
let _canvasRef = null;
let _renderLoopRunning = false;

export function initScene3d(canvas, chambersConfig, alertRanges /*, ranges */) {
  _alertRanges = alertRanges;
  _chambersConfig = chambersConfig;
  _canvasRef = canvas;

  const { Engine, Scene, Color3, Color4, Vector3,
          ArcRotateCamera, HemisphericLight, DirectionalLight,
          PointerEventTypes } = B();

  _engine = new Engine(canvas, true, {
    stencil: true,
    antialias: true,
    adaptToDeviceRatio: true,
  });

  _scene = new Scene(_engine);
  _scene.clearColor = new Color4(0.78, 0.80, 0.83, 1);

  _camera = new ArcRotateCamera('cam',
    Math.PI / 2,
    Math.PI / 2.85,
    24,
    new Vector3(0, 1.6, 0),
    _scene);
  _camera.attachControl(canvas, true);
  _camera.lowerRadiusLimit = 12;
  _camera.upperRadiusLimit = 40;
  _camera.upperBetaLimit = Math.PI / 2.02;
  _camera.lowerBetaLimit = Math.PI / 5;
  _camera.wheelPrecision = 30;
  _camera.minZ = 0.1;
  _camera.panningSensibility = 2000;

  _camera.useAutoRotationBehavior = true;
  const ar = _camera.autoRotationBehavior;
  ar.idleRotationSpeed = 0.12;
  ar.idleRotationWaitTime = 8000;
  ar.idleRotationSpinupTime = 2000;

  // Evita que el zoom con la rueda haga scroll de la página — solo en
  // dispositivos con pointer fino (mouse). En táctiles dejamos el swipe libre.
  const hasFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (hasFinePointer) {
    canvas.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
  }

  // Iluminación suave y difusa — sin "blanco quemado".
  const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), _scene);
  hemi.intensity = 0.55;
  hemi.diffuse = new Color3(0.80, 0.82, 0.85);
  hemi.groundColor = new Color3(0.25, 0.27, 0.30);
  hemi.specular = new Color3(0.20, 0.22, 0.26);

  const sun = new DirectionalLight('sun', new Vector3(-0.6, -1.6, -0.7), _scene);
  sun.intensity = 0.72;
  sun.diffuse = new Color3(0.85, 0.85, 0.88);
  sun.position = new Vector3(12, 18, 10);

  // Sin GlowLayer — añadía un pase de blur sobre los emisivos.
  _glowLayer = null;

  buildFloor(_scene);

  // Cámaras.
  const startX = -((chambersConfig.length - 1) / 2) * SPACING;
  chambersConfig.forEach((cam, i) => {
    const x = startX + i * SPACING;
    _chamberMeshes[cam.id] = buildChamber(_scene, cam, x);
  });

  // Tuberías — siempre se dibujan entre pares adyacentes; color depende de
  // si ambas cámaras están enabled.
  for (let i = 0; i < chambersConfig.length - 1; i++) {
    const a = chambersConfig[i];
    const b = chambersConfig[i + 1];
    const xa = startX + i * SPACING;
    const xb = startX + (i + 1) * SPACING;
    const active = a.enabled && b.enabled;
    const seg = buildPipeSegment(_scene, xa, xb, active);
    _pipeSegments.push({ a, b, active, ...seg });
  }

  // Todos los sub-meshes de cada cámara (puerta, paredes, techo, compresor,
  // evaporador) comparten el sufijo `_${camId}` en su nombre. Marcamos cada
  // uno con metadata.camId para que cualquier face dispare el click, no solo
  // el box principal.
  for (const cam of chambersConfig) {
    const suffix = `_${cam.id}`;
    for (const mesh of _scene.meshes) {
      if (mesh.name?.endsWith(suffix)) {
        if (!mesh.metadata) mesh.metadata = {};
        mesh.metadata.camId = cam.id;
      }
    }
  }

  // Picking — patrón canónico Babylon.js: POINTERTAP se dispara al hacer
  // click/tap sin requerir un movimiento exactamente cero (más tolerante que
  // POINTERPICK). Es el evento estándar para clicks sobre meshes en escena.
  _scene.onPointerObservable.add((info) => {
    if (info.type === PointerEventTypes.POINTERTAP) {
      const m = info.pickInfo?.pickedMesh;
      const camId = m?.metadata?.camId;
      if (!camId) return;
      const cam = _chambersConfig?.find(c => c.id === camId);
      if (cam?.enabled && _onChamberClick) _onChamberClick(camId);
    } else if (info.type === PointerEventTypes.POINTERMOVE) {
      const m = info.pickInfo?.pickedMesh;
      const camId = m?.metadata?.camId;
      if (camId) {
        const cam = _chambersConfig?.find(c => c.id === camId);
        canvas.style.cursor = cam?.enabled ? 'pointer' : 'default';
      } else {
        canvas.style.cursor = 'default';
      }
    }
  });

  startRenderLoop();

  // Resize sobre window + ResizeObserver sobre el canvas. El observer cubre
  // el caso típico de blur inicial: cuando el engine mide el canvas antes de
  // que el layout flex termine, el buffer queda en tamaño chico y el navegador
  // hace upscale CSS = imagen borrosa. Al observar el canvas, cualquier cambio
  // posterior dispara engine.resize() y reasigna el buffer al tamaño real.
  window.addEventListener('resize', () => _engine.resize());
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => _engine.resize());
    ro.observe(canvas);
  }
  // Fuerza un par de resizes tras el primer frame para capturar el layout final.
  requestAnimationFrame(() => {
    _engine.resize();
    requestAnimationFrame(() => _engine.resize());
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Geometría
// ──────────────────────────────────────────────────────────────────────────

function buildFloor(scene) {
  const { MeshBuilder, StandardMaterial, Color3 } = B();

  const ground = MeshBuilder.CreateGround('floor', { width: 36, height: 12 }, scene);
  const gm = new StandardMaterial('floorMat', scene);
  gm.diffuseColor  = new Color3(0.32, 0.34, 0.37);
  gm.specularColor = new Color3(0.18, 0.20, 0.24);
  gm.emissiveColor = new Color3(0.05, 0.06, 0.07);
  ground.material = gm;
  ground.position.y = 0;

  const platform = MeshBuilder.CreateBox('platform', { width: 30, depth: 5, height: 0.2 }, scene);
  platform.position.set(0, 0.1, 0);
  const pm = new StandardMaterial('platMat', scene);
  pm.diffuseColor  = new Color3(0.40, 0.42, 0.46);
  pm.specularColor = new Color3(0.30, 0.32, 0.36);
  platform.material = pm;
}

function buildChamber(scene, cam, x) {
  const { MeshBuilder, StandardMaterial, Color3, DynamicTexture } = B();
  const y = CHAMBER_H / 2 + 0.25;
  const enabled = cam.enabled;

  // Cuerpo principal (el "cuarto"). Color base navy; en applySnapshot3d se
  // sustituye por la interpolación de la temperatura.
  const box = MeshBuilder.CreateBox(`box_${cam.id}`,
    { width: CHAMBER_W, height: CHAMBER_H, depth: CHAMBER_D }, scene);
  box.position.set(x, y, 0);

  const bodyMat = new StandardMaterial(`mat_${cam.id}`, scene);
  bodyMat.diffuseColor  = new Color3(0.60, 0.62, 0.65);
  bodyMat.specularColor = new Color3(0.30, 0.32, 0.36);
  bodyMat.emissiveColor = new Color3(0.06, 0.07, 0.08);
  box.material = bodyMat;

  // Marco perimetral superior tipo "puerta de cámara".
  const frame = MeshBuilder.CreateBox(`frame_${cam.id}`,
    { width: CHAMBER_W + 0.08, height: 0.18, depth: CHAMBER_D + 0.08 }, scene);
  frame.position.set(x, CHAMBER_H + 0.25, 0);
  const frameMat = new StandardMaterial(`frameMat_${cam.id}`, scene);
  frameMat.diffuseColor  = new Color3(0.18, 0.50, 0.85);
  frameMat.emissiveColor = new Color3(0.04, 0.12, 0.24);
  frameMat.specularColor = new Color3(0.25, 0.35, 0.50);
  frame.material = frameMat;

  // Puerta frontal — panel negro fijo, no participa del heatmap.
  const door = MeshBuilder.CreatePlane(`door_${cam.id}`,
    { width: CHAMBER_W * 0.6, height: CHAMBER_H * 0.7 }, scene);
  door.position.set(x, y - 0.1, CHAMBER_D / 2 + 0.01);
  const doorMat = new StandardMaterial(`doorMat_${cam.id}`, scene);
  doorMat.diffuseColor  = new Color3(0.0, 0.0, 0.0);
  doorMat.emissiveColor = new Color3(0.0, 0.0, 0.0);
  doorMat.specularColor = new Color3(0.15, 0.18, 0.22);
  doorMat.backFaceCulling = false;
  door.material = doorMat;

  const handle = MeshBuilder.CreateCylinder(`handle_${cam.id}`,
    { diameter: 0.10, height: 0.45 }, scene);
  handle.rotation.z = Math.PI / 2;
  handle.position.set(x + CHAMBER_W * 0.2, y, CHAMBER_D / 2 + 0.03);
  const hm = new StandardMaterial(`handleMat_${cam.id}`, scene);
  hm.diffuseColor  = new Color3(0.65, 0.70, 0.78);
  hm.specularColor = new Color3(1.0, 1.0, 1.0);
  handle.material = hm;

  // ── Compresor semi-hermético reciprocante (pared lateral derecha) ──────
  // Layout estilo Bitzer/Copeland: skid base + 2 pies de soporte + cuerpo
  // cilíndrico horizontal (housing motor) con tapas de cabeza en los
  // extremos (de mayor diámetro), caja terminal eléctrica encima y tuberías
  // de succión (gruesa) + descarga (delgada) saliendo de los head covers.
  // Color verde/gris según on/off — las tuberías y la caja eléctrica usan
  // tonos metálicos fijos para realismo.
  const compOn = !!cam.equipos?.compresor;
  const compMat = makeEquipoMaterial(scene, `compMat_${cam.id}`, compOn);

  const compPipeMat = new StandardMaterial(`compPipeMat_${cam.id}`, scene);
  compPipeMat.diffuseColor  = new Color3(0.58, 0.62, 0.66);
  compPipeMat.specularColor = new Color3(0.80, 0.82, 0.86);
  compPipeMat.emissiveColor = new Color3(0.06, 0.07, 0.08);

  const compEboxMat = new StandardMaterial(`compEboxMat_${cam.id}`, scene);
  compEboxMat.diffuseColor  = new Color3(0.35, 0.38, 0.42);
  compEboxMat.specularColor = new Color3(0.40, 0.42, 0.46);

  const cx = x + CHAMBER_W / 2 + 0.55;     // centro del compresor en X
  const cy = y - CHAMBER_H * 0.32;          // altura sobre el piso
  const cz = 0.15;                          // ligeramente hacia el frente
  const bodyLen = 0.85;                     // largo del cuerpo del motor

  // Skid base.
  const skid = MeshBuilder.CreateBox(`compSkid_${cam.id}`,
    { width: bodyLen + 0.18, height: 0.07, depth: 0.55 }, scene);
  skid.position.set(cx, cy - 0.36, cz);
  skid.material = compMat;

  // 2 pies que sostienen el cuerpo sobre el skid.
  const footY = cy - 0.22;
  [-1, 1].forEach((sgn, i) => {
    const foot = MeshBuilder.CreateBox(`compFoot${i}_${cam.id}`,
      { width: 0.10, height: 0.20, depth: 0.34 }, scene);
    foot.position.set(cx + sgn * (bodyLen / 2 - 0.10), footY, cz);
    foot.material = compMat;
  });

  // Cuerpo (motor housing) cilíndrico horizontal.
  const motor = MeshBuilder.CreateCylinder(`compMotor_${cam.id}`,
    { diameter: 0.42, height: bodyLen, tessellation: 22 }, scene);
  motor.rotation.z = Math.PI / 2;
  motor.position.set(cx, cy, cz);
  motor.material = compMat;

  // Tapas de cabeza (head covers) — diámetro un poco mayor que el housing
  // para crear el escalón típico del cilindro reciprocante.
  [-1, 1].forEach((sgn, i) => {
    const head = MeshBuilder.CreateCylinder(`compHead${i}_${cam.id}`,
      { diameter: 0.50, height: 0.10, tessellation: 22 }, scene);
    head.rotation.z = Math.PI / 2;
    head.position.set(cx + sgn * (bodyLen / 2 + 0.05), cy, cz);
    head.material = compMat;

    // Tornillos de la tapa (4 pequeños cilindros formando un anillo).
    for (let k = 0; k < 6; k++) {
      const ang = (k / 6) * Math.PI * 2;
      const bolt = MeshBuilder.CreateCylinder(`compBolt${i}_${k}_${cam.id}`,
        { diameter: 0.04, height: 0.04, tessellation: 8 }, scene);
      bolt.rotation.z = Math.PI / 2;
      bolt.position.set(
        cx + sgn * (bodyLen / 2 + 0.105),
        cy + Math.sin(ang) * 0.18,
        cz + Math.cos(ang) * 0.18,
      );
      bolt.material = compPipeMat;
    }
  });

  // Caja terminal eléctrica sobre el motor.
  const ebox = MeshBuilder.CreateBox(`compEbox_${cam.id}`,
    { width: 0.34, height: 0.16, depth: 0.26 }, scene);
  ebox.position.set(cx, cy + 0.26, cz);
  ebox.material = compEboxMat;

  // Conduit metálico saliendo de la caja eléctrica.
  const conduit = MeshBuilder.CreateCylinder(`compConduit_${cam.id}`,
    { diameter: 0.05, height: 0.22, tessellation: 10 }, scene);
  conduit.position.set(cx + 0.12, cy + 0.42, cz);
  conduit.material = compPipeMat;

  // Tubería de SUCCIÓN — gruesa, sale por la tapa derecha hacia arriba.
  const suction = MeshBuilder.CreateCylinder(`compSuction_${cam.id}`,
    { diameter: 0.11, height: 0.55, tessellation: 14 }, scene);
  suction.position.set(cx + bodyLen / 2 + 0.05, cy + 0.32, cz - 0.18);
  suction.material = compPipeMat;
  const suctionElbow = MeshBuilder.CreateTorus(`compSuctionElbow_${cam.id}`,
    { diameter: 0.18, thickness: 0.11, tessellation: 14 }, scene);
  suctionElbow.rotation.x = Math.PI / 2;
  suctionElbow.rotation.y = Math.PI / 2;
  suctionElbow.position.set(cx + bodyLen / 2 + 0.05, cy + 0.59, cz - 0.09);
  suctionElbow.material = compPipeMat;

  // Tubería de DESCARGA — más delgada, sale por la tapa izquierda hacia
  // arriba; típicamente más caliente, conectada al condensador.
  const discharge = MeshBuilder.CreateCylinder(`compDischarge_${cam.id}`,
    { diameter: 0.075, height: 0.50, tessellation: 12 }, scene);
  discharge.position.set(cx - bodyLen / 2 - 0.05, cy + 0.30, cz + 0.18);
  discharge.material = compPipeMat;

  // ── Evaporador realista (toda la pared trasera) ────────────────────────
  // Diseño tipo "techo evaporador" industrial: carcasa ancha que abarca casi
  // toda la pared trasera, banda de aletas (serpentín) en la parte inferior
  // frontal, bandeja de drenaje, 2 ventiladores axiales con shroud y tuberías
  // de líquido (delgada, entrada) + gas (gruesa, salida) saliendo por arriba.
  const evapOn = !!cam.equipos?.evaporador;
  const evapMat    = makeEquipoMaterial(scene, `evapMat_${cam.id}`,    evapOn);
  const evapFinMat = makeEquipoMaterial(scene, `evapFinMat_${cam.id}`, evapOn, true);

  const evapW = CHAMBER_W * 0.92;
  const evapH = CHAMBER_H * 0.45;
  const evapD = 0.42;
  const evapY = y + CHAMBER_H * 0.18;     // pegado a la parte superior trasera
  const evapZ = -CHAMBER_D / 2 - evapD / 2 - 0.005;

  // Carcasa principal (chasis del evaporador) — domina la pared trasera.
  const evapHousing = MeshBuilder.CreateBox(`evapHousing_${cam.id}`,
    { width: evapW, height: evapH, depth: evapD }, scene);
  evapHousing.position.set(x, evapY, evapZ);
  evapHousing.material = evapMat;

  // Banda de aletas (serpentín visible) en la parte INFERIOR del housing —
  // ahí es donde sale el aire frío en un evaporador real.
  const finBandH = 0.22;
  const finBandY = evapY - evapH / 2 + finBandH / 2;
  const FIN_COUNT = 22;
  const finSpacing = (evapW - 0.10) / (FIN_COUNT - 1);
  for (let i = 0; i < FIN_COUNT; i++) {
    const fin = MeshBuilder.CreateBox(`evapFin${i}_${cam.id}`,
      { width: 0.018, height: finBandH * 0.95, depth: evapD * 1.06 }, scene);
    fin.position.set(x - evapW / 2 + 0.05 + i * finSpacing, finBandY, evapZ);
    fin.material = evapFinMat;
  }

  // Bandeja de drenaje (debajo de las aletas).
  const evapDrain = MeshBuilder.CreateBox(`evapDrain_${cam.id}`,
    { width: evapW * 0.98, height: 0.05, depth: evapD * 1.10 }, scene);
  evapDrain.position.set(x, finBandY - finBandH / 2 - 0.03, evapZ);
  evapDrain.material = evapMat;

  // 2 ventiladores axiales en la cara trasera (visible desde el exterior).
  const fanZ = evapZ - evapD / 2 - 0.025;
  const fanY = evapY + evapH * 0.10;
  [-1, 1].forEach((sgn, i) => {
    // Anillo/shroud del ventilador.
    const shroud = MeshBuilder.CreateCylinder(`evapFanShroud${i}_${cam.id}`,
      { diameter: 0.46, height: 0.05, tessellation: 26 }, scene);
    shroud.rotation.x = Math.PI / 2;
    shroud.position.set(x + sgn * (evapW * 0.26), fanY, fanZ);
    shroud.material = evapMat;

    // Hub central oscuro del ventilador.
    const hub = MeshBuilder.CreateCylinder(`evapFanHub${i}_${cam.id}`,
      { diameter: 0.11, height: 0.06, tessellation: 14 }, scene);
    hub.rotation.x = Math.PI / 2;
    hub.position.set(x + sgn * (evapW * 0.26), fanY, fanZ - 0.025);
    hub.material = compEboxMat;

    // 4 aspas planas formando una "X" — apariencia de ventilador axial.
    for (let k = 0; k < 4; k++) {
      const blade = MeshBuilder.CreateBox(`evapFanBlade${i}_${k}_${cam.id}`,
        { width: 0.18, height: 0.025, depth: 0.025 }, scene);
      const ang = (k / 4) * Math.PI * 2;
      blade.position.set(
        x + sgn * (evapW * 0.26) + Math.cos(ang) * 0.10,
        fanY + Math.sin(ang) * 0.10,
        fanZ - 0.012,
      );
      blade.rotation.z = ang;
      blade.material = compEboxMat;
    }
  });

  // Caja eléctrica de control en un costado del evaporador.
  const evapEbox = MeshBuilder.CreateBox(`evapEbox_${cam.id}`,
    { width: 0.20, height: 0.18, depth: 0.10 }, scene);
  evapEbox.position.set(x + evapW / 2 + 0.04, evapY - evapH * 0.20, evapZ - evapD / 2 - 0.05);
  evapEbox.material = compEboxMat;

  // Tubería de LÍQUIDO refrigerante (delgada) — entrada del evaporador.
  const evapLiquid = MeshBuilder.CreateCylinder(`evapLiquid_${cam.id}`,
    { diameter: 0.07, height: 0.55, tessellation: 12 }, scene);
  evapLiquid.position.set(x - evapW / 2 + 0.18, evapY + evapH / 2 + 0.27, evapZ);
  evapLiquid.material = compPipeMat;

  // Tubería de GAS (gruesa) — salida del evaporador hacia el compresor.
  const evapGas = MeshBuilder.CreateCylinder(`evapGas_${cam.id}`,
    { diameter: 0.13, height: 0.55, tessellation: 12 }, scene);
  evapGas.position.set(x - evapW / 2 + 0.42, evapY + evapH / 2 + 0.27, evapZ);
  evapGas.material = compPipeMat;

  // Etiqueta 3D — indicador superior con CÁMARA N + temp + hum + kW.
  const TEX_W = 540, TEX_H = 280;
  const tex = new DynamicTexture(`tex_${cam.id}`, { width: TEX_W, height: TEX_H }, scene, false);
  tex.hasAlpha = true;

  const labelMat = new StandardMaterial(`labelMat_${cam.id}`, scene);
  labelMat.diffuseTexture  = tex;
  labelMat.emissiveTexture = tex;
  labelMat.disableLighting = true;
  labelMat.backFaceCulling = false;
  labelMat.useAlphaFromDiffuseTexture = true;

  const labelPlane = MeshBuilder.CreatePlane(`label_${cam.id}`,
    { width: CHAMBER_W + 0.4, height: (CHAMBER_W + 0.4) * (TEX_H / TEX_W) }, scene);
  labelPlane.position.set(x, CHAMBER_H + 1.85, 0);
  labelPlane.billboardMode = B().Mesh.BILLBOARDMODE_ALL;
  labelPlane.material = labelMat;
  labelPlane.isPickable = false;

  return { box, bodyMat, frame, frameMat, door, handle,
           compMat, evapMat, evapFinMat,
           labelPlane, labelTex: tex, labelMat, cam };
}

// Material verde (#00C896) cuando el equipo está ON, gris steel cuando OFF.
// El parámetro `fin` reduce un poco el brillo para diferenciar las aletas del
// cuerpo del evaporador.
function makeEquipoMaterial(scene, name, on, fin = false) {
  const { StandardMaterial } = B();
  const mat = new StandardMaterial(name, scene);
  paintEquipoMaterial(mat, on, fin);
  return mat;
}

// Actualiza los colores de un material existente — usado en cada snapshot
// para reflejar cambios de estado on/off sin crear materiales nuevos. Si el
// material aún no tiene Color3 instanciados (primer paint), los crea.
function paintEquipoMaterial(mat, on, fin = false) {
  if (!mat) return;
  const { Color3 } = B();
  if (!mat.diffuseColor)  mat.diffuseColor  = new Color3();
  if (!mat.emissiveColor) mat.emissiveColor = new Color3();
  if (!mat.specularColor) mat.specularColor = new Color3();
  if (on) {
    mat.diffuseColor.set(0.0, fin ? 0.62 : 0.78, fin ? 0.47 : 0.59);
    mat.emissiveColor.set(0.0, fin ? 0.10 : 0.16, fin ? 0.08 : 0.12);
    mat.specularColor.set(0.30, 0.45, 0.40);
  } else {
    mat.diffuseColor.set(fin ? 0.30 : 0.38, fin ? 0.34 : 0.42, fin ? 0.38 : 0.46);
    mat.emissiveColor.set(0.04, 0.05, 0.06);
    mat.specularColor.set(0.18, 0.20, 0.22);
  }
}

function buildPipeSegment(scene, xa, xb, active) {
  const { MeshBuilder, StandardMaterial, Color3 } = B();

  const mat = new StandardMaterial(`pipeMat_${xa}_${xb}`, scene);
  if (active) {
    mat.diffuseColor  = new Color3(0.10, 0.55, 0.42);       // verde sage apagado
    mat.emissiveColor = new Color3(0.02, 0.20, 0.15);
    mat.specularColor = new Color3(0.30, 0.45, 0.40);
  } else {
    mat.diffuseColor  = new Color3(0.45, 0.48, 0.52);       // gris steel claro
    mat.emissiveColor = new Color3(0.06, 0.07, 0.08);
    mat.specularColor = new Color3(0.22, 0.22, 0.26);
  }

  const yTop = PIPE_Y;
  const tBoxTop = CHAMBER_H + 0.35;

  const horiz = MeshBuilder.CreateCylinder(`pipeH_${xa}`,
    { diameter: PIPE_RADIUS * 2, height: Math.abs(xb - xa), tessellation: 16 }, scene);
  horiz.rotation.z = Math.PI / 2;
  horiz.position.set((xa + xb) / 2, yTop, 0);
  horiz.material = mat;

  const downA = MeshBuilder.CreateCylinder(`pipeDa_${xa}`,
    { diameter: PIPE_RADIUS * 2, height: yTop - tBoxTop, tessellation: 16 }, scene);
  downA.position.set(xa, (yTop + tBoxTop) / 2, 0);
  downA.material = mat;

  const downB = MeshBuilder.CreateCylinder(`pipeDb_${xb}`,
    { diameter: PIPE_RADIUS * 2, height: yTop - tBoxTop, tessellation: 16 }, scene);
  downB.position.set(xb, (yTop + tBoxTop) / 2, 0);
  downB.material = mat;

  const joinA = MeshBuilder.CreateSphere(`pipeJa_${xa}`,
    { diameter: PIPE_RADIUS * 2.6, segments: 12 }, scene);
  joinA.position.set(xa, yTop, 0);
  joinA.material = mat;

  const joinB = MeshBuilder.CreateSphere(`pipeJb_${xb}`,
    { diameter: PIPE_RADIUS * 2.6, segments: 12 }, scene);
  joinB.position.set(xb, yTop, 0);
  joinB.material = mat;

  return { meshes: [horiz, downA, downB, joinA, joinB], mat };
}

// ──────────────────────────────────────────────────────────────────────────
// Pintado de etiquetas (DynamicTexture)
// ──────────────────────────────────────────────────────────────────────────

function paintLabel(entry, cam) {
  const tex = entry.labelTex;
  const ctx = tex.getContext();
  const W = tex.getSize().width, H = tex.getSize().height;
  ctx.clearRect(0, 0, W, H);

  // Estado de alerta según la variable principal del modo actual.
  let alertState = null;
  if (cam.enabled) {
    if (_heatmapMode === 'hum' && cam.hum && _alertRanges?.hum) {
      if (cam.hum.value > _alertRanges.hum.high) alertState = 'high';
      else if (cam.hum.value < _alertRanges.hum.low) alertState = 'low';
    } else if (cam.temp && _alertRanges?.temp) {
      if (cam.temp.value > _alertRanges.temp.high) alertState = 'high';
      else if (cam.temp.value < _alertRanges.temp.low) alertState = 'low';
    }
  }

  // Fondo.
  ctx.fillStyle = 'rgba(237,241,245,0.95)';
  roundRect(ctx, 8, 8, W - 16, H - 16, 16);
  ctx.fill();

  // Borde según estado.
  let borderColor = '#00539F';
  if (!cam.enabled)          borderColor = '#94A3B8';
  if (alertState === 'high') borderColor = '#FF4B4B';
  if (alertState === 'low')  borderColor = '#F5A623';
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 4;
  roundRect(ctx, 10, 10, W - 20, H - 20, 14);
  ctx.stroke();

  // Etiqueta CÁMARA N.
  ctx.fillStyle = cam.enabled ? '#475569' : '#94A3B8';
  ctx.font = 'bold 38px "Rajdhani","Segoe UI",sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(cam.label.toUpperCase(), W / 2, 22);

  // Variable principal grande según el modo activo (temp por defecto, hum si
  // el heatmap está en humedad). El otro indicador (temp o hum) pasa abajo.
  const mainColor = alertState === 'high' ? '#FF4B4B'
                  : alertState === 'low'  ? '#F5A623'
                  : (cam.enabled ? '#0F172A' : '#94A3B8');

  let mainText;
  if (_heatmapMode === 'hum') {
    mainText = cam.hum ? `${cam.hum.value.toFixed(0)}%` : '--%';
  } else {
    mainText = cam.temp ? `${cam.temp.value.toFixed(1)}°C` : '--°C';
  }
  ctx.fillStyle = mainColor;
  ctx.font = 'bold 84px "JetBrains Mono","Consolas",monospace';
  ctx.fillText(mainText, W / 2, 78);

  // Separador.
  ctx.strokeStyle = 'rgba(0,83,159,0.20)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(40, 200); ctx.lineTo(W - 40, 200); ctx.stroke();

  // Indicador izquierdo: la variable contraria a la del modo activo.
  ctx.font = 'bold 28px "JetBrains Mono","Consolas",monospace';
  ctx.textAlign = 'left';
  let leftText, leftColor;
  if (_heatmapMode === 'hum') {
    leftText = cam.temp ? `TMP ${cam.temp.value.toFixed(1)}°C` : 'TMP --';
    leftColor = cam.enabled ? '#0F172A' : '#94A3B8';
  } else {
    leftText = cam.hum ? `HUM ${cam.hum.value.toFixed(0)}%` : 'HUM --';
    leftColor = cam.enabled ? '#2E80D8' : '#94A3B8';
  }
  ctx.fillStyle = leftColor;
  ctx.fillText(leftText, 50, 220);

  // kW siempre en la derecha.
  ctx.textAlign = 'right';
  ctx.fillStyle = cam.enabled ? '#D97706' : '#94A3B8';
  const kwText = cam.power ? `${cam.power.value.toFixed(1)} kW` : '-- kW';
  ctx.fillText(kwText, W - 50, 220);

  tex.update();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

// ──────────────────────────────────────────────────────────────────────────
// API pública
// ──────────────────────────────────────────────────────────────────────────

export function applySnapshot3d(snapshot) {
  _lastSnapshot = snapshot;

  for (const cam of snapshot.chambers) {
    const entry = _chamberMeshes[cam.id];
    if (!entry) continue;

    // Color del cubo y del marco superior según el modo activo (temp | hum).
    // Cámaras disabled o sin dato → gris fijo. Mutamos los Color3 existentes
    // con .set(r,g,b) para evitar churn del GC en el hot path SSE.
    const reading = _heatmapMode === 'hum' ? cam.hum : cam.temp;
    if (cam.enabled && reading) {
      const [r, g, b] = colorFloatsForMode(_heatmapMode, reading.value, cam.id);
      entry.bodyMat.diffuseColor.set(r, g, b);
      entry.bodyMat.emissiveColor.set(r * 0.08, g * 0.08, b * 0.08);
      if (entry.frameMat) {
        entry.frameMat.diffuseColor.set(r * 0.65, g * 0.65, b * 0.65);
        entry.frameMat.emissiveColor.set(r * 0.18, g * 0.18, b * 0.18);
      }
    } else {
      entry.bodyMat.diffuseColor.set(0.55, 0.58, 0.62);
      entry.bodyMat.emissiveColor.set(0.06, 0.07, 0.08);
      if (entry.frameMat) {
        entry.frameMat.diffuseColor.set(0.40, 0.44, 0.50);
        entry.frameMat.emissiveColor.set(0.06, 0.08, 0.10);
      }
    }

    // Estado dinámico de equipos por cámara (compresor + evaporador). El
    // mockDriver muta cam.equipos en cada ciclo termostático, así que se
    // refleja en el render sin reconstruir geometría.
    const compOn = !!cam.equipos?.compresor;
    const evapOn = !!cam.equipos?.evaporador;
    paintEquipoMaterial(entry.compMat,    compOn);
    paintEquipoMaterial(entry.evapMat,    evapOn);
    paintEquipoMaterial(entry.evapFinMat, evapOn, true);

    paintLabel(entry, cam);
  }
}

export function setHeatmapMode(mode) {
  _heatmapMode = mode === 'hum' ? 'hum' : 'temp';
  try { localStorage.setItem('chr_heatmap_mode', _heatmapMode); } catch {}
  if (_lastSnapshot) applySnapshot3d(_lastSnapshot);
}

export function getHeatmapMode() {
  try {
    return localStorage.getItem('chr_heatmap_mode') === 'hum' ? 'hum' : 'temp';
  } catch { return 'temp'; }
}

export function isReady() {
  return !!_scene;
}

// Toggle auto-rotation desde la UI. Se guarda preferencia en localStorage.
export function setAutoRotation(enabled) {
  if (!_camera) return;
  if (enabled) {
    _camera.useAutoRotationBehavior = true;
    const ar = _camera.autoRotationBehavior;
    if (ar) {
      ar.idleRotationSpeed = 0.12;
      ar.idleRotationWaitTime = 4000;
      ar.idleRotationSpinupTime = 1500;
    }
  } else {
    _camera.useAutoRotationBehavior = false;
  }
  try { localStorage.setItem('chr_autorot', enabled ? '1' : '0'); } catch {}
}

export function getAutoRotation() {
  try { return localStorage.getItem('chr_autorot') !== '0'; } catch { return true; }
}

// ──────────────────────────────────────────────────────────────────────────
// Click hooks + control del render-loop
// ──────────────────────────────────────────────────────────────────────────

export function onChamberClick(fn) {
  _onChamberClick = typeof fn === 'function' ? fn : null;
}

function startRenderLoop() {
  if (!_engine || _renderLoopRunning) return;
  _engine.runRenderLoop(() => _scene.render());
  _renderLoopRunning = true;
}

export function pauseRender3d() {
  if (!_engine || !_renderLoopRunning) return;
  _engine.stopRenderLoop();
  _renderLoopRunning = false;
}

export function resumeRender3d() {
  startRenderLoop();
  if (!_engine) return;
  // resize() síncrono puede leer clientWidth=0 si el browser aún no terminó
  // el layout del canvas (el router acaba de añadir display:grid). Usamos
  // requestAnimationFrame para garantizar que el canvas tenga su tamaño real.
  const doResize = () => { if (_engine) _engine.resize(); };
  requestAnimationFrame(() => {
    requestAnimationFrame(doResize);
  });
}
