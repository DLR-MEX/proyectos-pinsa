import { describe, it, expect } from 'vitest';
import {
  CHAMBERS, CHAMBER_VARIABLES, SYS_VARIABLES, ALL_VARIABLES, VALID_KEYS,
  resolveVariable,
} from '../src/chambersMap.js';

describe('chambersMap', () => {
  it('expone 6 cámaras (4 enabled, 2 disabled)', () => {
    expect(CHAMBERS).toHaveLength(6);
    expect(CHAMBERS.filter(c => c.enabled)).toHaveLength(4);
    expect(CHAMBERS.filter(c => !c.enabled)).toHaveLength(2);
  });

  it('ALL_VARIABLES = 6 cámaras × 3 vars + sys vars', () => {
    expect(ALL_VARIABLES).toHaveLength(CHAMBERS.length * CHAMBER_VARIABLES.length + SYS_VARIABLES.length);
    expect(VALID_KEYS.size).toBe(ALL_VARIABLES.length);
  });

  it('resolveVariable resuelve variables de cámara', () => {
    const r = resolveVariable('cam1_temperature');
    expect(r).not.toBeNull();
    expect(r.chamber.id).toBe('cam1');
    expect(r.variable).toBe('temperature');
  });

  it('resolveVariable resuelve variables sys_*', () => {
    const r = resolveVariable('sys_setpoint');
    expect(r).toEqual({ system: true, variable: 'sys_setpoint' });
  });

  it('resolveVariable retorna null para variables desconocidas', () => {
    expect(resolveVariable('bogus_variable')).toBeNull();
    expect(resolveVariable('cam99_temperature')).toBeNull();
  });
});
