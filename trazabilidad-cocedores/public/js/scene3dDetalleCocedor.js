// Escena Babylon 3D — interior de UN cocedor con modelo GLB exterior (cocedora-cortada.glb).
// El GLB es la carcasa real cortada; la escena interior añade piso, rieles, carritos e
// instrumentos procedurales posicionados dentro del volumen del GLB.

const BODY_R  = 2.40;   // radio de referencia del interior (≈ igual al del GLB escalado)
const BODY_H  = 9.00;   // largo de referencia del interior

// Grid de carritos — dimensiones calibradas para el interior del GLB
const COLS_X  = 7;
const SLOTS_Z = 4;
const SLOT_W  = 0.90;   // largo a lo largo del eje X (dirección de carga)
const SLOT_H  = 1.30;   // altura (Y) — carritos verticales dentro del cilindro horizontal
const SLOT_D  = 0.76;   // ancho en Z (perpendicular al eje del cocedor)

const GLB_PATH = '/images/';
const GLB_FILE = 'CAMARA+CARRITOS.glb';

let engine     = null;
let scene      = null;
let camera     = null;
let _ready     = false;
// 28 paneles permanentes — se crean una vez, solo se actualiza su color/visibilidad
let _slotMeshes = [];   // BABYLON.Mesh[28]
let _slotMats   = [];   // BABYLON.StandardMaterial[28]

let _glbExteriorRoot = null;

let _STATE_COLOR = null;
function STATE_COLOR() {
  if (_STATE_COLOR) return _STATE_COLOR;
  _STATE_COLOR = {
    EN_PROCESO:    new BABYLON.Color3(0.96, 0.65, 0.14),
    LISTO:         new BABYLON.Color3(0.00, 0.78, 0.59),
    ESPERA:        new BABYLON.Color3(0.95, 0.65, 0.14),
    MANTENIMIENTO: new BABYLON.Color3(0.55, 0.62, 0.68),
    DESACTIVADO:   new BABYLON.Color3(0.35, 0.42, 0.48),
  };
  return _STATE_COLOR;
}

export function initDetalleScene(canvas) {
  if (_ready) { engine?.resize(); return; }

  engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, antialias: true });
  scene  = new BABYLON.Scene(engine);
  scene.clearColor  = new BABYLON.Color4(0.78, 0.80, 0.83, 1);
  scene.ambientColor = new BABYLON.Color3(0.30, 0.32, 0.35);

  // ── Cámara ──────────────────────────────────────────────────────────────────
  // Vista lateral elevada desde el lado del corte — el GLB tiene la apertura
  // en el flanco superior, visible desde alpha ≈ −76°.
  camera = new BABYLON.ArcRotateCamera(
    'camD',
    -Math.PI * 0.42,  // alpha ≈ −76° — lado opuesto, interior del corte visible
    Math.PI * 0.26,   // beta  ≈ 47°  — elevado, mirando hacia el interior abierto
    16,
    new BABYLON.Vector3(0, 0.3, 0),
    scene,
  );
  camera.attachControl(canvas, true);
  camera.wheelPrecision   = 45;
  camera.lowerRadiusLimit = 10;
  camera.upperRadiusLimit = 28;
  camera.lowerBetaLimit   = Math.PI * 0.08;
  camera.upperBetaLimit   = Math.PI * 0.48;
  camera.panningSensibility = 0;
  camera.minZ = 0.05;

  // ── Iluminación ─────────────────────────────────────────────────────────────
  const hemi = new BABYLON.HemisphericLight('h', new BABYLON.Vector3(0.1, 1, 0.3), scene);
  hemi.intensity  = 0.40;
  hemi.diffuse    = new BABYLON.Color3(0.80, 0.82, 0.85);
  hemi.groundColor = new BABYLON.Color3(0.25, 0.27, 0.30);

  // Luz fill cenital — ilumina el interior desde arriba a través del corte superior
  const fillLight = new BABYLON.SpotLight(
    'cutFill',
    new BABYLON.Vector3(0, BODY_R * 2.5, 0),
    new BABYLON.Vector3(0, -1, 0),
    Math.PI * 0.55,
    1.2,
    scene,
  );
  fillLight.intensity = 0.35;
  fillLight.diffuse   = new BABYLON.Color3(0.85, 0.86, 0.88);

  // ── GLB exterior (async) ────────────────────────────────────────────────────
  _loadGLBExterior();

  engine.runRenderLoop(() => scene.render());
  window.addEventListener('resize', () => engine.resize());
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => engine.resize()).observe(canvas.parentElement);
  }
  requestAnimationFrame(() => engine.resize());
  setTimeout(() => engine.resize(), 120);
  _ready = true;
}

// ─── Carga el GLB real y lo escala para envolver el interior procedural ───────
async function _loadGLBExterior() {
  try {
    const container = await BABYLON.SceneLoader.LoadAssetContainerAsync(
      GLB_PATH, GLB_FILE, scene,
    );

    // Probe: medir dimensiones naturales del modelo a escala 1
    const probe = container.instantiateModelsToScene(n => `__dp_${n}`, false);
    const probeRoot = probe.rootNodes[0];
    probeRoot.computeWorldMatrix(true);

    let mnX = Infinity, mxX = -Infinity;
    let mnY = Infinity, mxY = -Infinity;
    let mnZ = Infinity, mxZ = -Infinity;

    for (const m of probeRoot.getChildMeshes(false)) {
      m.computeWorldMatrix(true);
      m.refreshBoundingInfo();
      const bi = m.getBoundingInfo();
      if (!bi) continue;
      const lo = bi.boundingBox.minimumWorld;
      const hi = bi.boundingBox.maximumWorld;
      mnX = Math.min(mnX, lo.x); mxX = Math.max(mxX, hi.x);
      mnY = Math.min(mnY, lo.y); mxY = Math.max(mxY, hi.y);
      mnZ = Math.min(mnZ, lo.z); mxZ = Math.max(mxZ, hi.z);
    }
    probeRoot.dispose(false, true);

    if (!isFinite(mnX)) { mnX = -1; mxX = 1; mnY = -1; mxY = 1; mnZ = -1; mxZ = 1; }

    const sX = mxX - mnX, sY = mxY - mnY, sZ = mxZ - mnZ;
    const PAD = 1.18;

    // El eje más largo del modelo determina la orientación
    const isXLongest = sX >= sY && sX >= sZ;
    const isZLongest = !isXLongest && (sZ >= sY);

    const result = container.instantiateModelsToScene(n => `glbExt_${n}`, false);
    _glbExteriorRoot = result.rootNodes[0];

    if (isXLongest) {
      // Eje X del GLB → eje X del mundo (largo del cocedor)
      _glbExteriorRoot.scaling = new BABYLON.Vector3(
        BODY_H              / (sX || 1),
        (BODY_R * 2 * PAD) / (sY || 1),
        (BODY_R * 2 * PAD) / (sZ || 1),
      );
    } else if (isZLongest) {
      // Rotar 90° para alinear eje Z del GLB → eje X del mundo
      _glbExteriorRoot.rotation.y = Math.PI / 2;
      _glbExteriorRoot.scaling = new BABYLON.Vector3(
        (BODY_R * 2 * PAD) / (sX || 1),
        (BODY_R * 2 * PAD) / (sY || 1),
        BODY_H              / (sZ || 1),
      );
    } else {
      // Eje Y el más largo: rotar −90° en Z
      _glbExteriorRoot.rotation.z = -Math.PI / 2;
      _glbExteriorRoot.scaling = new BABYLON.Vector3(
        (BODY_R * 2 * PAD) / (sX || 1),
        BODY_H              / (sY || 1),
        (BODY_R * 2 * PAD) / (sZ || 1),
      );
    }

    // Centrar verticalmente según offset natural del modelo
    _glbExteriorRoot.position.y = -(mnY + sY / 2) * _glbExteriorRoot.scaling.y;

    // El GLB es un corte real — opaco, backface visible para mostrar las caras del corte
    for (const m of _glbExteriorRoot.getChildMeshes(false)) {
      if (m.material) {
        m.material = m.material.clone(`${m.material.name}_c`);
        m.material.backFaceCulling = false;
      } else {
        const mat = new BABYLON.StandardMaterial(`glbMat_${m.name}`, scene);
        mat.diffuseColor  = new BABYLON.Color3(0.60, 0.62, 0.65);
        mat.specularColor = new BABYLON.Color3(0.65, 0.70, 0.78);
        mat.specularPower = 90;
        mat.backFaceCulling = false;
        m.material = mat;
      }
      m.alphaIndex = 0;
    }

    const sc = _glbExteriorRoot.scaling;
    console.log('[detalle3d] GLB OK — scale:', {
      x: sc.x.toFixed(2), y: sc.y.toFixed(2), z: sc.z.toFixed(2),
    }, 'isXLongest:', isXLongest);
  } catch (e) {
    console.warn('[detalle3d] GLB no disponible — solo interior procedural:', e.message);
    _glbExteriorRoot = null;
  }
}

// ─── 28 paneles de color — se crean UNA VEZ, solo cambia su color/visibilidad ──
// Cada panel es una caja delgada que ocupa el espacio de un slot dentro del GLB.
// No se destruyen ni recrean; el parpadeo es imposible.
function _initSlotPanels() {
  const FLOOR_Y = -BODY_R * 0.80;
  const stepX   = (BODY_H - 1.60) / COLS_X;
  const stepZ   = (BODY_R * 1.55) / SLOTS_Z;
  const baseX   = -BODY_H / 2 + 0.80 + stepX / 2;
  const baseZ   = -(BODY_R * 1.55) / 2 + stepZ / 2;
  // Y calibrado para quedar dentro del corte superior del GLB (medido en vivo)
  const panelY  = -0.40;

  _slotMeshes = [];
  _slotMats   = [];

  let n = 0;
  for (let xi = 0; xi < COLS_X; xi++) {
    for (let zi = SLOTS_Z - 1; zi >= 0; zi--) {
      n++;
      const x = baseX + xi * stepX;
      const z = baseZ + zi * stepZ;

      const mat = new BABYLON.StandardMaterial(`sp_${n}`, scene);
      mat.diffuseColor  = new BABYLON.Color3(0.40, 0.44, 0.50);
      mat.specularColor = new BABYLON.Color3(0.20, 0.22, 0.26);
      mat.alpha = 0.12;
      mat.backFaceCulling = false;

      const box = BABYLON.MeshBuilder.CreateBox(`slot_${n}`, {
        width: SLOT_W * 0.82,
        height: SLOT_H * 0.88,
        depth: SLOT_D * 0.82,
      }, scene);
      box.position.set(x, panelY, z);
      box.material  = mat;
      box.isVisible = false;   // empieza oculto; updateDetalleScene lo activa

      _slotMeshes.push(box);
      _slotMats.push(mat);
    }
  }
}

// ─── Actualización por snapshot SSE ──────────────────────────────────────────
export function updateDetalleScene(cocedor) {
  if (!_ready || !cocedor || !_slotMats.length) return;

  const col    = STATE_COLOR()[cocedor.status] ?? STATE_COLOR().DESACTIVADO;
  const slotSet = new Set((cocedor.carritos ?? []).map(c => c.slot));

  let n = 0;
  for (let xi = 0; xi < COLS_X; xi++) {
    for (let zi = SLOTS_Z - 1; zi >= 0; zi--) {
      n++;
      const idx  = (xi * SLOTS_Z) + (SLOTS_Z - 1 - zi);
      const mesh = _slotMeshes[idx];
      const mat  = _slotMats[idx];
      if (!mesh || !mat) continue;

      if (slotSet.has(n)) {
        mesh.isVisible    = true;
        mat.diffuseColor  = col;
        mat.emissiveColor = new BABYLON.Color3(col.r * 0.35, col.g * 0.35, col.b * 0.35);
        mat.alpha         = 0.74;
      } else {
        mesh.isVisible    = true;
        mat.diffuseColor  = new BABYLON.Color3(0.28, 0.32, 0.36);
        mat.emissiveColor = new BABYLON.Color3(0, 0, 0);
        mat.alpha         = 0.16;
      }
    }
  }
}

export function disposeDetalleScene() {
  engine?.stopRenderLoop();
  scene?.dispose();
  engine?.dispose();
  engine = scene = null;
  _ready = false;
  _glbExteriorRoot = null;
  _slotMeshes = [];
  _slotMats   = [];
}
