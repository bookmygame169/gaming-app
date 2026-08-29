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
    <section className=" border border-[#f2f0ea]/10 bg-[#111113] p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center bg-[#d8ff3c]/15">
            <Gamepad2 size={15} className="text-[#d8ff3c]" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#f2f0ea]">PC game menu</h3>
            <p className="text-[11px] text-[#f2f0ea]/40">
              Games customers see after unlock — Valorant, GTA, etc. (not Notepad)
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving || loading || games.length === 0}
          className="inline-flex items-center gap-1.5 bg-[#d8ff3c] px-3 py-2 text-[12px] font-bold text-[#0b0b0c] transition-colors hover:bg-[#d8ff3c] disabled:opacity-40"
        >
          <Save size={13} />
          {saving ? 'Saving…' : 'Save games'}
        </button>
      </div>

      {error && (
        <p className="mb-3 border border-[#ff5c2b]/25 bg-[#ff5c2b]/10 px-3 py-2 text-[12px] text-[#ff5c2b]">
          {error}
        </p>
      )}

      {success && (
        <p className="mb-3 border border-[#d8ff3c]/25 bg-[#d8ff3c]/10 px-3 py-2 text-[12px] text-[#d8ff3c]">
          {success}
        </p>
      )}

      {loading ? (
        <p className="text-[12px] text-[#f2f0ea]/40">Loading games…</p>
      ) : (
        <div className="space-y-3">
          {games.map((game, index) => (
            <div
              key={game.id || `row-${index}`}
              className=" border border-[#f2f0ea]/[0.07] bg-transparent p-3 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wide text-[#f2f0ea]/40">
                  Game {index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => setGames((prev) => prev.filter((_, i) => i !== index))}
                  className="text-[#f2f0ea]/40 hover:text-[#ff5c2b]"
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
                className="w-full border border-[#f2f0ea]/10 bg-black/20 px-2.5 py-2 text-[12px] text-[#f2f0ea]"
              />
              <input
                value={game.exe_path}
                onChange={(e) =>
                  setGames((prev) =>
                    prev.map((row, i) => (i === index ? { ...row, exe_path: e.target.value } : row))
                  )
                }
                placeholder="Exe path (e.g. C:\Riot Games\...\RiotClientServices.exe)"
                className="w-full border border-[#f2f0ea]/10 bg-black/20 px-2.5 py-2 text-[12px] text-[#f2f0ea]"
              />
              <input
                value={game.arguments}
                onChange={(e) =>
                  setGames((prev) =>
                    prev.map((row, i) => (i === index ? { ...row, arguments: e.target.value } : row))
                  )
                }
                placeholder="Arguments (optional, e.g. Steam -applaunch 730)"
                className="w-full border border-[#f2f0ea]/10 bg-black/20 px-2.5 py-2 text-[12px] text-[#f2f0ea]"
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
                className="w-full border border-[#f2f0ea]/10 bg-black/20 px-2.5 py-2 text-[12px] text-[#f2f0ea]"
              />
            </div>
          ))}

          <button
            type="button"
            onClick={() => setGames((prev) => [...prev, { ...EMPTY_ROW(), sort_order: prev.length + 1 }])}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#d8ff3c] hover:text-[#d8ff3c]"
          >
            <Plus size={14} />
            Add game
          </button>

          <p className="text-[11px] text-[#f2f0ea]/40 leading-relaxed">
            Paths must match how games are installed <strong>on your PCs</strong>. After saving,
            restart the lock app on each gaming PC so it downloads the new list.
          </p>
        </div>
      )}
    </section>
  );
}
