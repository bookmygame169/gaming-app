'use client';

import { useCallback, useEffect, useState } from 'react';
import { Trophy, Plus, Pencil, Trash2, Loader2, AlertCircle, Users, X } from 'lucide-react';

type Tournament = {
    id: string;
    name: string;
    game: string;
    description: string | null;
    icon: string | null;
    status: string;
    tournament_date: string;
    tournament_time: string;
    location: string | null;
    prize_amount: number | null;
    registration_fee: number | null;
    max_participants: number | null;
    current_participants: number;
};

interface OwnerTournamentsProps {
    cafeId?: string;
}

const STATUSES = ['upcoming', 'ongoing', 'completed', 'cancelled'] as const;

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
    upcoming: { bg: 'rgba(59,130,246,0.12)', fg: '#60a5fa' },
    ongoing: { bg: 'rgba(34,197,94,0.12)', fg: '#4ade80' },
    completed: { bg: 'rgba(255,255,255,0.06)', fg: '#94a3b8' },
    cancelled: { bg: 'rgba(239,68,68,0.12)', fg: '#f87171' },
};

const emptyForm = {
    name: '',
    game: '',
    description: '',
    icon: '🏆',
    tournament_date: '',
    tournament_time: '18:00',
    location: '',
    prize_amount: '',
    registration_fee: '',
    max_participants: '',
    status: 'upcoming',
};

/**
 * Lets an owner run tournaments at their own café.
 *
 * Previously this tab was a "coming soon" placeholder, and only a platform
 * admin could create a tournament at all — so a café could not run its own
 * event even though the customer-facing pages were built.
 */
export function OwnerTournaments({ cafeId }: OwnerTournamentsProps) {
    const [tournaments, setTournaments] = useState<Tournament[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState(emptyForm);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!cafeId) return;

        setLoading(true);
        try {
            const res = await fetch(`/api/owner/tournaments?cafeId=${encodeURIComponent(cafeId)}`, {
                credentials: 'include',
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Could not load tournaments');

            setTournaments(Array.isArray(data.tournaments) ? data.tournaments : []);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not load tournaments');
        } finally {
            setLoading(false);
        }
    }, [cafeId]);

    useEffect(() => {
        load();
    }, [load]);

    const openCreate = () => {
        setEditingId(null);
        setForm(emptyForm);
        setFormError(null);
        setShowForm(true);
    };

    const openEdit = (tournament: Tournament) => {
        setEditingId(tournament.id);
        setForm({
            name: tournament.name,
            game: tournament.game,
            description: tournament.description || '',
            icon: tournament.icon || '🏆',
            tournament_date: tournament.tournament_date,
            tournament_time: tournament.tournament_time,
            location: tournament.location || '',
            prize_amount: tournament.prize_amount != null ? String(tournament.prize_amount) : '',
            registration_fee: tournament.registration_fee != null ? String(tournament.registration_fee) : '',
            max_participants: tournament.max_participants != null ? String(tournament.max_participants) : '',
            status: tournament.status,
        });
        setFormError(null);
        setShowForm(true);
    };

    const save = async () => {
        if (!cafeId) return;

        if (!form.name.trim() || !form.game.trim() || !form.tournament_date || !form.tournament_time) {
            setFormError('Name, game, date and time are required.');
            return;
        }

        setSaving(true);
        setFormError(null);

        // Empty strings become null rather than 0 — "no prize set" and "a prize
        // of zero" are different things to show a player.
        const numeric = (value: string) => (value.trim() === '' ? null : Number(value));

        const payload = {
            name: form.name.trim(),
            game: form.game.trim(),
            description: form.description.trim() || null,
            icon: form.icon || null,
            tournament_date: form.tournament_date,
            tournament_time: form.tournament_time,
            location: form.location.trim() || null,
            prize_amount: numeric(form.prize_amount),
            registration_fee: numeric(form.registration_fee),
            max_participants: numeric(form.max_participants),
            status: form.status,
        };

        try {
            const res = await fetch('/api/owner/tournaments', {
                method: editingId ? 'PUT' : 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editingId ? { tournamentId: editingId, ...payload } : { cafeId, ...payload }),
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Could not save');

            setShowForm(false);
            load();
        } catch (err) {
            setFormError(err instanceof Error ? err.message : 'Could not save');
        } finally {
            setSaving(false);
        }
    };

    const remove = async (tournament: Tournament) => {
        const hasPlayers = tournament.current_participants > 0;
        const message = hasPlayers
            ? `${tournament.name} has ${tournament.current_participants} player(s) signed up. It will be marked cancelled rather than deleted, so their entry is not lost. Continue?`
            : `Delete "${tournament.name}"?`;

        if (!confirm(message)) return;

        try {
            const res = await fetch(`/api/owner/tournaments?tournamentId=${encodeURIComponent(tournament.id)}`, {
                method: 'DELETE',
                credentials: 'include',
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Could not delete');

            load();
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Could not delete');
        }
    };

    const field = (label: string, key: keyof typeof form, type = 'text', placeholder = '') => (
        <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {label}
            </label>
            <input
                type={type}
                value={form[key]}
                placeholder={placeholder}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="w-full rounded-lg border border-white/[0.08] bg-[#0b1018] px-2.5 py-2 text-[13px] text-slate-200 focus:border-purple-500/50 focus:outline-none"
            />
        </div>
    );

    return (
        <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15">
                        <Trophy size={15} className="text-amber-400" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-slate-200">Tournaments</h3>
                        <p className="text-[11px] text-slate-500">Events you run at this café</p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={openCreate}
                    disabled={!cafeId}
                    className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-[12px] font-bold text-black transition-colors hover:bg-amber-400 disabled:opacity-40"
                >
                    <Plus size={13} />
                    New tournament
                </button>
            </div>

            {error && (
                <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3 text-[12px] text-amber-300">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {loading && (
                <div className="flex items-center gap-2 py-8 text-[12px] text-slate-500">
                    <Loader2 size={14} className="animate-spin" /> Loading…
                </div>
            )}

            {!loading && !error && tournaments.length === 0 && (
                <p className="py-8 text-center text-[12px] text-slate-500">
                    No tournaments yet. Running one is a good way to fill quiet evenings.
                </p>
            )}

            <div className="flex flex-col gap-2">
                {tournaments.map((t) => {
                    const style = STATUS_STYLE[t.status] || STATUS_STYLE.completed;
                    const isFull = t.max_participants != null && t.current_participants >= t.max_participants;

                    return (
                        <div
                            key={t.id}
                            className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"
                        >
                            <span className="text-xl">{t.icon || '🏆'}</span>

                            <div className="min-w-[160px] flex-1">
                                <p className="text-[13px] font-bold text-slate-200">{t.name}</p>
                                <p className="text-[11px] text-slate-500">
                                    {t.game} · {new Date(t.tournament_date).toLocaleDateString('en-IN', {
                                        day: 'numeric', month: 'short',
                                    })} at {t.tournament_time}
                                </p>
                            </div>

                            <span
                                className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold"
                                style={{ background: 'rgba(255,255,255,0.04)', color: isFull ? '#f87171' : '#94a3b8' }}
                            >
                                <Users size={11} />
                                {t.current_participants}
                                {t.max_participants ? ` / ${t.max_participants}` : ''}
                            </span>

                            {t.prize_amount ? (
                                <span className="text-[11px] font-semibold text-amber-400">
                                    ₹{Number(t.prize_amount).toLocaleString('en-IN')}
                                </span>
                            ) : null}

                            <span
                                className="rounded-md px-2 py-1 text-[10px] font-bold uppercase"
                                style={{ background: style.bg, color: style.fg }}
                            >
                                {t.status}
                            </span>

                            <div className="flex gap-1">
                                <button
                                    type="button"
                                    onClick={() => openEdit(t)}
                                    className="rounded-lg border border-white/[0.08] p-1.5 text-slate-400 transition-colors hover:text-white"
                                >
                                    <Pencil size={13} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => remove(t)}
                                    className="rounded-lg border border-white/[0.08] p-1.5 text-slate-400 transition-colors hover:text-red-400"
                                >
                                    <Trash2 size={13} />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {showForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
                    <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/[0.08] bg-[#0f1520] p-5">
                        <div className="mb-4 flex items-center justify-between">
                            <h4 className="text-sm font-bold text-slate-200">
                                {editingId ? 'Edit tournament' : 'New tournament'}
                            </h4>
                            <button type="button" onClick={() => setShowForm(false)} className="text-slate-500 hover:text-white">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2">{field('Name *', 'name', 'text', 'Friday Night Valorant')}</div>
                            <div className="col-span-2">{field('Game *', 'game', 'text', 'Valorant')}</div>
                            {field('Date *', 'tournament_date', 'date')}
                            {field('Time *', 'tournament_time', 'time')}
                            {field('Entry fee (₹)', 'registration_fee', 'number', '0')}
                            {field('Prize (₹)', 'prize_amount', 'number', '0')}
                            {field('Max players', 'max_participants', 'number', '16')}
                            {field('Icon', 'icon', 'text', '🏆')}
                            <div className="col-span-2">{field('Location', 'location', 'text', 'At the café')}</div>
                            <div className="col-span-2">{field('Description', 'description', 'text', '5v5, best of three')}</div>

                            <div className="col-span-2">
                                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                    Status
                                </label>
                                <select
                                    value={form.status}
                                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                                    className="w-full rounded-lg border border-white/[0.08] bg-[#0b1018] px-2.5 py-2 text-[13px] text-slate-200 focus:outline-none"
                                >
                                    {STATUSES.map((s) => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {formError && (
                            <p className="mt-3 text-[12px] text-red-400">{formError}</p>
                        )}

                        <div className="mt-5 flex gap-2">
                            <button
                                type="button"
                                onClick={() => setShowForm(false)}
                                className="flex-1 rounded-xl border border-white/[0.08] py-2.5 text-[12px] font-semibold text-slate-300"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={save}
                                disabled={saving}
                                className="flex-1 rounded-xl bg-amber-500 py-2.5 text-[12px] font-bold text-black disabled:opacity-40"
                            >
                                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
