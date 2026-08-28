'use client';

import { useCallback, useEffect, useState } from 'react';
import { Gamepad2, Check, X, AlertTriangle, Monitor } from 'lucide-react';

type DiscoveredGame = {
    key: string;
    ids: string[];
    name: string;
    exePath: string;
    arguments: string | null;
    processName: string | null;
    source: string;
    stations: string[];
    sameNameOnMenu?: boolean;
    otherPaths?: string[];
};

type Props = {
    cafeId: string;
};

const SOURCE_LABEL: Record<string, string> = {
    steam: 'Steam',
    xbox: 'Xbox',
    epic: 'Epic Games',
    registry: 'Installed programs',
    store: 'Microsoft Store',
    desktop: 'Desktop shortcut',
    other: 'Found on the PC',
};

/**
 * What the owner is shown instead of the raw command.
 *
 * A Game Pass title's real path is C:\\Windows\\explorer.exe with the game's
 * shell:AppsFolder id as an argument — correct, and identical on every PC,
 * which is exactly why it is used. It is also unreadable, and three of them in
 * a row look like the same entry repeated. The folder path is shown for
 * ordinary games because a café with two copies of a game on different drives
 * needs to see which one this is.
 */
function describeLaunch(game: DiscoveredGame): string {
    const store = (game.arguments || '').match(/shell:AppsFolder\\(.+)/i);
    if (store) return `Starts through Windows · ${store[1].split('!')[0]}`;
    return game.exePath;
}

/**
 * Games the café's PCs found installed, waiting to be judged.
 *
 * Suggestions only. Nothing here is on a lock screen — adding one copies it
 * into the café's game list, which is what every PC actually builds its menu
 * from. That gap is the whole design: the machines are far better at finding
 * things than at telling a game from adware, and a person reading a list is
 * better at the second part than any rule.
 */
export function DiscoveredGames({ cafeId }: Props) {
    const [games, setGames] = useState<DiscoveredGame[]>([]);
    const [busy, setBusy] = useState<string | null>(null);
    const [migrationMissing, setMigrationMissing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!cafeId) return;

        try {
            const res = await fetch(`/api/owner/discovered-games?cafeId=${encodeURIComponent(cafeId)}`, {
                credentials: 'include',
            });
            const data = await res.json().catch(() => ({}));

            if (res.ok) {
                setGames(data.games || []);
                setMigrationMissing(Boolean(data.migrationMissing));
            }
        } catch {
            // Leaves the last list on screen rather than claiming an empty one.
        }
    }, [cafeId]);

    useEffect(() => {
        void load();
    }, [load]);

    const answer = async (game: DiscoveredGame, action: 'add' | 'ignore') => {
        setBusy(game.key);
        setError(null);

        try {
            const res = await fetch('/api/owner/discovered-games', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ cafeId, ids: game.ids, action, name: game.name }),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                setError(data.error || 'Could not do that.');
                return;
            }

            setGames((current) => current.filter((row) => row.key !== game.key));
        } catch {
            setError('Could not reach the server.');
        } finally {
            setBusy(null);
        }
    };

    if (migrationMissing) {
        return (
            <div className="flex items-start gap-2 border border-[#ff5c2b]/20 bg-[#ff5c2b]/10 p-4">
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-[#ff5c2b]" />
                <p className="text-[11px] leading-relaxed text-[#ff5c2b]/90">
                    Your PCs cannot report what they have installed yet — run migration{' '}
                    <span className="font-mono">20260822100000_station_discovered_games.sql</span> in Supabase.
                </p>
            </div>
        );
    }

    // Nothing waiting means nothing to show. A permanent empty panel would be in
    // the way every day for the sake of the few minutes a month it has something
    // in it.
    if (games.length === 0) return null;

    return (
        <div className=" border border-[#d8ff3c]/25 bg-[#d8ff3c]/[0.04] p-5">
            <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center bg-[#d8ff3c]/15">
                    <Gamepad2 size={15} className="text-[#d8ff3c]" />
                </div>
                <div>
                    <h3 className="text-sm font-bold text-[#f2f0ea]">
                        {games.length} game{games.length > 1 ? 's' : ''} found on your PCs
                    </h3>
                    <p className="text-[11px] text-[#f2f0ea]/40">
                        Not on the lock screen yet. Add the ones you want customers to see.
                    </p>
                </div>
            </div>

            {error && (
                <p className="mt-3 border border-[#ff5c2b]/25 bg-[#ff5c2b]/10 px-3 py-2 text-[11px] font-semibold text-[#ff5c2b]">
                    {error}
                </p>
            )}

            <div className="mt-4 space-y-2.5">
                {games.map((game) => (
                    <div key={game.key} className=" border border-[#f2f0ea]/10 bg-[#0d0d14] p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-bold text-[#f2f0ea]">{game.name}</span>
                                    <span className=" bg-[#f2f0ea]/[0.06] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#f2f0ea]/50">
                                        {SOURCE_LABEL[game.source] ?? game.source}
                                    </span>
                                </div>

                                <p
                                    className="mt-1.5 truncate font-mono text-[10.5px] text-[#f2f0ea]/40"
                                    title={`${game.exePath}${game.arguments ? ` ${game.arguments}` : ''}`}
                                >
                                    {describeLaunch(game)}
                                </p>

                                {(game.otherPaths?.length ?? 0) > 0 && (
                                    <p className="mt-1.5 text-[11px] text-[#f2f0ea]/50">
                                        In a different folder on some PCs — add it once, each PC finds its own copy.
                                    </p>
                                )}

                                {game.sameNameOnMenu && (
                                    <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-[#ff5c2b]/90">
                                        <AlertTriangle size={11} />
                                        A game with this name is already on your menu — adding this makes a second tile.
                                    </p>
                                )}

                                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-[#f2f0ea]/40">
                                    <Monitor size={11} />
                                    {/* Which machines have it. A game on one PC of four is
                                        usually worth a second look before it goes on every
                                        lock screen. */}
                                    {game.stations.length === 1
                                        ? `Only on ${game.stations[0].toUpperCase()}`
                                        : `On ${game.stations.length} PCs`}
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => answer(game, 'ignore')}
                                    disabled={busy === game.key}
                                    className="inline-flex items-center gap-1.5 bg-[#f2f0ea]/[0.06] px-3 py-2 text-xs font-bold text-[#f2f0ea]/50 transition-colors hover:bg-white/[0.09] disabled:opacity-40"
                                >
                                    <X size={13} />
                                    Not a game
                                </button>
                                <button
                                    type="button"
                                    onClick={() => answer(game, 'add')}
                                    disabled={busy === game.key}
                                    className="inline-flex items-center gap-1.5 bg-[#d8ff3c]/15 px-4 py-2 text-xs font-bold text-[#d8ff3c] transition-colors hover:bg-[#d8ff3c]/25 disabled:opacity-40"
                                >
                                    <Check size={13} />
                                    {busy === game.key ? 'Adding…' : 'Add to menu'}
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
