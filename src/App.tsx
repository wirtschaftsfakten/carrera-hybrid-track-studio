import { useEffect, useState, type ReactNode } from 'react';
import { useEntitlement } from './billing/EntitlementProvider';
import { canSaveTrack, limitsFor } from './billing/entitlements';
import { FEATURE_ROWS, formatPrice, PRICES } from './billing/plans';
import { EditorView } from './components/EditorView';
import { GeneratorView } from './components/GeneratorView';
import { InventoryView } from './components/InventoryView';
import { ProView } from './components/ProView';
import { SavedView } from './components/SavedView';
import { Button, Sheet } from './components/ui';
import { BRAND } from './config/brand';
import type { Inventory, PieceId } from './geometry/catalog';
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

type Tab = 'generator' | 'editor' | 'saved' | 'parts' | 'pro';

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'generator', label: 'Generator', icon: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" /> },
  { id: 'editor', label: 'Editor', icon: <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" /> },
  { id: 'saved', label: 'Strecken', icon: <path d="M6 3h12v18l-6-4-6 4V3z" /> },
  { id: 'parts', label: 'Inventar', icon: <path d="M4 7l8-4 8 4-8 4-8-4zm0 5l8 4 8-4M4 17l8 4 8-4" /> },
  { id: 'pro', label: 'Pro', icon: <path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7L12 3z" /> },
];

export default function App() {
  const { tier } = useEntitlement();
  const [tab, setTab] = useState<Tab>('generator');
  const [inventory, setInventory] = useState<Inventory>(loadInventory);
  const [saved, setSaved] = useState<SavedTrack[]>(loadSaved);
  const [editor, setEditor] = useState<EditorState>(loadEditor);
  const [settings, setSettings] = useState<GeneratorSettings>(loadSettings);
  const [toast, setToast] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState<string | null>(null);

  useEffect(() => saveInventory(inventory), [inventory]);
  useEffect(() => saveSaved(saved), [saved]);
  useEffect(() => saveEditor(editor), [editor]);
  useEffect(() => saveSettings(settings), [settings]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => window.scrollTo({ top: 0 }), [tab]);

  const saveTrack = (sequence: PieceId[], rotation: number, name: string): string | null => {
    if (!canSaveTrack(tier, saved.length)) {
      setUpgrade(`Mit Free kannst du ${limitsFor('free').maxSavedTracks} Strecken speichern. Mit Pro unbegrenzt.`);
      return null;
    }
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
      if (id) setEditor({ ...s, name, savedId: id });
    }
  };

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-7xl flex-col pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      <header className="sticky top-0 z-20 border-b border-white/5 bg-ink-950/85 px-4 pb-3 pt-[max(env(safe-area-inset-top),12px)] backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Logo />
          <div className="min-w-0">
            <h1 className="truncate text-base font-extrabold leading-tight tracking-tight">
              {BRAND.name.replace(' Studio', '')} <span className="text-carrera-red">Studio</span>
              {tier === 'pro' && <span className="ml-2 rounded bg-carrera-red px-1.5 py-0.5 align-middle text-[10px] font-extrabold uppercase text-white">Pro</span>}
            </h1>
            <p className="truncate text-xs text-zinc-500">{BRAND.tagline}</p>
          </div>
          <nav className="ml-auto hidden gap-1 md:flex" aria-label="Hauptnavigation">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? 'page' : undefined}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${tab === t.id ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white'} ${
                  t.id === 'pro' ? 'text-carrera-red' : ''
                }`}
              >
                {t.label}
                {t.id === 'saved' && saved.length > 0 && <span className="ml-1.5 text-xs text-zinc-500">{saved.length}</span>}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main key={tab} className="animate-fade flex-1 px-4 pb-32 pt-4 md:pb-8">
        {tab === 'generator' && (
          <GeneratorView
            inventory={inventory}
            settings={settings}
            onSettings={setSettings}
            onEditInventory={() => setTab('parts')}
            onSave={(seq, rot, name) => saveTrack(seq, rot, name) !== null}
            onOpenInEditor={(sequence, rotation, name) => {
              setEditor({ name, sequence, rotation });
              setTab('editor');
            }}
            onUpgrade={setUpgrade}
          />
        )}
        {tab === 'editor' && (
          <EditorView
            state={editor}
            inventory={inventory}
            onChange={setEditor}
            onSave={saveFromEditor}
            onGenerate={() => setTab('generator')}
            onUpgrade={setUpgrade}
          />
        )}
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
            onToggleFavorite={(id) => setSaved((list) => list.map((t) => (t.id === id ? { ...t, favorite: !t.favorite } : t)))}
          />
        )}
        {tab === 'parts' && <InventoryView inventory={inventory} onChange={setInventory} />}
        {tab === 'pro' && <ProView />}
        <p className="mt-10 text-center text-[11px] text-zinc-600">{BRAND.compatibility}</p>
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-white/5 bg-ink-950/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
        aria-label="Hauptnavigation"
      >
        <div className="mx-auto grid max-w-md grid-cols-5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
              className={`relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition ${
                tab === t.id ? 'text-white' : 'text-zinc-500'
              }`}
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

      <Sheet open={upgrade !== null} onClose={() => setUpgrade(null)} title="Pro freischalten">
        <p className="text-sm text-zinc-300">{upgrade}</p>
        <ul className="mt-3 space-y-1.5 text-sm text-zinc-300">
          {FEATURE_ROWS.filter((r) => r.free !== r.pro).map((r) => (
            <li key={r.label} className="flex gap-2">
              <span className="text-carrera-red">✓</span>
              {r.label}
              {typeof r.pro === 'string' && <span className="text-zinc-500">· {r.pro}</span>}
            </li>
          ))}
        </ul>
        <div className="mt-4 text-sm text-zinc-400">
          ab <b className="text-white">{formatPrice(PRICES.monthly)}</b> im Monat oder <b className="text-white">{formatPrice(PRICES.yearly)}</b> im Jahr
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button onClick={() => setUpgrade(null)}>Später</Button>
          <Button
            variant="primary"
            onClick={() => {
              setUpgrade(null);
              setTab('pro');
            }}
          >
            Pro ansehen
          </Button>
        </div>
      </Sheet>

      {toast && (
        <div className="fixed inset-x-0 bottom-24 z-40 flex justify-center px-4 md:bottom-8" role="status">
          <div className="animate-rise rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink-950 shadow-xl">{toast}</div>
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
