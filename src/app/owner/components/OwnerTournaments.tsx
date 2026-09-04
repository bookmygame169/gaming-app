'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    Chips,
    EmptyRow,
    GhostButton,
    Kpis,
    Panel,
    PrimaryButton,
    SectionBar,
    TableHead,
    TableRow,
} from './consoleUi';
import { ownerApi } from '../ownerApi';

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
    upcoming: { bg: 'rgba(216, 255, 60,0.12)', fg: '#d8ff3c' },
    ongoing: { bg: 'rgba(216, 255, 60,0.12)', fg: '#4ade80' },
    completed: { bg: 'rgba(242,240,234,.07)', fg: 'rgba(242,240,234,.55)' },
    cancelled: { bg: 'rgba(255, 92, 43,0.12)', fg: '#ff5c2b' },
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
            const data = await ownerApi<{ tournaments?: unknown }>(
                `/api/owner/tournaments?cafeId=${encodeURIComponent(cafeId)}`,
                { method: 'GET', fallbackMessage: 'Could not load tournaments' }
            );

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
            await ownerApi('/api/owner/tournaments', {
                method: editingId ? 'PUT' : 'POST',
                body: editingId ? { tournamentId: editingId, ...payload } : { cafeId, ...payload },
                fallbackMessage: 'Could not save',
            });

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
            await ownerApi(`/api/owner/tournaments?tournamentId=${encodeURIComponent(tournament.id)}`, {
                method: 'DELETE',
                fallbackMessage: 'Could not delete',
            });

            load();
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Could not delete');
        }
    };

    const field = (label: string, key: keyof typeof form, type = 'text', placeholder = '') => (
        <div className="flex flex-col gap-1.5">
            <label className="font-mono text-[9.5px] tracking-[0.16em] text-[#f2f0ea]/[0.42]">
                {label.toUpperCase()}
            </label>
            <input
                type={type}
                value={form[key]}
                placeholder={placeholder}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="h-[38px] w-full border border-[#f2f0ea]/[0.14] bg-transparent px-3 font-mono text-[11.5px] text-[#f2f0ea] outline-none transition-colors placeholder:text-[#f2f0ea]/30 focus:border-[#d8ff3c]"
            />
        </div>
    );

    const COLUMNS = 'minmax(140px,1.4fr) 128px minmax(120px,1fr) 92px 96px 104px';

    const exportTournamentsCsv = () => {
        const header = ['Event', 'Game', 'When', 'Status', 'Seats taken', 'Seats', 'Entry fee', 'Collected', 'Prize pot', 'Net'];
        const rows = tournaments.map((t) => {
            const entry = Number(t.registration_fee) || 0;
            const taken = t.current_participants || 0;
            const potOut = Number(t.prize_amount) || 0;
            return [
                t.name, t.game || '', `${t.tournament_date} ${t.tournament_time || ''}`.trim(), t.status || '',
                String(taken), String(t.max_participants ?? ''), String(entry),
                String(entry * taken), String(potOut), String(entry * taken - potOut),
            ];
        });
        const escape = (cell: string) => `"${String(cell).replace(/"/g, '""')}"`;
        const csv = [header, ...rows].map((cols) => cols.map(escape).join(',')).join('\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `tournaments-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const upcoming = tournaments.filter((t) => (t.status || '').toLowerCase() === 'upcoming');
    const live = tournaments.filter((t) => ['ongoing', 'live'].includes((t.status || '').toLowerCase()));
    const seatsTaken = tournaments.reduce((sum, t) => sum + (t.current_participants || 0), 0);
    const pot = tournaments.reduce((sum, t) => sum + (Number(t.prize_amount) || 0), 0);

    const whenOf = (t: Tournament) => {
        const date = new Date(t.tournament_date);
        const day = Number.isNaN(date.getTime())
            ? t.tournament_date
            : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }).toUpperCase();
        return t.tournament_time ? `${day} · ${t.tournament_time}` : day;
    };

    return (
        <div className="flex flex-col gap-[18px]">
            <Kpis
                items={[
                    { label: 'RUNNING NOW', value: String(live.length), tone: live.length > 0 ? 'lime' : 'ink', sub: live.length > 0 ? 'in progress' : 'nothing live' },
                    { label: 'OPEN FOR ENTRIES', value: String(upcoming.length), sub: 'on the calendar' },
                    { label: 'SEATS TAKEN', value: String(seatsTaken), sub: 'across every event' },
                    { label: 'PRIZE MONEY', value: `₹${pot.toLocaleString('en-IN')}`, sub: 'promised in total' },
                ]}
            />

            <div className="flex flex-wrap items-center gap-[9px]">
                <SectionBar
                    title="EVENTS AT THIS CAFÉ"
                    action={
                        <PrimaryButton onClick={() => (showForm ? setShowForm(false) : openCreate())}>
                            {showForm ? 'CLOSE' : '+ NEW EVENT'}
                        </PrimaryButton>
                    }
                />
            </div>

            {error && (
                <div className="border border-[#ff5c2b]/[0.28] bg-[#ff5c2b]/[0.06] px-[15px] py-3 font-mono text-[10.5px] tracking-[0.1em] text-[#ff5c2b]">
                    {error}
                </div>
            )}

            {showForm && (
                <Panel className="flex flex-col gap-4 px-4 py-4">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {field('Name', 'name', 'text', 'Friday Valorant 5v5')}
                        {field('Game', 'game', 'text', 'Valorant')}
                        {field('Date', 'tournament_date', 'date')}
                        {field('Time', 'tournament_time', 'time')}
                        {field('Prize pool', 'prize_amount', 'number', '5000')}
                        {field('Entry fee', 'registration_fee', 'number', '200')}
                        {field('Seats', 'max_participants', 'number', '16')}
                        {field('Where', 'location', 'text', 'At the café')}
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <span className="font-mono text-[9.5px] tracking-[0.16em] text-[#f2f0ea]/[0.42]">
                            STATUS
                        </span>
                        <Chips
                            items={STATUSES.map((status) => ({ id: status, label: status.toUpperCase() }))}
                            active={form.status}
                            onPick={(status) => setForm({ ...form, status })}
                        />
                    </div>

                    {formError && (
                        <span className="font-mono text-[10.5px] tracking-[0.1em] text-[#ff5c2b]">{formError}</span>
                    )}

                    <div className="flex flex-wrap gap-2">
                        <PrimaryButton onClick={save} disabled={saving}>
                            {saving ? 'SAVING…' : editingId ? 'SAVE CHANGES' : 'CREATE EVENT'}
                        </PrimaryButton>
                        <GhostButton onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm); }}>
                            CANCEL
                        </GhostButton>
                    </div>
                </Panel>
            )}

            <Panel>
                <TableHead columns={COLUMNS}>
                    <span>EVENT</span>
                    <span>WHEN</span>
                    <span>SEATS</span>
                    <span className="text-right">ENTRY</span>
                    <span className="text-right">POT / NET</span>
                    <span className="text-right">ACTIONS</span>
                </TableHead>

                {tournaments.length === 0 ? (
                    <EmptyRow>
                        {loading ? 'Loading…' : 'No events yet. Put one up and it shows on the customer site.'}
                    </EmptyRow>
                ) : (
                    tournaments.map((tournament) => {
                        const status = (tournament.status || '').toLowerCase();
                        const seats = tournament.max_participants || 0;
                        const taken = tournament.current_participants || 0;
                        const full = seats > 0 && taken >= seats;
                        // What the seats bring in against what the winner takes.
                        // An event can fill and still cost money to run.
                        const entry = Number(tournament.registration_fee) || 0;
                        const potOut = Number(tournament.prize_amount) || 0;
                        const collected = entry * taken;
                        const net = collected - potOut;
                        const edge = ['ongoing', 'live'].includes(status)
                            ? '#d8ff3c'
                            : status === 'cancelled'
                                ? 'rgba(242,240,234,.2)'
                                : full ? '#ff5c2b' : 'transparent';

                        return (
                            <TableRow key={tournament.id} columns={COLUMNS} edge={edge}>
                                <div className="flex min-w-0 flex-col gap-[3px]">
                                    <span className="truncate text-[13.5px] font-bold text-[#f2f0ea]">
                                        {tournament.name}
                                    </span>
                                    <span className="truncate font-mono text-[10px] tracking-[0.1em] text-[#f2f0ea]/35">
                                        {(tournament.game || '').toUpperCase()}
                                        {tournament.location ? ` · ${tournament.location.toUpperCase()}` : ''}
                                    </span>
                                </div>

                                <div className="flex min-w-0 flex-col gap-[3px]">
                                    <span className="whitespace-nowrap font-mono text-[11.5px] text-[#f2f0ea]/80">
                                        {whenOf(tournament)}
                                    </span>
                                    <span
                                        className="justify-self-start whitespace-nowrap px-2 py-1 font-mono text-[9.5px] tracking-[0.1em]"
                                        style={
                                            status === 'ongoing'
                                                ? { background: 'rgba(216,255,60,.12)', color: '#d8ff3c' }
                                                : status === 'cancelled'
                                                    ? { background: 'rgba(255,92,43,.12)', color: '#ff5c2b' }
                                                    : { background: STATUS_STYLE[status]?.bg ?? 'rgba(242,240,234,.07)', color: 'rgba(242,240,234,.6)' }
                                        }
                                    >
                                        {status.toUpperCase()}
                                    </span>
                                </div>

                                <div className="flex min-w-0 flex-col gap-1.5">
                                    <span
                                        className="whitespace-nowrap font-mono text-[11.5px]"
                                        style={{ color: full ? '#ff5c2b' : '#f2f0ea' }}
                                    >
                                        {taken}/{seats || '—'}
                                    </span>
                                    {seats > 0 && (
                                        <div className="h-[5px] bg-[#f2f0ea]/[0.08]">
                                            <div
                                                className="h-[5px]"
                                                style={{
                                                    width: `${Math.min(100, (taken / seats) * 100)}%`,
                                                    background: full ? '#ff5c2b' : '#d8ff3c',
                                                }}
                                            />
                                        </div>
                                    )}
                                </div>

                                <div className="flex min-w-0 flex-col items-end gap-[3px]">
                                    <span className="whitespace-nowrap text-[13px] font-extrabold text-[#f2f0ea]">
                                        {entry > 0 ? `₹${entry.toLocaleString('en-IN')}` : 'FREE'}
                                    </span>
                                    <span className="whitespace-nowrap font-mono text-[10px] text-[#f2f0ea]/35">
                                        ₹{collected.toLocaleString('en-IN')} in
                                    </span>
                                </div>

                                <div className="flex min-w-0 flex-col items-end gap-[3px]">
                                    <span className="whitespace-nowrap font-mono text-[11.5px] text-[#f2f0ea]/70">
                                        ₹{potOut.toLocaleString('en-IN')}
                                    </span>
                                    <span
                                        className="whitespace-nowrap font-mono text-[11.5px] font-semibold"
                                        style={{ color: net > 0 ? '#d8ff3c' : net < 0 ? '#ff5c2b' : 'rgba(242,240,234,.35)' }}
                                    >
                                        {net > 0 ? '+' : ''}₹{Math.abs(net).toLocaleString('en-IN')}
                                    </span>
                                </div>

                                <div className="flex justify-end gap-[5px]">
                                    <button
                                        type="button"
                                        title="Edit this event"
                                        onClick={() => openEdit(tournament)}
                                        className="flex h-[26px] items-center border border-[#f2f0ea]/[0.14] px-[9px] font-mono text-[9.5px] tracking-[0.1em] text-[#f2f0ea]/55 transition-colors hover:border-[#d8ff3c] hover:text-[#d8ff3c]"
                                    >
                                        EDIT
                                    </button>
                                    <button
                                        type="button"
                                        title="Remove this event"
                                        onClick={() => remove(tournament)}
                                        className="flex h-[26px] items-center border border-[#f2f0ea]/[0.14] px-[9px] font-mono text-[9.5px] tracking-[0.1em] text-[#f2f0ea]/55 transition-colors hover:border-[#ff5c2b] hover:text-[#ff5c2b]"
                                    >
                                        DELETE
                                    </button>
                                </div>
                            </TableRow>
                        );
                    })
                )}

                <div className="flex items-center gap-3.5 border-t border-[#f2f0ea]/10 px-4 py-3 font-mono text-[10.5px] text-[#f2f0ea]/40">
                    <span className="truncate">
                        {tournaments.length} event{tournaments.length === 1 ? '' : 's'} · entries are taken at the café, the site lists them only
                    </span>
                    <span className="flex-1" />
                    <button
                        type="button"
                        onClick={exportTournamentsCsv}
                        disabled={tournaments.length === 0}
                        className="whitespace-nowrap tracking-[0.14em] transition-colors hover:text-[#d8ff3c] disabled:opacity-40"
                    >
                        EXPORT CSV →
                    </button>
                </div>
            </Panel>
        </div>
    );
}
