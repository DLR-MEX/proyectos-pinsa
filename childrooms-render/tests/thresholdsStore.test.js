import { describe, it, expect } from 'vitest';
import { validatePayload } from '../src/thresholdsStore.js';

describe('thresholdsStore.validatePayload', () => {
  const validBand = { min: -22, ideal: -10, max: 5 };
  const validHum  = { min: 80, ideal: 88, max: 95 };
  const validGroup = { temp: validBand, hum: validHum };

  it('rechaza null/undefined/primitivos', () => {
    expect(validatePayload(null)).toBe(false);
    expect(validatePayload(undefined)).toBe(false);
    expect(validatePayload(42)).toBe(false);
    expect(validatePayload('payload')).toBe(false);
  });

  it('rechaza payload sin general', () => {
    expect(validatePayload({})).toBe(false);
    expect(validatePayload({ chambers: {} })).toBe(false);
  });

  it('rechaza bands con valores no numéricos', () => {
    expect(validatePayload({ general: { temp: { min: 'a', ideal: 0, max: 5 }, hum: validHum } })).toBe(false);
    expect(validatePayload({ general: { temp: validBand, hum: { min: 80, ideal: NaN, max: 95 } } })).toBe(false);
  });

  it('acepta payload mínimo válido', () => {
    expect(validatePayload({ general: validGroup })).toBe(true);
  });

  it('acepta payload con chambers válidos', () => {
    expect(validatePayload({
      general:  validGroup,
      chambers: { cam1: validGroup, cam2: validGroup },
    })).toBe(true);
  });

  it('rechaza chambers con bands inválidos', () => {
    expect(validatePayload({
      general:  validGroup,
      chambers: { cam1: { temp: validBand } },   // falta hum
    })).toBe(false);
  });
});
