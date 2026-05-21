// Escena Babylon 3D — interior de UN cocedor industrial de atún para lomos.
// Vista FPV: la cámara está DENTRO del cilindro, justo después de la apertura,
// mirando hacia el fondo. El usuario puede orbitar lateralmente y verticalmente.
//
// Elementos modelados (basados en un cocedor estático horizontal real):
//   · Coraza interior de acero inoxidable con remaches/anillos de refuerzo
//   · 2 rieles de acero por el piso (por donde corren los carritos)
//   · Tubería principal de vapor en el techo + inyectores radiales
//   · Lámparas IP (luminarias de proceso) emisivas con PointLight asociado
//   · Termómetro/sensor digital en una pared
//   · Tablero de manómetros al fondo
//   · Rejilla de drenaje al fondo del piso
//   · Marco de la puerta visible al frente (apertura)
//   · 28 carritos en grid 7×2×2 con bandejas de lomos de atún

const BODY_R   = 2.4;       // radio interior
const BODY_H   = 9.0;       // longitud
const COLS_X   = 7;         // 7 columnas profundas a lo largo de X
const SLOTS_Z  = 4;         // 4 carritos lado a lado (eje Z)
const SLOTS_Y  = 1;         // 1 solo nivel (apoyados en piso)
const SLOT_W   = 0.85;      // ancho de carrito (eje Z)
const SLOT_H   = 1.55;      // alto
const SLOT_D   = 0.70;      // profundidad (eje X)

let engine = null;
let scene  = null;
let camera = null;
let cocedorNode = null;
let cavityMat = null;
let cartsRoot = null;
let interiorLamps = [];
let _ready = false;
let _cartMeshes = [];   // tracking propio para dispose confiable

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
  console.log('[detalle3d] init, canvas=', canvas.clientWidth, 'x', canvas.clientHeight);

  engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, antialias: true });
  scene  = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.020, 0.040, 0.07, 1);
  scene.ambientColor = new BABYLON.Color3(0.18, 0.20, 0.24);

  // ─── Cámara FRONTAL EXTERIOR: afuera del cocedor mirando la apertura.
  // Alineada con el eje longitudinal (X) para ver el "agujero" circular de
  // frente, con el interior visible a través de él.
  // ─── Cámara LATERAL: el cilindro está cortado por la mitad (arc=0.5)
  // mostrando la sección. La cámara mira perpendicular al eje del cilindro
  // desde el lado del corte, viendo el interior como una "sección de corte".
  camera = new BABYLON.ArcRotateCamera(
    'camD',
    Math.PI / 2,            // cámara en +Z, mirando el corte (frente)
    Math.PI * 0.40,         // ligera elevación
    13,                     // radio
    new BABYLON.Vector3(0, 0.3, 0),
    scene,
  );
  camera.attachControl(canvas, true);
  camera.wheelPrecision = 50;
  camera.lowerRadiusLimit = 9;
  camera.upperRadiusLimit = 20;
  camera.lowerBetaLimit = Math.PI * 0.25;
  camera.upperBetaLimit = Math.PI * 0.55;
  camera.lowerAlphaLimit = Math.PI * 0.30;
  camera.upperAlphaLimit = Math.PI * 0.70;
  camera.panningSensibility = 0;
  camera.minZ = 0.02;

  // ─── Iluminación ─────────────────────────────────────────────────────
  const hemi = new BABYLON.HemisphericLight('h', new BABYLON.Vector3(0.2, 1, 0.2), scene);
  hemi.intensity = 0.45;
  hemi.diffuse  = new BABYLON.Color3(0.78, 0.85, 0.95);
  hemi.groundColor = new BABYLON.Color3(0.10, 0.12, 0.17);

  // ─── Construir geometría del cocedor ─────────────────────────────────
  buildCocedorMesh();
  cartsRoot = new BABYLON.TransformNode('cartsRoot', scene);
  cartsRoot.parent = cocedorNode;

  engine.runRenderLoop(() => scene.render());
  window.addEventListener('resize', () => engine.resize());
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => engine.resize()).observe(canvas.parentElement);
  }
  requestAnimationFrame(() => engine.resize());
  setTimeout(() => engine.resize(), 120);
  _ready = true;
}

function buildCocedorMesh() {
  cocedorNode = new BABYLON.TransformNode('coc', scene);

  // ─── Materiales ───────────────────────────────────────────────────────
  const inox = new BABYLON.StandardMaterial('inox', scene);
  inox.diffuseColor  = new BABYLON.Color3(0.62, 0.66, 0.70);   // acero inox sucio
  inox.specularColor = new BABYLON.Color3(0.55, 0.60, 0.65);
  inox.specularPower = 80;
  inox.backFaceCulling = false;
  inox.ambientColor = new BABYLON.Color3(0.30, 0.32, 0.36);

  const inoxDark = new BABYLON.StandardMaterial('inoxDark', scene);
  inoxDark.diffuseColor = new BABYLON.Color3(0.28, 0.32, 0.36);
  inoxDark.specularColor = new BABYLON.Color3(0.40, 0.44, 0.48);

  const rim = new BABYLON.StandardMaterial('rim', scene);
  rim.diffuseColor  = new BABYLON.Color3(0.70, 0.78, 0.85);
  rim.specularColor = new BABYLON.Color3(0.85, 0.90, 0.95);
  rim.specularPower = 110;

  const brass = new BABYLON.StandardMaterial('brass', scene);
  brass.diffuseColor  = new BABYLON.Color3(0.78, 0.55, 0.20);
  brass.specularColor = new BABYLON.Color3(0.90, 0.70, 0.30);
  brass.specularPower = 90;

  const lampMat = new BABYLON.StandardMaterial('lampMat', scene);
  lampMat.emissiveColor = new BABYLON.Color3(1.0, 0.92, 0.65);
  lampMat.diffuseColor  = new BABYLON.Color3(0.95, 0.92, 0.85);
  lampMat.specularColor = new BABYLON.Color3(0, 0, 0);

  cavityMat = new BABYLON.StandardMaterial('cav', scene);
  cavityMat.diffuseColor  = new BABYLON.Color3(0.04, 0.06, 0.10);
  cavityMat.emissiveColor = new BABYLON.Color3(0.04, 0.05, 0.06);

  // ─── Casco SECCIONADO con CSG: cilindro completo MENOS un cuboide al frente
  // (lado +Z) para crear un corte real que muestra el interior.
  const fullCyl = BABYLON.MeshBuilder.CreateCylinder('fullCyl', {
    diameter: BODY_R * 2,
    height: BODY_H,
    tessellation: 80,
    cap: BABYLON.Mesh.CAP_ALL,
  }, scene);
  fullCyl.rotation.z = Math.PI / 2;
  fullCyl.computeWorldMatrix(true);

  const cutter = BABYLON.MeshBuilder.CreateBox('cutter', {
    width:  BODY_H + 1.0,
    height: BODY_R * 3,
    depth:  BODY_R * 1.4,
  }, scene);
  cutter.position.z = BODY_R * 0.7;   // cubo desplazado a +Z (lado de cámara)
  cutter.computeWorldMatrix(true);

  const csgFull   = BABYLON.CSG.FromMesh(fullCyl);
  const csgCutter = BABYLON.CSG.FromMesh(cutter);
  const csgResult = csgFull.subtract(csgCutter);
  const body = csgResult.toMesh('body', inox, scene, true);
  body.parent = cocedorNode;
  fullCyl.dispose();
  cutter.dispose();

  // Anillos de refuerzo (mitad inferior visible)
  for (let k = 0; k < 4; k++) {
    const stiff = BABYLON.MeshBuilder.CreateTorus(`stiff_${k}`, {
      diameter: BODY_R * 1.99, thickness: 0.05, tessellation: 48,
    }, scene);
    stiff.rotation.z = Math.PI / 2;
    stiff.position.x = -BODY_H / 2 + 1.0 + k * ((BODY_H - 2.0) / 3);
    stiff.material = rim;
    stiff.parent = cocedorNode;
  }

  // ─── Piso plano (los rieles van encima) ──────────────────────────────
  const floor = BABYLON.MeshBuilder.CreateBox('floor', {
    width: BODY_H - 0.05,
    height: 0.04,
    depth: BODY_R * 1.55,
  }, scene);
  floor.position.y = -BODY_R * 0.78;
  floor.material = inoxDark;
  floor.parent = cocedorNode;

  // ─── Rieles del piso (2 paralelos a lo largo de X) ───────────────────
  for (const pz of [-BODY_R * 0.55, BODY_R * 0.55]) {
    const rail = BABYLON.MeshBuilder.CreateBox(`rail_${pz}`, {
      width: BODY_H * 0.94,
      height: 0.07,
      depth: 0.10,
    }, scene);
    rail.position.set(0, -BODY_R * 0.76, pz);
    rail.material = rim;
    rail.parent = cocedorNode;
  }

  // ─── Rejilla de drenaje al fondo del piso ────────────────────────────
  const drain = BABYLON.MeshBuilder.CreateBox('drain', {
    width: 0.75, height: 0.025, depth: 0.40,
  }, scene);
  drain.position.set(BODY_H / 2 - 0.7, -BODY_R * 0.78 + 0.04, 0);
  drain.material = inoxDark;
  drain.parent = cocedorNode;
  // Líneas de la rejilla
  for (let g = 0; g < 6; g++) {
    const slot = BABYLON.MeshBuilder.CreateBox(`drainslot_${g}`, {
      width: 0.62, height: 0.005, depth: 0.025,
    }, scene);
    slot.position.set(BODY_H / 2 - 0.7, -BODY_R * 0.78 + 0.055, -0.16 + g * 0.064);
    slot.material = inoxDark;
    slot.parent = cocedorNode;
  }

  // ─── Tubería principal de vapor en el techo ──────────────────────────
  const steamPipe = BABYLON.MeshBuilder.CreateCylinder('steamPipe', {
    diameter: 0.22, height: BODY_H - 0.4, tessellation: 24,
  }, scene);
  steamPipe.rotation.z = Math.PI / 2;
  steamPipe.position.set(0, BODY_R * 0.82, 0);
  steamPipe.material = brass;
  steamPipe.parent = cocedorNode;

  // Inyectores radiales que bajan de la tubería principal
  for (let i = 0; i < 12; i++) {
    const x = -BODY_H / 2 + 0.4 + i * ((BODY_H - 0.8) / 11);
    for (const pz of [-0.18, 0.18]) {
      const inj = BABYLON.MeshBuilder.CreateCylinder(`inj_${i}_${pz}`, {
        diameter: 0.05, height: 0.20, tessellation: 10,
      }, scene);
      inj.rotation.x = Math.PI / 2;
      inj.position.set(x, BODY_R * 0.72, pz);
      inj.material = brass;
      inj.parent = cocedorNode;
    }
  }

  // Tubo de alimentación lateral (T-fitting al fondo)
  const feed = BABYLON.MeshBuilder.CreateCylinder('feedPipe', {
    diameter: 0.22, height: BODY_R * 0.7, tessellation: 18,
  }, scene);
  feed.position.set(BODY_H / 2 - 0.3, BODY_R * 0.4, 0);
  feed.material = brass;
  feed.parent = cocedorNode;

  // ─── Lámparas IP en el techo + PointLights asociadas ─────────────────
  interiorLamps = [];
  for (let i = 0; i < 3; i++) {
    const x = -BODY_H / 2 + 1.5 + i * ((BODY_H - 3.0) / 2);
    const housing = BABYLON.MeshBuilder.CreateCylinder(`lamp_${i}`, {
      diameter: 0.42, height: 0.14, tessellation: 24,
    }, scene);
    housing.position.set(x, BODY_R * 0.88, 0);
    housing.material = lampMat;
    housing.parent = cocedorNode;

    const lens = BABYLON.MeshBuilder.CreateDisc(`lens_${i}`, {
      radius: 0.18, tessellation: 24,
    }, scene);
    lens.rotation.x = Math.PI / 2;       // mira hacia abajo
    lens.position.set(x, BODY_R * 0.81, 0);
    lens.material = lampMat;
    lens.parent = cocedorNode;

    const light = new BABYLON.PointLight(`pl_${i}`, new BABYLON.Vector3(x, BODY_R * 0.55, 0), scene);
    light.intensity = 0.65;
    light.diffuse = new BABYLON.Color3(1.0, 0.95, 0.78);
    light.range = 7;
    light.parent = cocedorNode;
    interiorLamps.push(light);
  }

  // ─── Termómetro digital en la pared lateral (visible cerca del fondo) ─
  const tempBox = BABYLON.MeshBuilder.CreateBox('tempBox', {
    width: 0.22, height: 0.18, depth: 0.09,
  }, scene);
  tempBox.position.set(BODY_H / 2 - 1.0, 0.5, BODY_R * 0.92);
  const tempMat = new BABYLON.StandardMaterial('tempMat', scene);
  tempMat.diffuseColor  = new BABYLON.Color3(0.18, 0.20, 0.24);
  tempMat.emissiveColor = new BABYLON.Color3(0.70, 0.15, 0.10);
  tempBox.material = tempMat;
  tempBox.parent = cocedorNode;

  // Sensor de temperatura (sonda)
  const probe = BABYLON.MeshBuilder.CreateCylinder('probe', {
    diameter: 0.05, height: 0.45, tessellation: 12,
  }, scene);
  probe.rotation.z = Math.PI / 2;
  probe.position.set(BODY_H / 2 - 1.6, 0.5, BODY_R * 0.82);
  probe.material = rim;
  probe.parent = cocedorNode;

  // ─── Tablero de manómetros al fondo (2 manómetros) ───────────────────
  for (let g = 0; g < 2; g++) {
    const gauge = BABYLON.MeshBuilder.CreateDisc(`gauge_${g}`, {
      radius: 0.22, tessellation: 24,
    }, scene);
    gauge.rotation.y = -Math.PI / 2;     // cara mirando -X (hacia la cámara)
    gauge.position.set(BODY_H / 2 - 0.06, BODY_R * 0.30, -0.5 + g * 1.0);
    const gm = new BABYLON.StandardMaterial(`gm_${g}`, scene);
    gm.diffuseColor  = new BABYLON.Color3(0.92, 0.92, 0.94);
    gm.emissiveColor = new BABYLON.Color3(0.20, 0.20, 0.22);
    gauge.material = gm;
    gauge.parent = cocedorNode;

    // Aguja del manómetro
    const needle = BABYLON.MeshBuilder.CreateBox(`needle_${g}`, {
      width: 0.015, height: 0.14, depth: 0.005,
    }, scene);
    needle.rotation.z = (g === 0 ? -0.6 : -1.1);
    needle.position.set(BODY_H / 2 - 0.05, BODY_R * 0.30, -0.5 + g * 1.0);
    const nm = new BABYLON.StandardMaterial(`nm_${g}`, scene);
    nm.diffuseColor = new BABYLON.Color3(0.85, 0.10, 0.10);
    nm.emissiveColor = new BABYLON.Color3(0.40, 0.05, 0.05);
    needle.material = nm;
    needle.parent = cocedorNode;
  }

  // ─── Patas exteriores ─────────────────────────────────────────────────
  for (let px of [-BODY_H * 0.40, -BODY_H * 0.13, BODY_H * 0.13, BODY_H * 0.40]) {
    const leg = BABYLON.MeshBuilder.CreateBox(`leg_${px}`, {
      width: 0.22, height: 1.4, depth: 0.55,
    }, scene);
    leg.position.set(px, -BODY_R - 0.7, 0);
    leg.material = inoxDark;
    leg.parent = cocedorNode;
  }
}

// ─── Construcción de los 28 carritos con bandejas y lomos de atún ────
function buildCarritos(carritos, statusColor, hot) {
  // Dispose con tracking propio (más confiable que getChildMeshes que a veces
  // no devuelve todos los descendientes en Babylon 9).
  for (const m of _cartMeshes) {
    try { m.dispose(false, true); } catch {}
  }
  _cartMeshes = [];

  // Layout 7 columnas (X) × 4 carritos lado a lado (Z) × 1 nivel
  const stepX = (BODY_H - 1.6) / COLS_X;
  const stepZ = (BODY_R * 1.6) / SLOTS_Z;
  const stepY = 1.55;
  const baseX = -BODY_H / 2 + 0.8 + stepX / 2;
  const baseZ = -BODY_R * 0.8 + stepZ / 2;
  // Y tal que las ruedas (centro -h*0.50 - 0.12 desde y_cart) queden sobre
  // el top de los rieles (y = -BODY_R*0.76 + 0.035 = -1.789).
  // → y_cart = -1.789 + 0.08 + h*0.50 + 0.12 = ~ -0.81
  const baseY = -0.81;

  const slotById = new Map(carritos.map(c => [c.slot, c]));

  // Materiales reutilizables
  const matCart = new BABYLON.StandardMaterial('mc', scene);
  matCart.diffuseColor  = new BABYLON.Color3(0.55, 0.60, 0.68);
  matCart.specularColor = new BABYLON.Color3(0.35, 0.40, 0.45);

  const matFrame = new BABYLON.StandardMaterial('mf', scene);
  matFrame.diffuseColor  = new BABYLON.Color3(0.72, 0.78, 0.84);
  matFrame.specularColor = new BABYLON.Color3(0.7, 0.75, 0.82);
  matFrame.specularPower = 100;

  const matTray = new BABYLON.StandardMaterial('mtr', scene);
  matTray.diffuseColor  = new BABYLON.Color3(0.80, 0.86, 0.92);
  matTray.specularColor = new BABYLON.Color3(0.6, 0.65, 0.72);

  // Color del atún depende del estado (crudo=oscuro, cocido=más claro)
  const matTuna = new BABYLON.StandardMaterial('mtu', scene);
  if (hot) {
    matTuna.diffuseColor = new BABYLON.Color3(0.60, 0.40, 0.30);     // cocido
    matTuna.emissiveColor = new BABYLON.Color3(0.15, 0.08, 0.04);
  } else {
    matTuna.diffuseColor = new BABYLON.Color3(0.45, 0.18, 0.18);     // crudo (rojizo)
    matTuna.emissiveColor = new BABYLON.Color3(0.08, 0.03, 0.03);
  }

  const matWheel = new BABYLON.StandardMaterial('mw', scene);
  matWheel.diffuseColor = new BABYLON.Color3(0.10, 0.13, 0.18);

  // Enumeración: por COLUMNA PROFUNDA (xi) y dentro de cada columna desde
  // el lado del corte (z más alto, cerca de la cámara) hacia atrás (z más bajo).
  // Así los primeros slots ocupados se ven inmediatamente.
  let n = 0;
  for (let xi = 0; xi < COLS_X; xi++) {
    for (let zi = SLOTS_Z - 1; zi >= 0; zi--) {     // cerca cámara → atrás
      n++;
      const cart = slotById.get(n);
      if (!cart) continue;
      const x = baseX + xi * stepX;
      const y = baseY;
      const z = baseZ + zi * stepZ;
      buildSingleCart(x, y, z, n, matCart, matFrame, matTray, matTuna, matWheel, true);
    }
  }
}

function buildSingleCart(x, y, z, n, matCart, matFrame, matTray, matTuna, matWheel, isBottom) {
  const w = SLOT_W, h = SLOT_H, d = SLOT_D;
  const track = (m) => { _cartMeshes.push(m); m.parent = cartsRoot; return m; };

  // 4 postes verticales
  for (const sx of [-w/2, w/2]) {
    for (const sz of [-d/2, d/2]) {
      const post = BABYLON.MeshBuilder.CreateBox(`post_${n}_${sx}_${sz}`, {
        width: 0.05, height: h, depth: 0.05,
      }, scene);
      post.position.set(x + sx, y, z + sz);
      post.material = matFrame;
      track(post);
    }
  }

  // 5 bandejas con lomos de atún
  const TRAYS = 5;
  for (let t = 0; t < TRAYS; t++) {
    const ty = y - h * 0.45 + t * (h * 0.85 / (TRAYS - 1));
    const tray = BABYLON.MeshBuilder.CreateBox(`tray_${n}_${t}`, {
      width: w * 0.92, height: 0.025, depth: d * 0.88,
    }, scene);
    tray.position.set(x, ty, z);
    tray.material = matTray;
    track(tray);

    for (let lk = 0; lk < 3; lk++) {
      const tuna = BABYLON.MeshBuilder.CreateCylinder(`tuna_${n}_${t}_${lk}`, {
        diameter: 0.16, height: 0.10, tessellation: 10,
      }, scene);
      tuna.rotation.x = Math.PI / 2;
      const offsetZ = -d * 0.28 + lk * (d * 0.28);
      tuna.position.set(x + (lk % 2 === 0 ? -w * 0.18 : w * 0.18), ty + 0.07, z + offsetZ);
      tuna.material = matTuna;
      track(tuna);
    }
  }

  // Chasis + ruedas (siempre, ya que SLOTS_Y=1)
  if (isBottom) {
    const chassis = BABYLON.MeshBuilder.CreateBox(`chassis_${n}`, {
      width: w * 0.96, height: 0.06, depth: d * 0.92,
    }, scene);
    chassis.position.set(x, y - h * 0.50 - 0.04, z);
    chassis.material = matFrame;
    track(chassis);

    for (const wx of [-w * 0.36, w * 0.36]) {
      for (const wz of [-d * 0.34, d * 0.34]) {
        const wheel = BABYLON.MeshBuilder.CreateCylinder(`w_${n}_${wx}_${wz}`, {
          diameter: 0.16, height: 0.07, tessellation: 12,
        }, scene);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(x + wx, y - h * 0.50 - 0.12, z + wz);
        wheel.material = matWheel;
        track(wheel);
      }
    }
  }

  // Etiqueta NFC amarilla
  const tag = BABYLON.MeshBuilder.CreateBox(`tag_${n}`, {
    width: 0.10, height: 0.07, depth: 0.01,
  }, scene);
  tag.position.set(x - w * 0.46, y + h * 0.35, z);
  const tagMat = new BABYLON.StandardMaterial(`tagMat_${n}`, scene);
  tagMat.diffuseColor  = new BABYLON.Color3(0.95, 0.78, 0.18);
  tagMat.emissiveColor = new BABYLON.Color3(0.25, 0.20, 0.05);
  tag.material = tagMat;
  track(tag);
}

export function updateDetalleScene(cocedor) {
  if (!_ready || !cocedor) return;
  const col = STATE_COLOR()[cocedor.status] ?? STATE_COLOR().DESACTIVADO;
  const hot = cocedor.status === 'EN_PROCESO';

  // Color de las luces interiores según estado
  for (const lamp of interiorLamps) {
    if (hot) {
      lamp.diffuse = new BABYLON.Color3(1.0, 0.92, 0.65);
      lamp.intensity = 0.85;
    } else if (cocedor.status === 'LISTO') {
      lamp.diffuse = new BABYLON.Color3(0.75, 1.0, 0.85);
      lamp.intensity = 0.65;
    } else if (cocedor.status === 'DESACTIVADO' || cocedor.status === 'MANTENIMIENTO') {
      lamp.diffuse = new BABYLON.Color3(0.30, 0.35, 0.40);
      lamp.intensity = 0.18;
    } else {
      lamp.diffuse = new BABYLON.Color3(1.0, 0.90, 0.62);
      lamp.intensity = 0.50;
    }
  }

  // Cavidad / sombra de fondo (ya no es tan crítica con luces interiores)
  cavityMat.emissiveColor = hot
    ? new BABYLON.Color3(0.10, 0.06, 0.02)
    : new BABYLON.Color3(0.04, 0.05, 0.07);

  buildCarritos(cocedor.carritos ?? [], col, hot);
}

export function disposeDetalleScene() {
  engine?.stopRenderLoop();
  scene?.dispose();
  engine?.dispose();
  engine = scene = null;
  _ready = false;
}
