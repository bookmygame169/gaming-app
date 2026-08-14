'use client';

import { useCallback, useEffect, useState } from 'react';
import { Gamepad2, Plus, Save, Trash2 } from 'lucide-react';

type GameRow = {
  id?: string;
  name: string;
  exe_path: string;
  arguments: string;
  process_name: string;
  sort_order: number;
};

interface CafePcGamesEditorProps {
  cafeId?: string;
}

const EMPTY_ROW = (): GameRow => ({
  name: '',
  exe_path: '',
  arguments: '',
  process_name: '',
  sort_order: 0,
});

export function CafePcGamesEditor({ cafeId }: CafePcGamesEditorProps) {
  const [games, setGames] = useState<GameRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!cafeId) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/owner/cafe-games?cafeId=${encodeURIComponent(cafeId)}`, {
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(data.error || 'Could not load games');

      const rows = Array.isArray(data.games) ? data.games : [];
      setGames(
        rows.map((row: GameRow, index: number) => ({
          id: row.id,
          name: row.name || '',
          exe_path: row.exe_path || '',
          arguments: row.arguments || '',
          process_name: row.process_name || '',
          sort_order: row.sort_order ?? index + 1,
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load games');
    } finally {
      setLoading(false);
    }
  }, [cafeId]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!cafeId) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/owner/cafe-games', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cafeId,
          games: games.map((game, index) => ({
            name: game.name,
            exe_path: game.exe_path,
            arguments: game.arguments || null,
            process_name: game.process_name || null,
            sort_order: index + 1,
          })),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save games');

      setSuccess('Saved. Restart the lock app on each PC (or reboot) to refresh the game menu.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save games');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/15">
            <Gamepad2 size={15} className="text-violet-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-200">PC game menu</h3>
            <p className="text-[11px] text-slate-500">
              Games customers see after unlock — Valorant, GTA, etc. (not Notepad)
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving || loading || games.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-[12px] font-bold text-white transition-colors hover:bg-violet-500 disabled:opacity-40"
        >
          <Save size={13} />
          {saving ? 'Saving…' : 'Save games'}
        </button>
      </div>

      {error && (
        <p className="mb-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
          {error}
        </p>
      )}

      {success && (
        <p className="mb-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-300">
          {success}
        </p>
      )}

      {loading ? (
        <p className="text-[12px] text-slate-500">Loading games…</p>
      ) : (
        <div className="space-y-3">
          {games.map((game, index) => (
            <div
              key={game.id || `row-${index}`}
              className="rounded-xl border border-white/[0.06] bg-[#0b1018] p-3 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Game {index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => setGames((prev) => prev.filter((_, i) => i !== index))}
                  className="text-slate-500 hover:text-red-400"
                  aria-label="Remove game"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <input
                value={game.name}
                onChange={(e) =>
                  setGames((prev) =>
                    prev.map((row, i) => (i === index ? { ...row, name: e.target.value } : row))
                  )
                }
                placeholder="Game name (e.g. Valorant)"
                className="w-full rounded-lg border border-white/[0.08] bg-black/20 px-2.5 py-2 text-[12px] text-slate-200"
              />
              <input
                value={game.exe_path}
                onChange={(e) =>
                  setGames((prev) =>
                    prev.map((row, i) => (i === index ? { ...row, exe_path: e.target.value } : row))
                  )
                }
                placeholder="Exe path (e.g. C:\Riot Games\...\RiotClientServices.exe)"
                className="w-full rounded-lg border border-white/[0.08] bg-black/20 px-2.5 py-2 text-[12px] text-slate-200"
              />
              <input
                value={game.arguments}
                onChange={(e) =>
                  setGames((prev) =>
                    prev.map((row, i) => (i === index ? { ...row, arguments: e.target.value } : row))
                  )
                }
                placeholder="Arguments (optional, e.g. Steam -applaunch 730)"
                className="w-full rounded-lg border border-white/[0.08] bg-black/20 px-2.5 py-2 text-[12px] text-slate-200"
              />
              <input
                value={game.process_name}
                onChange={(e) =>
                  setGames((prev) =>
                    prev.map((row, i) =>
                      i === index ? { ...row, process_name: e.target.value } : row
                    )
                  )
                }
                placeholder="Process name without .exe (e.g. VALORANT-Win64-Shipping)"
                className="w-full rounded-lg border border-white/[0.08] bg-black/20 px-2.5 py-2 text-[12px] text-slate-200"
              />
            </div>
          ))}

          <button
            type="button"
            onClick={() => setGames((prev) => [...prev, { ...EMPTY_ROW(), sort_order: prev.length + 1 }])}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-violet-400 hover:text-violet-300"
          >
            <Plus size={14} />
            Add game
          </button>

          <p className="text-[11px] text-slate-500 leading-relaxed">
            Paths must match how games are installed <strong>on your PCs</strong>. After saving,
            restart the lock app on each gaming PC so it downloads the new list.
          </p>
        </div>
      )}
    </section>
  );
}
