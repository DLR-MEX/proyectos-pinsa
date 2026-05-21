import { describe, it, expect, beforeEach } from 'vitest';
import * as history from '../src/historyStore.js';

describe('historyStore', () => {
  beforeEach(() => {
    history.clearAlarmHistory();
  });

  it('recordVariable rechaza variables fuera de ALL_VARIABLES', () => {
    history.recordVariable('bogus_var', 42, 1);
    history.recordVariable('cam1_temperature', -18, 1);
    const vars = history.listVariables();
    expect(vars).toContain('cam1_temperature');
    expect(vars).not.toContain('bogus_var');
  });

  it('recordVariable rechaza valores no finitos', () => {
    const tsBase = Date.now();
    history.recordVariable('cam2_humidity', NaN, tsBase);
    history.recordVariable('cam2_humidity', Infinity, tsBase + 10000);
    history.recordVariable('cam2_humidity', 88, tsBase + 20000);
    const samples = history.getVariableSamples('cam2_humidity');
    expect(samples.length).toBe(1);
    expect(samples[0].value).toBe(88);
  });

  it('buildVariablesCsv une timestamps y escapa headers', () => {
    const t0 = 1700000000000;
    history.recordVariable('cam1_temperature', -18, t0);
    history.recordVariable('cam1_temperature', -17, t0 + 6000);
    history.recordVariable('cam1_humidity',     88, t0 + 1000);

    const csv = history.buildVariablesCsv(['cam1_temperature', 'cam1_humidity'], null, null);
    const lines = csv.split('\n');

    expect(lines[0]).toBe('ts_ms,iso,cam1_temperature,cam1_humidity');
    // Filtra variables inválidas silenciosamente.
    const csvBad = history.buildVariablesCsv(['bogus', 'cam1_temperature'], null, null);
    expect(csvBad.split('\n')[0]).toBe('ts_ms,iso,cam1_temperature');
  });

  it('buildVariablesCsv respeta from/to', () => {
    const t0 = 1700000100000;
    history.recordVariable('cam3_temperature', 0, t0);
    history.recordVariable('cam3_temperature', 1, t0 + 6000);
    history.recordVariable('cam3_temperature', 2, t0 + 12000);

    const csv = history.buildVariablesCsv(['cam3_temperature'], t0 + 5000, t0 + 11000);
    const rows = csv.split('\n').slice(1).filter(Boolean);
    expect(rows.length).toBe(1);
    expect(rows[0].endsWith(',1')).toBe(true);
  });

  it('recordAlarm rechaza payloads malformados', () => {
    expect(history.recordAlarm(null)).toBe(false);
    expect(history.recordAlarm({})).toBe(false);
    expect(history.recordAlarm({ camId: 'cam999', type: 'X' })).toBe(false);
    expect(history.recordAlarm({ camId: 'cam1', type: '' })).toBe(false);
    expect(history.recordAlarm({ camId: 'cam1', type: 'a'.repeat(200) })).toBe(false);
    expect(history.recordAlarm({ camId: 'cam1', type: 'OK', sev: 'invalid' })).toBe(false);

    expect(history.getAlarmHistory().length).toBe(0);
  });

  it('recordAlarm acepta payload válido y trunca strings', () => {
    const ok = history.recordAlarm({
      camId: 'cam1',
      cam:   'Cámara 1',
      type:  'Alta temperatura',
      sev:   'high',
      firstSeen: 1700000000000,
    });
    expect(ok).toBe(true);
    const hist = history.getAlarmHistory();
    expect(hist.length).toBe(1);
    expect(hist[0].camId).toBe('cam1');
    expect(hist[0].type).toBe('Alta temperatura');
    expect(hist[0].sev).toBe('high');
  });

  it('buildAlarmsCsv escapa comas y comillas', () => {
    history.recordAlarm({
      camId: 'cam1',
      cam:   'Cámara, "comillas"',
      type:  'Falla, especial',
      sev:   'med',
      firstSeen: 1700000000000,
    });
    const csv = history.buildAlarmsCsv();
    expect(csv).toContain('"Cámara, ""comillas"""');
    expect(csv).toContain('"Falla, especial"');
  });
});
