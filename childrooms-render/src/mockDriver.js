// MOCK ONLY — simulador físico-realista con ciclos de compresor (histéresis
// termostática), eventos de puerta abierta, defrost programado y carga térmica
// pasiva desde el exterior. El estado on/off de los equipos por cámara se
// muta en CHAMBERS para que se refleje en el snapshot enviado al frontend.
//
// Se reemplaza por MqttClient cuando MOCK_DATA=false. Ver mqttClient.js y
// chambersMap.js para el contrato de variables.

import { CHAMBERS, DEVICE, SYS_VARIABLES } from './chambersMap.js';
import { MOCK_INTERVAL_MS, POWER_MAX } from './config.js';
import { getLogger } from './logger.js';

const logger = getLogger('mockDriver');

// Histéresis termostática: el compresor enciende cuando la temp sube por
// encima de setpoint+ON_OFFSET y se apaga cuando baja de setpoint-OFF_OFFSET.
// Esto produce un swing visible de ~6°C alrededor del setpoint, mucho más
// realista que el random-walk apretado al setpoint.
const TEMP_HYST_ON   = 3.0;   // grados por encima del setpoint → arranca
const TEMP_HYST_OFF  = 3.0;   // grados por debajo del setpoint → se apaga

const COOLING_RATE   = 0.45;  // °C/tick cuando el compresor está ON
const WARMING_RATE   = 0.18;  // °C/tick de carga térmica pasiva (puerta cerrada)
const DOOR_HEAT_RATE = 0.55;  // °C/tick adicional cuando la puerta está abierta
const DEFROST_RATE   = 0.85;  // °C/tick durante el ciclo de deshielo

function initChamberState(c) {
  // Empieza con compresor ON y temp un poco por encima del setpoint para que
  // el primer ciclo de enfriamiento sea visible al cargar el dashboard.
  const base = c.setpoint < 0 ? 5.5 : 3.0;
  return {
    temp:  c.setpoint + 2.0 + (Math.random() * 1.0),
    hum:   c.setpoint < 0 ? 87 : 91,
    power: base,                       // inicializado para evitar `?? target` ambiguo
    compressorOn: true,
    evaporatorOn: true,
    defrostTicks: 0,
    doorOpenTicks: 0,
    nextDoorOpenAt: 80 + Math.floor(Math.random() * 200),
    nextDefrostAt:  240 + Math.floor(Math.random() * 120),
    lastHighTempAlarmAt: -Infinity,    // cooldown anti-spam de la alarma de alta temp
  };
}

const sysState = {
  sys_temp_ext:   28.4,
  sys_hum_ext:    62.1,
  sys_setpoint:   -2.0,
  sys_p_succion:   2.1,
  sys_p_descarga: 15.7,
  sys_eficiencia: 78.3,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function jitter(base, delta) {
  return base + (Math.random() * 2 - 1) * delta;
}

let _running = null;   // singleton guard

export function startMockDriver(store) {
  if (_running) {
    logger.warn('startMockDriver called twice — returning existing instance');
    return _running;
  }
  logger.info('Mock driver started (MOCK_DATA=true)');

  const states = new Map();
  for (const c of CHAMBERS) {
    if (c.enabled) states.set(c.id, initChamberState(c));
  }

  let tick = 0;
  let nextSysEventAt = 80 + Math.floor(Math.random() * 80);

  const timer = setInterval(() => {
    tick++;
    const now = Date.now();

    // ── Cámaras ─────────────────────────────────────────────────────────
    for (const c of CHAMBERS) {
      if (!c.enabled) continue;
      const s = states.get(c.id);
      const prevCompOn = s.compressorOn;

      // 1) Puerta abierta — arranca de forma aleatoria, dura 4-12 ticks.
      if (s.doorOpenTicks === 0 && tick >= s.nextDoorOpenAt) {
        s.doorOpenTicks = 4 + Math.floor(Math.random() * 8);
        s.nextDoorOpenAt = tick + 120 + Math.floor(Math.random() * 240);
        store.pushEvent({ severity: 'warn', label: `Puerta abierta en ${c.label}` });
      }

      // 2) Defrost programado — apaga el compresor y sube la temp.
      if (s.defrostTicks === 0 && tick >= s.nextDefrostAt) {
        s.defrostTicks = 10;
        s.nextDefrostAt = tick + 360 + Math.floor(Math.random() * 240);
        store.pushEvent({ severity: 'info', label: `Deshielo iniciado en ${c.label}` });
      }

      // 3) Lógica del termostato (histéresis). El defrost fuerza compresor OFF.
      if (s.defrostTicks > 0) {
        s.compressorOn = false;
      } else if (s.temp >= c.setpoint + TEMP_HYST_ON) {
        s.compressorOn = true;
      } else if (s.temp <= c.setpoint - TEMP_HYST_OFF) {
        s.compressorOn = false;
      }

      // Evaporador sigue al compresor (los ventiladores apagan junto con él
      // en este modelo simplificado; en realidad pueden seguir un poquito más).
      s.evaporatorOn = s.compressorOn && s.defrostTicks === 0;

      // 4) Evolución de la temperatura.
      if (s.defrostTicks > 0) {
        s.temp += DEFROST_RATE + jitter(0, 0.08);
        s.defrostTicks--;
        if (s.defrostTicks === 0) {
          store.pushEvent({ severity: 'info', label: `Deshielo finalizado en ${c.label}` });
        }
      } else if (s.compressorOn) {
        s.temp -= COOLING_RATE + jitter(0, 0.08);
      } else {
        s.temp += WARMING_RATE + jitter(0, 0.08);
      }
      if (s.doorOpenTicks > 0) {
        s.temp += DOOR_HEAT_RATE;
        s.doorOpenTicks--;
        if (s.doorOpenTicks === 0) {
          store.pushEvent({ severity: 'info', label: `Puerta cerrada en ${c.label}` });
        }
      }
      // Banda física de seguridad — temperaturas extremas se truncan.
      s.temp = clamp(s.temp, c.setpoint - 8, c.setpoint + 10);

      // 5) Humedad — sube con puerta abierta o defrost, baja con compresor ON.
      let humTarget = 86;
      if (s.doorOpenTicks > 0) humTarget = 95;
      else if (s.defrostTicks > 0) humTarget = 93;
      else if (s.compressorOn) humTarget = 84;
      s.hum = clamp(s.hum + (humTarget - s.hum) * 0.20 + jitter(0, 0.5), 78, 97);

      // 6) Potencia consumida — sólo el compresor mueve power; en OFF queda el
      // residuo de ventiladores y resistencias.
      let powerTarget;
      if (s.compressorOn) {
        const delta = Math.abs(c.setpoint - s.temp);
        const base = c.setpoint < 0 ? 5.5 : 3.0;
        powerTarget = base + delta * 0.35;
      } else if (s.defrostTicks > 0) {
        powerTarget = 1.8;   // resistencias del defrost
      } else {
        powerTarget = 0.45;  // sólo ventiladores
      }
      // Asintótico hacia el target — evita escalones bruscos en la gráfica.
      s.power = clamp(s.power + (powerTarget - s.power) * 0.45 + jitter(0, 0.15), 0.15, POWER_MAX);

      // 7) Eventos automáticos cuando cambia el estado del compresor.
      if (prevCompOn !== s.compressorOn) {
        store.pushEvent({
          severity: 'info',
          label: `Compresor ${c.label} - ${s.compressorOn ? 'Arranque' : 'Paro'}`,
        });
      }
      // Alarma de alta temp con cooldown — evita spamming el buffer de eventos.
      if (s.temp > c.setpoint + TEMP_HYST_ON + 2 && (tick - s.lastHighTempAlarmAt) > 60) {
        store.pushEvent({ severity: 'warn', label: `Alta temperatura en ${c.label}` });
        s.lastHighTempAlarmAt = tick;
      }

      // 8) Estado runtime de equipos: lo publicamos en el store en vez de
      // mutar el módulo de dominio (CHAMBERS está congelado).
      store.setEquipoState(c.id, 'compresor',  s.compressorOn);
      store.setEquipoState(c.id, 'evaporador', s.evaporatorOn);

      store.update(DEVICE, `${c.mqttPrefix}_temperature`, +s.temp.toFixed(2),  now);
      store.update(DEVICE, `${c.mqttPrefix}_humidity`,    +s.hum.toFixed(1),   now);
      store.update(DEVICE, `${c.mqttPrefix}_power_kw`,    +s.power.toFixed(2), now);
    }

    // ── Sistema ─────────────────────────────────────────────────────────
    // Variación mayor en la temperatura exterior (ciclo del día simulado en
    // ~30 min) y presiones que reaccionan al consumo total.
    const dayPhase = Math.sin((tick / 720) * Math.PI * 2);   // periodo 30 min
    sysState.sys_temp_ext = clamp(28 + dayPhase * 5 + jitter(0, 0.3), 22, 38);
    sysState.sys_hum_ext  = clamp(62 - dayPhase * 8 + jitter(0, 0.5), 40, 80);

    // Presiones siguen al número de compresores activos (estado runtime del store).
    const compressorsOn = CHAMBERS.filter(c => {
      if (!c.enabled) return false;
      return store.getEquipoState(c.id)?.compresor;
    }).length;
    const targetSucc = 1.8 + compressorsOn * 0.18;
    const targetDesc = 13.0 + compressorsOn * 0.85;
    sysState.sys_p_succion  = clamp(sysState.sys_p_succion  + (targetSucc - sysState.sys_p_succion)  * 0.20 + jitter(0, 0.04), 1.4, 3.2);
    sysState.sys_p_descarga = clamp(sysState.sys_p_descarga + (targetDesc - sysState.sys_p_descarga) * 0.20 + jitter(0, 0.15), 11, 19);
    sysState.sys_eficiencia = clamp(86 - compressorsOn * 2.2 + jitter(0, 0.6), 65, 92);

    for (const v of SYS_VARIABLES) {
      store.update(DEVICE, v, +sysState[v].toFixed(2), now);
    }

    // ── Evento de sistema ocasional ─────────────────────────────────────
    if (tick >= nextSysEventAt) {
      const events = [
        { severity: 'info', label: 'Bomba de líquido - Cebado completo' },
        { severity: 'warn', label: 'Presión de descarga alta — verificar condensador' },
        { severity: 'info', label: 'Condensador 1 - Ventiladores a velocidad alta' },
        { severity: 'warn', label: 'Falla de comunicación intermitente Cámara 5' },
        { severity: 'info', label: 'Modo de operación: Automático' },
      ];
      store.pushEvent(events[Math.floor(Math.random() * events.length)]);
      nextSysEventAt = tick + 80 + Math.floor(Math.random() * 120);
    }
  }, MOCK_INTERVAL_MS);

  _running = {
    connected: true,
    close() {
      clearInterval(timer);
      _running = null;
      logger.info('Mock driver stopped');
    },
  };
  return _running;
}
