'use client';

import { useState } from 'react';
import { MonitorSmartphone, Download, Copy, Check, AlertCircle } from 'lucide-react';

interface AddStationPcProps {
    cafeId?: string;
    /** Where the installer is hosted. Hidden entirely when not configured. */
    downloadUrl?: string;
}

/**
 * Walks an owner through linking a new gaming PC: download the installer, get a
 * setup code, type it on that machine.
 *
 * The code is what keeps the installer free of secrets — it is a public download
 * that carries no credentials, and the PC fetches its settings by redeeming the
 * code on first run.
 */
export function AddStationPc({ cafeId, downloadUrl }: AddStationPcProps) {
    const [stationName, setStationName] = useState('pc-01');
    const [code, setCode] = useState<string | null>(null);
    const [expiresAt, setExpiresAt] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const generate = async () => {
        if (!cafeId) return;

        setLoading(true);
        setError(null);
        setCode(null);

        try {
            const res = await fetch('/api/owner/stations/enroll-code', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cafeId, stationName: stationName.trim().toLowerCase() }),
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Could not create a setup code');

            setCode(data.code);
            setExpiresAt(data.expiresAt);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not create a setup code');
        } finally {
            setLoading(false);
        }
    };

    const copyCode = async () => {
        if (!code) return;
        try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Clipboard access can be blocked; the code is on screen to type anyway.
        }
    };

    const expiryText = expiresAt
        ? new Date(expiresAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
        : null;

    return (
        <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/15">
                    <MonitorSmartphone size={15} className="text-blue-400" />
                </div>
                <div>
                    <h3 className="text-sm font-bold text-slate-200">Add a gaming PC</h3>
                    <p className="text-[11px] text-slate-500">
                        Install the lock app on a PC and link it to this café
                    </p>
                </div>
            </div>

            <ol className="mb-4 flex flex-col gap-3 text-[12px] text-slate-400">
                <li className="flex gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[10px] font-bold text-slate-300">1</span>
                    <div>
                        <span>Download the installer and run it on the gaming PC.</span>
                        {downloadUrl ? (
                            <a
                                href={downloadUrl}
                                className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-blue-300 transition-colors hover:bg-blue-500/20"
                            >
                                <Download size={12} />
                                Download the lock app
                            </a>
                        ) : (
                            <p className="mt-1 text-[11px] text-amber-400/80">
                                No download link is set up yet. Build the installer and set
                                NEXT_PUBLIC_AGENT_DOWNLOAD_URL to where it is hosted.
                            </p>
                        )}
                    </div>
                </li>
                <li className="flex gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[10px] font-bold text-slate-300">2</span>
                    <span>Pick a name for that PC and get a setup code below.</span>
                </li>
                <li className="flex gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[10px] font-bold text-slate-300">3</span>
                    <span>Type the code into the app on that PC. That links it to this café.</span>
                </li>
            </ol>

            <div className="flex flex-wrap items-end gap-2">
                <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Name for this PC
                    </label>
                    <input
                        value={stationName}
                        onChange={(e) => setStationName(e.target.value)}
                        placeholder="pc-01"
                        className="w-36 rounded-lg border border-white/[0.08] bg-[#0b1018] px-2.5 py-2 text-[13px] font-semibold text-slate-200 focus:border-blue-500/50 focus:outline-none"
                    />
                </div>
                <button
                    type="button"
                    onClick={generate}
                    disabled={loading || !cafeId || !stationName.trim()}
                    className="rounded-lg bg-blue-500 px-3.5 py-2 text-[12px] font-bold text-white transition-colors hover:bg-blue-400 disabled:opacity-40"
                >
                    {loading ? 'Creating…' : 'Get setup code'}
                </button>
            </div>

            <p className="mt-2 text-[11px] text-slate-500">
                Use the names your bookings use — <span className="font-semibold text-slate-400">pc-01</span>,
                {' '}<span className="font-semibold text-slate-400">pc-02</span>, and so on. A PC named
                something else will never be unlocked by a booking.
            </p>

            {error && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3 text-[12px] text-amber-300">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {code && (
                <div className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.05] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-400">
                        Type this on the gaming PC
                    </p>
                    <div className="mt-2 flex items-center gap-3">
                        <span className="font-mono text-3xl font-bold tracking-widest text-slate-100">
                            {code}
                        </span>
                        <button
                            type="button"
                            onClick={copyCode}
                            className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 transition-colors hover:text-white"
                        >
                            {copied ? <Check size={12} /> : <Copy size={12} />}
                            {copied ? 'Copied' : 'Copy'}
                        </button>
                    </div>
                    <p className="mt-2 text-[11px] text-slate-500">
                        Works once, and only until {expiryText ?? 'it expires'}. Anyone who has it can
                        connect a PC to this café, so do not share it.
                    </p>
                </div>
            )}
        </section>
    );
}
