import { describe, it, expect, vi } from 'vitest';
import { SnapshotStore } from '../src/snapshotStore.js';
import { DEVICE } from '../src/chambersMap.js';

describe('SnapshotStore', () => {
  it('update + get devuelven {value, ts}', () => {
    const s = new SnapshotStore();
    s.update(DEVICE, 'cam1_temperature', -18.5, 1700000000000);
    expect(s.get(DEVICE, 'cam1_temperature')).toEqual({ value: -18.5, ts: 1700000000000 });
  });

  it('emite evento change en cada update', () => {
    const s = new SnapshotStore();
    const spy = vi.fn();
    s.on('change', spy);
    s.update(DEVICE, 'cam1_humidity', 88.3);
    expect(spy).toHaveBeenCalledOnce();
    const evt = spy.mock.calls[0][0];
    expect(evt.variable).toBe('cam1_humidity');
    expect(evt.value).toBe(88.3);
    expect(evt.prev).toBeNull();
  });

  it('getAll retorna shape esperada', () => {
    const s = new SnapshotStore();
    s.update(DEVICE, 'cam1_temperature', -18, 1);
    s.update(DEVICE, 'cam1_humidity',     90, 1);
    s.update(DEVICE, 'cam1_power_kw',    4.2, 1);
    s.update(DEVICE, 'sys_setpoint',      -2, 1);

    const snap = s.getAll();
    expect(snap).toHaveProperty('lastUpdate');
    expect(snap).toHaveProperty('chambers');
    expect(snap).toHaveProperty('equipos');
    expect(snap).toHaveProperty('system');
    expect(snap).toHaveProperty('events');
    expect(snap.chambers).toHaveLength(6);

    const cam1 = snap.chambers.find(c => c.id === 'cam1');
    expect(cam1.temp.value).toBe(-18);
    expect(cam1.hum.value).toBe(90);
    expect(cam1.power.value).toBe(4.2);

    const cam5 = snap.chambers.find(c => c.id === 'cam5');
    expect(cam5.enabled).toBe(false);
    expect(cam5.temp).toBeNull();

    expect(snap.system.sys_setpoint.value).toBe(-2);
  });

  it('pushEvent mantiene cola LIFO y limita a 30', () => {
    const s = new SnapshotStore();
    for (let i = 0; i < 35; i++) s.pushEvent({ severity: 'info', label: `e${i}` });
    const snap = s.getAll();
    expect(snap.events).toHaveLength(10); // getAll devuelve solo 10
    // El más reciente debe ser e34 (LIFO con unshift).
    expect(snap.events[0].label).toBe('e34');
  });
});
