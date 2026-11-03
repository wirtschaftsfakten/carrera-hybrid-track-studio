import { DEFAULT_INVENTORY, PIECE_ORDER, type Inventory, type PieceId } from '../geometry/catalog';
import type { GeneratorMode, TrackStyle } from '../generator/search';

export interface SavedTrack {
  id: string;
  name: string;
  sequence: PieceId[];
  rotation: number;
  createdAt: number;
  favorite?: boolean;
}

export interface GeneratorSettings {
  /** Default "auto": the inventory is only an upper limit, never a target. */
  mode: GeneratorMode;
  minPieces: number;
  maxPieces: number;
  style: TrackStyle;
  maxResults: number;
  lengthEnabled: boolean;
  minLengthCm: number;
  maxLengthCm: number;
  roomEnabled: boolean;
  roomWidthCm: number;
  roomHeightCm: number;
}

export const DEFAULT_SETTINGS: GeneratorSettings = {
  mode: 'auto',
  minPieces: 15,
  maxPieces: 30,
  style: 'varied',
  maxResults: 3,
  lengthEnabled: false,
  minLengthCm: 300,
  maxLengthCm: 1500,
  roomEnabled: false,
  roomWidthCm: 300,
  roomHeightCm: 200,
};

const MODES: GeneratorMode[] = ['auto', 'custom', 'max'];
const STYLES: TrackStyle[] = ['varied', 'fast', 'twisty', 'compact'];

export const KEYS = {
  inventory: 'chts.inventory.v1',
  account: 'chts.account.v1',
  entitlement: 'chts.entitlement.v1',
  usage: 'chts.usage.v1',
  saved: 'chts.saved.v1',
  editor: 'chts.editor.v1',
  settings: 'chts.settings.v2',
};

export function read<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

type Mirror = (key: string, raw: string | null) => void;
let mirror: Mirror | null = null;
/** Native app: every write is mirrored to durable storage (see lib/platform.ts). */
export const setStorageMirror = (m: Mirror | null) => {
  mirror = m;
};

export function write(key: string, value: unknown): void {
  const raw = value === undefined ? null : JSON.stringify(value);
  try {
    if (raw === null) localStorage.removeItem(key);
    else localStorage.setItem(key, raw);
  } catch {
    // storage full or blocked (private mode) – the app keeps working in memory
  }
  mirror?.(key, raw);
}

const isPieceId = (v: unknown): v is PieceId => PIECE_ORDER.includes(v as PieceId);

export function loadInventory(): Inventory {
  const stored = read<Partial<Inventory>>(KEYS.inventory) ?? {};
  const inv = { ...DEFAULT_INVENTORY };
  for (const id of PIECE_ORDER) {
    const n = stored[id];
    if (typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 99) inv[id] = n;
  }
  return inv;
}
export const saveInventory = (inv: Inventory) => write(KEYS.inventory, inv);

export function loadSaved(): SavedTrack[] {
  const list = read<SavedTrack[]>(KEYS.saved);
  if (!Array.isArray(list)) return [];
  return list
    .filter((t) => t && typeof t.id === 'string' && Array.isArray(t.sequence) && t.sequence.every(isPieceId))
    .map((t) => ({ ...t, name: String(t.name ?? ''), rotation: Number(t.rotation) || 0, favorite: t.favorite === true }));
}
export const saveSaved = (list: SavedTrack[]) => write(KEYS.saved, list);

export interface EditorState {
  name: string;
  sequence: PieceId[];
  rotation: number;
  savedId?: string;
}

export function loadEditor(): EditorState {
  const s = read<EditorState>(KEYS.editor);
  if (s && Array.isArray(s.sequence) && s.sequence.every(isPieceId)) {
    return { name: String(s.name ?? ''), sequence: s.sequence, rotation: Number(s.rotation) || 0, savedId: s.savedId };
  }
  return { name: '', sequence: [], rotation: 0 };
}
export const saveEditor = (s: EditorState) => write(KEYS.editor, s);

// v1 settings had "useAll: true" as default, which forced every piece into
// one track. They are deliberately not migrated (new key v2).
export function loadSettings(): GeneratorSettings {
  const stored = read<Partial<GeneratorSettings>>(KEYS.settings) ?? {};
  const s = { ...DEFAULT_SETTINGS };
  if (MODES.includes(stored.mode as GeneratorMode)) s.mode = stored.mode as GeneratorMode;
  if (STYLES.includes(stored.style as TrackStyle)) s.style = stored.style as TrackStyle;
  for (const k of ['minPieces', 'maxPieces', 'maxResults', 'minLengthCm', 'maxLengthCm', 'roomWidthCm', 'roomHeightCm'] as const) {
    const v = stored[k];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) s[k] = Math.round(v);
  }
  for (const k of ['lengthEnabled', 'roomEnabled'] as const) if (typeof stored[k] === 'boolean') s[k] = stored[k] as boolean;
  if (s.minPieces > s.maxPieces) s.minPieces = s.maxPieces;
  return s;
}
export const saveSettings = (s: GeneratorSettings) => write(KEYS.settings, s);

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
