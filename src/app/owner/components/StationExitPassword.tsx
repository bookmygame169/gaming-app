'use client';

import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Check, AlertTriangle } from 'lucide-react';

type Props = {
    cafeId: string;
};

/**
 * Sets the password that closes a station's lock screen.
 *
 * One value for the whole café, because the alternative was running a script on
 * every PC — three chances to mistype it and no way to change it later without
 * walking to each desk.
 *
 * The password is sent once, hashed on the server and stored as a hash. It is
 * never sent back: this only ever learns whether one exists, which is all it
 * needs in order to say "Set" or "Change".
 */
export function StationExitPassword({ cafeId }: Props) {
    const [isSet, setIsSet] = useState<boolean | null>(null);
    const [migrationNeeded, setMigrationNeeded] = useState(false);
    const [password, setPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await fetch(
                `/api/owner/stations/exit-password?cafeId=${encodeURIComponent(cafeId)}`,
                { credentials: 'include' }
            );
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                setIsSet(Boolean(data.isSet));
                setMigrationNeeded(Boolean(data.migrationNeeded));
            }
        } catch {
            // Leaves the card in its loading state rather than claiming a state
            // it could not read.
        }
    }, [cafeId]);

    useEffect(() => {
        if (cafeId) void load();
    }, [cafeId, load]);

    const save = async () => {
        if (password !== confirmation) {
            setMessage({ tone: 'bad', text: 'Those two do not match.' });
            return;
        }

        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch('/api/owner/stations/exit-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ cafeId, password }),
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                setMessage({ tone: 'bad', text: data.error || 'Could not save that.' });
                return;
            }

            setPassword('');
            setConfirmation('');
            setMessage({ tone: 'ok', text: data.note || 'Saved.' });
            await load();
        } catch {
            setMessage({ tone: 'bad', text: 'Could not reach the server.' });
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        if (!window.confirm('Remove the exit password? Ctrl+Alt+Shift+Q will then do nothing.')) return;

        setSaving(true);
        try {
            const res = await fetch(
                `/api/owner/stations/exit-password?cafeId=${encodeURIComponent(cafeId)}`,
                { method: 'DELETE', credentials: 'include' }
            );
            const data = await res.json().catch(() => ({}));
            setMessage(
                res.ok
                    ? { tone: 'ok', text: 'Removed. Stations pick this up when their agent next starts.' }
                    : { tone: 'bad', text: data.error || 'Could not remove it.' }
            );
            await load();
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className=" border border-[#f2f0ea]/10 bg-[#0d0d14] p-5">
            <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center bg-[#ff5c2b]/15">
                    <KeyRound size={16} className="text-[#ff5c2b]" />
                </div>
                <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-[#f2f0ea]">Staff exit password</h3>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-[#f2f0ea]/40">
                        At a locked PC, press <span className="font-mono text-[#f2f0ea]/50">Ctrl+Alt+Shift+Q</span> and
                        type this to close the lock screen — for fixing a machine without signing the customer out.
                        Their remaining time is not lost.
                    </p>

                    {isSet !== null && !migrationNeeded && (
                        <p className="mt-2 text-[11px] font-semibold" style={{ color: isSet ? '#d8ff3c' : 'rgba(242,240,234,.45)' }}>
                            {isSet
                                ? 'A password is set. Typing a new one replaces it everywhere.'
                                : 'No password set — the shortcut currently does nothing.'}
                        </p>
                    )}

                    {migrationNeeded && (
                        <div className="mt-3 flex items-start gap-2 border border-[#ff5c2b]/20 bg-[#ff5c2b]/10 p-3">
                            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-[#ff5c2b]" />
                            <p className="text-[11px] leading-relaxed text-[#ff5c2b]/90">
                                Run migration 20260819000000_add_station_exit_password.sql before using this.
                            </p>
                        </div>
                    )}

                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder={isSet ? 'New password' : 'Password'}
                            autoComplete="new-password"
                            className="w-full border border-[#f2f0ea]/10 bg-[#f2f0ea]/[0.06] px-3 py-2.5 text-sm text-[#f2f0ea] outline-none placeholder:text-[#f2f0ea]/40 focus:border-[#ff5c2b]/50"
                        />
                        <input
                            type="password"
                            value={confirmation}
                            onChange={(e) => setConfirmation(e.target.value)}
                            placeholder="Type it again"
                            autoComplete="new-password"
                            className="w-full border border-[#f2f0ea]/10 bg-[#f2f0ea]/[0.06] px-3 py-2.5 text-sm text-[#f2f0ea] outline-none placeholder:text-[#f2f0ea]/40 focus:border-[#ff5c2b]/50"
                        />
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={save}
                            disabled={saving || password.length === 0 || migrationNeeded}
                            className=" bg-[#ff5c2b]/15 px-4 py-2 text-xs font-bold text-[#ff5c2b] transition-colors hover:bg-[#ff5c2b]/25 disabled:opacity-40"
                        >
                            {saving ? 'Saving…' : isSet ? 'Replace password' : 'Set password'}
                        </button>

                        {isSet && (
                            <button
                                type="button"
                                onClick={remove}
                                disabled={saving}
                                className=" bg-[#f2f0ea]/[0.06] px-4 py-2 text-xs font-bold text-[#f2f0ea]/50 transition-colors hover:bg-white/[0.09] disabled:opacity-40"
                            >
                                Remove
                            </button>
                        )}
                    </div>

                    {message && (
                        <p
                            className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold"
                            style={{ color: message.tone === 'ok' ? '#d8ff3c' : '#ff5c2b' }}
                        >
                            {message.tone === 'ok' && <Check size={12} />}
                            {message.text}
                        </p>
                    )}

                    <p className="mt-3 text-[11px] leading-relaxed text-[#f2f0ea]/30">
                        Stored scrambled, never as text — nobody can read it back, here or on the PCs.
                        Write it down somewhere safe; the only way to recover it is to set a new one.
                    </p>
                </div>
            </div>
        </div>
    );
}
