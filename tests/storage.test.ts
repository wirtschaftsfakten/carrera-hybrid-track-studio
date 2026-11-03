import { beforeEach, describe, expect, it } from 'vitest';
import type { PieceId } from '../src/geometry/catalog';

// minimal localStorage for the node test environment
class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? (this.m.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}
(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage();

const storage = await import('../src/lib/storage');

const oval: PieceId[] = ['startFinish', 'straight', 'curveR1Right', 'curveR1Right', 'curveR1Right', 'straight', 'straight', 'curveR1Right', 'curveR1Right', 'curveR1Right'];

describe('Speicherung und Wiederherstellung', () => {
  beforeEach(() => localStorage.clear());

  it('gespeicherte Strecken inkl. Favorit überleben einen Neustart', () => {
    storage.saveSaved([
      { id: 'a', name: 'Oval', sequence: oval, rotation: 3, createdAt: 1, favorite: true },
      { id: 'b', name: 'Zweite', sequence: oval.slice(0, 4), rotation: 0, createdAt: 2 },
    ]);
    const back = storage.loadSaved();
    expect(back).toHaveLength(2);
    expect(back[0]).toMatchObject({ id: 'a', name: 'Oval', sequence: oval, rotation: 3, favorite: true });
    expect(back[1].favorite).toBe(false);
  });

  it('beschädigte oder fremde Einträge werden verworfen', () => {
    localStorage.setItem(
      storage.KEYS.saved,
      JSON.stringify([{ id: 'x', sequence: ['startFinish', 'rocket'] }, { id: 'ok', name: 'gut', sequence: oval, rotation: 0, createdAt: 1 }, null]),
    );
    expect(storage.loadSaved().map((t) => t.id)).toEqual(['ok']);
    localStorage.setItem(storage.KEYS.saved, '{kaputt');
    expect(storage.loadSaved()).toEqual([]);
  });

  it('Editor-Zustand wird wiederhergestellt', () => {
    storage.saveEditor({ name: 'Bau', sequence: oval, rotation: 2, savedId: 'a' });
    expect(storage.loadEditor()).toEqual({ name: 'Bau', sequence: oval, rotation: 2, savedId: 'a' });
  });

  it('Inventar: ungültige Werte fallen auf das Grundset zurück', () => {
    storage.saveInventory({ ...storage.loadInventory(), straight: 60, curveR1Left: -3 });
    const inv = storage.loadInventory();
    expect(inv.straight).toBe(60);
    expect(inv.curveR1Left).toBe(2);
  });

  it('Einstellungen: Standard ist "Automatisch", alte useAll-Einstellung wird nicht übernommen', () => {
    localStorage.setItem('chts.settings.v1', JSON.stringify({ useAll: true, minPieces: 8 }));
    expect(storage.loadSettings().mode).toBe('auto');
    storage.saveSettings({ ...storage.DEFAULT_SETTINGS, mode: 'custom', minPieces: 15, maxPieces: 30 });
    expect(storage.loadSettings()).toMatchObject({ mode: 'custom', minPieces: 15, maxPieces: 30 });
    localStorage.setItem(storage.KEYS.settings, JSON.stringify({ mode: 'turbo', style: 'x', minPieces: 40, maxPieces: 20 }));
    expect(storage.loadSettings()).toMatchObject({ mode: 'auto', style: 'varied', minPieces: 20, maxPieces: 20 });
  });

  it('Spiegelung für die native App bekommt jeden Schreibvorgang', () => {
    const seen: [string, string | null][] = [];
    storage.setStorageMirror((k, v) => seen.push([k, v]));
    storage.saveSaved([]);
    storage.write(storage.KEYS.account, undefined);
    storage.setStorageMirror(null);
    expect(seen).toEqual([
      [storage.KEYS.saved, '[]'],
      [storage.KEYS.account, null],
    ]);
  });
});
