import { useEffect, useState, type ReactNode } from 'react';
import type { Inventory, PieceId } from './geometry/catalog';
import { EditorView } from './components/EditorView';
import { GeneratorView } from './components/GeneratorView';
import { InventoryView } from './components/InventoryView';
import { SavedView } from './components/SavedView';
import {
  loadEditor,
  loadInventory,
  loadSaved,
  loadSettings,
  newId,
  saveEditor,
  saveInventory,
  saveSaved,
  saveSettings,
  type EditorState,
  type GeneratorSettings,
  type SavedTrack,
} from './lib/storage';

type Tab = 'generator' | 'editor' | 'saved' | 'parts';

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'generator', label: 'Generator', icon: <path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2" /> },
  { id: 'editor', label: 'Editor', icon: <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" /> },
  { id: 'saved', label: 'Strecken', icon: <path d="M6 3h12v18l-6-4-6 4V3z" /> },
  { id: 'parts', label: 'Bestand', icon: <path d="M4 7l8-4 8 4-8 4-8-4zm0 5l8 4 8-4M4 17l8 4 8-4" /> },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('generator');
  const [inventory, setInventory] = useState<Inventory>(loadInventory);
  const [saved, setSaved] = useState<SavedTrack[]>(loadSaved);
  const [editor, setEditor] = useState<EditorState>(loadEditor);
  const [settings, setSettings] = useState<GeneratorSettings>(loadSettings);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => saveInventory(inventory), [inventory]);
  useEffect(() => saveSaved(saved), [saved]);
  useEffect(() => saveEditor(editor), [editor]);
  useEffect(() => saveSettings(settings), [settings]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const saveTrack = (sequence: PieceId[], rotation: number, name: string): string => {
    const track: SavedTrack = { id: newId(), name, sequence, rotation, createdAt: Date.now() };
    setSaved((list) => [track, ...list]);
    setToast('Strecke gespeichert');
    return track.id;
  };

  const saveFromEditor = (s: EditorState) => {
    const name = s.name.trim() || `Strecke ${new Date().toLocaleDateString('de-DE')}`;
    if (s.savedId && saved.some((t) => t.id === s.savedId)) {
      setSaved((list) => list.map((t) => (t.id === s.savedId ? { ...t, name, sequence: s.sequence, rotation: s.rotation } : t)));
      setEditor({ ...s, name });
      setToast('Änderungen gespeichert');
    } else {
      const id = saveTrack(s.sequence, s.rotation, name);
      setEditor({ ...s, name, savedId: id });
    }
  };

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-7xl flex-col">
      <header className="sticky top-0 z-20 border-b border-white/5 bg-ink-950/85 px-4 pb-3 pt-[max(env(safe-area-inset-top),12px)] backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Logo />
          <div className="min-w-0">
            <h1 className="truncate text-base font-extrabold leading-tight tracking-tight">
              Carrera <span className="text-carrera-red">HYBRID</span> Track Studio
            </h1>
            <p className="truncate text-xs text-zinc-500">Geprüfte Rundkurse aus deinem Teilebestand</p>
          </div>
          <nav className="ml-auto hidden gap-1 md:flex" aria-label="Hauptnavigation">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${tab === t.id ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white'}`}
              >
                {t.label}
                {t.id === 'saved' && saved.length > 0 && <span className="ml-1.5 text-xs text-zinc-500">{saved.length}</span>}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1 px-4 pb-28 pt-4 md:pb-8">
        {tab === 'generator' && (
          <GeneratorView
            inventory={inventory}
            settings={settings}
            onSettings={setSettings}
            onEditInventory={() => setTab('parts')}
            onSave={(seq, rot, name) => saveTrack(seq, rot, name)}
            onOpenInEditor={(sequence, rotation, name) => {
              setEditor({ name, sequence, rotation });
              setTab('editor');
            }}
          />
        )}
        {tab === 'editor' && <EditorView state={editor} inventory={inventory} onChange={setEditor} onSave={saveFromEditor} />}
        {tab === 'saved' && (
          <SavedView
            tracks={saved}
            inventory={inventory}
            onOpen={(t) => {
              setEditor({ name: t.name, sequence: t.sequence, rotation: t.rotation, savedId: t.id });
              setTab('editor');
            }}
            onDelete={(id) => {
              setSaved((list) => list.filter((t) => t.id !== id));
              if (editor.savedId === id) setEditor({ ...editor, savedId: undefined });
            }}
          />
        )}
        {tab === 'parts' && <InventoryView inventory={inventory} onChange={setInventory} />}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-white/5 bg-ink-950/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
        aria-label="Hauptnavigation"
      >
        <div className="mx-auto grid max-w-md grid-cols-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${tab === t.id ? 'text-white' : 'text-zinc-500'}`}
            >
              {tab === t.id && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-carrera-red" />}
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                {t.icon}
              </svg>
              {t.label}
              {t.id === 'saved' && saved.length > 0 && (
                <span className="absolute right-[calc(50%-22px)] top-1.5 min-w-4 rounded-full bg-carrera-red px-1 text-[10px] leading-4 text-white">{saved.length}</span>
              )}
            </button>
          ))}
        </div>
      </nav>

      {toast && (
        <div className="fixed inset-x-0 bottom-24 z-40 flex justify-center px-4 md:bottom-8" role="status">
          <div className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink-950 shadow-xl">{toast}</div>
        </div>
      )}
    </div>
  );
}

function Logo() {
  return (
    <svg width="36" height="36" viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
      <rect width="64" height="64" rx="14" fill="#12151c" />
      <path d="M32 10 L51 21 L51 43 L32 54 L13 43 L13 21 Z" fill="none" stroke="#262a33" strokeWidth="10" strokeLinejoin="round" />
      <path d="M32 10 L51 21 L51 43" fill="none" stroke="#e3061b" strokeWidth="3" strokeLinejoin="round" />
      <path d="M51 43 L32 54 L13 43 L13 21 L32 10" fill="none" stroke="#1e6bff" strokeWidth="3" strokeLinejoin="round" />
    </svg>
  );
}
