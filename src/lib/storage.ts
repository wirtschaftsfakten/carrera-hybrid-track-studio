import { DEFAULT_INVENTORY, PIECE_ORDER, type Inventory, type PieceId } from '../geometry/catalog';

export interface SavedTrack {
  id: string;
  name: string;
  sequence: PieceId[];
  rotation: number;
  createdAt: number;
}

export interface GeneratorSettings {
  useAll: boolean;
  minPieces: number;
  maxResults: number;
  roomEnabled: boolean;
  roomWidthCm: number;
  roomHeightCm: number;
}

export const DEFAULT_SETTINGS: GeneratorSettings = {
  useAll: true,
  minPieces: 8,
  maxResults: 12,
  roomEnabled: false,
  roomWidthCm: 300,
  roomHeightCm: 200,
};

const KEYS = {
  inventory: 'chts.inventory.v1',
  saved: 'chts.saved.v1',
  editor: 'chts.editor.v1',
  settings: 'chts.settings.v1',
};

function read<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or blocked (private mode) – the app keeps working in memory
  }
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
  return list.filter((t) => t && typeof t.id === 'string' && Array.isArray(t.sequence) && t.sequence.every(isPieceId));
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

export function loadSettings(): GeneratorSettings {
  return { ...DEFAULT_SETTINGS, ...(read<Partial<GeneratorSettings>>(KEYS.settings) ?? {}) };
}
export const saveSettings = (s: GeneratorSettings) => write(KEYS.settings, s);

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
