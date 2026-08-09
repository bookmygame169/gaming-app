'use client';

import { useCallback, useEffect, useState } from 'react';
import { Sparkles, Loader2, AlertCircle, Gift, Save, Search, TrendingUp } from 'lucide-react';

type Settings = {
    enabled: boolean;
    pointsPerHundred: number;
    rupeesPerPoint: number;
    minRedeemPoints: number;
};

type Member = {
    phone: string;
    name: string | null;
    balance: number;
    earned: number;
    redeemed: number;
    worthRupees: number;
    lastActivity: string;
};

type RecentEntry = {
    id: string;
    phone: string;
    points: number;
    reason: string;
    note: string | null;
    createdAt: string;
};

interface OwnerLoyaltyProps {
    cafeId?: string;
}

const REASON_LABELS: Record<string, string> = {
    booking: 'Session',
    redeemed: 'Used',
    manual: 'Adjusted',
    bonus: 'Bonus',
    expired: 'Expired',
};

const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/**
 * Loyalty points for one café: the rules, who is holding points, and the
 * counter tool for spending them.
 *
 * Points are keyed on phone number rather than account, because most customers
 * are walk-ins who never sign in.
 */
export function OwnerLoyalty({ cafeId }: OwnerLoyaltyProps) {
    const [settings, setSettings] = useState<Settings>({
        enabled: false,
        pointsPerHundred: 5,
        rupeesPerPoint: 1,
        minRedeemPoints: 50,
    });
    const [members, setMembers] = useState<Member[]>([]);
    const [recent, setRecent] = useState<RecentEntry[]>([]);
    const [outstandingPoints, setOutstandingPoints] = useState(0);
    const [outstandingRupees, setOutstandingRupees] = useState(0);
    const [memberCount, setMemberCount] = useState(0);

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const [search, setSearch] = useState('');

    const [redeemPhone, setRedeemPhone] = useState('');
    const [redeemPoints, setRedeemPoints] = useState('');
    const [redeemMode, setRedeemMode] = useState<'redeemed' | 'bonus'>('redeemed');
    const [redeeming, setRedeeming] = useState(false);

    const load = useCallback(async () => {
        if (!cafeId) return;

        setLoading(true);
        try {
            const res = await fetch(`/api/owner/loyalty?cafeId=${encodeURIComponent(cafeId)}`, {
                credentials: 'include',
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Could not load points');

            setSettings(data.settings);
            setMembers(Array.isArray(data.members) ? data.members : []);
            setRecent(Array.isArray(data.recent) ? data.recent : []);
            setOutstandingPoints(Number(data.outstandingPoints) || 0);
            setOutstandingRupees(Number(data.outstandingRupees) || 0);
            setMemberCount(Number(data.memberCount) || 0);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not load points');
        } finally {
            setLoading(false);
        }
    }, [cafeId]);

    useEffect(() => {
        load();
    }, [load]);

    const saveSettings = async () => {
        if (!cafeId) return;

        setSaving(true);
        setNotice(null);
        try {
            const res = await fetch('/api/owner/loyalty', {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cafeId, ...settings }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Could not save');

            setNotice('Saved.');
            setError(null);
            load();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save');
        } finally {
            setSaving(false);
        }
    };

    const submitPoints = async () => {
        if (!cafeId) return;

        setRedeeming(true);
        setNotice(null);
        try {
            const res = await fetch('/api/owner/loyalty', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cafeId,
                    phone: redeemPhone,
                    points: Number(redeemPoints),
                    reason: redeemMode,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Could not apply points');

            setNotice(
                redeemMode === 'redeemed'
                    ? `Done — give ₹${data.rupeesOff} off this session.`
                    : `Added ${redeemPoints} points.`
            );
            setRedeemPhone('');
            setRedeemPoints('');
            setError(null);
            load();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not apply points');
        } finally {
            setRedeeming(false);
        }
    };

    const searchKey = search.replace(/\D/g, '');
    const visibleMembers = searchKey
        ? members.filter(
              (member) =>
                  member.phone.includes(searchKey) ||
                  (member.name || '').toLowerCase().includes(search.toLowerCase())
          )
        : members;

    // Shows the owner what the current rules mean in practice, so the numbers
    // are not abstract while they are being set.
    const exampleSpend = 500;
    const examplePoints = settings.pointsPerHundred > 0
        ? Math.max(1, Math.floor((exampleSpend / 100) * settings.pointsPerHundred))
        : 0;

    return (
        <div className="flex flex-col gap-4">
            <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/15">
                            <Sparkles size={15} className="text-purple-400" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-slate-200">Loyalty points</h3>
                            <p className="text-[11px] text-slate-500">
                                Reward regulars so they come back to you
                            </p>
                        </div>
                    </div>

                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/[0.08] px-3 py-2">
                        <input
                            type="checkbox"
                            checked={settings.enabled}
                            onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
                            className="h-4 w-4 accent-purple-500"
                        />
                        <span className="text-[12px] font-semibold text-slate-300">
                            {settings.enabled ? 'Points are on' : 'Points are off'}
                        </span>
                    </label>
                </div>

                {error && (
                    <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3 text-[12px] text-amber-300">
                        <AlertCircle size={14} className="mt-0.5 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {notice && (
                    <div className="mb-4 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-3 text-[12px] text-emerald-300">
                        {notice}
                    </div>
                )}

                {loading && (
                    <div className="flex items-center gap-2 py-6 text-[12px] text-slate-500">
                        <Loader2 size={14} className="animate-spin" /> Loading…
                    </div>
                )}

                <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                            Points per ₹100 spent
                        </label>
                        <input
                            type="number"
                            min={0}
                            value={settings.pointsPerHundred}
                            onChange={(e) =>
                                setSettings({ ...settings, pointsPerHundred: Number(e.target.value) })
                            }
                            className="w-full rounded-lg border border-white/[0.08] bg-[#0b1018] px-2.5 py-2 text-[13px] text-slate-200 focus:border-purple-500/50 focus:outline-none"
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                            Each point is worth ₹
                        </label>
                        <input
                            type="number"
                            min={0}
                            step="0.5"
                            value={settings.rupeesPerPoint}
                            onChange={(e) =>
                                setSettings({ ...settings, rupeesPerPoint: Number(e.target.value) })
                            }
                            className="w-full rounded-lg border border-white/[0.08] bg-[#0b1018] px-2.5 py-2 text-[13px] text-slate-200 focus:border-purple-500/50 focus:outline-none"
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                            Least points they can use at once
                        </label>
                        <input
                            type="number"
                            min={0}
                            value={settings.minRedeemPoints}
                            onChange={(e) =>
                                setSettings({ ...settings, minRedeemPoints: Number(e.target.value) })
                            }
                            className="w-full rounded-lg border border-white/[0.08] bg-[#0b1018] px-2.5 py-2 text-[13px] text-slate-200 focus:border-purple-500/50 focus:outline-none"
                        />
                    </div>
                </div>

                <p className="mt-3 text-[11px] text-slate-500">
                    With these settings, a ₹{exampleSpend} session earns {examplePoints} points, worth ₹
                    {Math.floor(examplePoints * settings.rupeesPerPoint)} off later.
                </p>

                <button
                    type="button"
                    onClick={saveSettings}
                    disabled={!cafeId || saving}
                    className="mt-4 flex items-center gap-1.5 rounded-lg bg-purple-500 px-3 py-2 text-[12px] font-bold text-white transition-colors hover:bg-purple-400 disabled:opacity-40"
                >
                    {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                    Save rules
                </button>
            </section>

            {/* Outstanding points are money the café owes in free play, so they
                sit at the top rather than being buried in the member list. */}
            <section className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
                    <p className="text-[11px] text-slate-500">Points not yet used</p>
                    <p className="mt-1 text-xl font-bold text-slate-200">
                        {outstandingPoints.toLocaleString('en-IN')}
                    </p>
                </div>
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
                    <p className="text-[11px] text-slate-500">What that costs you</p>
                    <p className="mt-1 text-xl font-bold text-amber-400">
                        ₹{outstandingRupees.toLocaleString('en-IN')}
                    </p>
                </div>
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
                    <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                        <TrendingUp size={11} /> Customers collecting
                    </p>
                    <p className="mt-1 text-xl font-bold text-slate-200">{memberCount}</p>
                </div>
            </section>

            <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5">
                <div className="mb-4 flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15">
                        <Gift size={15} className="text-emerald-400" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-slate-200">Use points at the counter</h3>
                        <p className="text-[11px] text-slate-500">
                            Take points off a customer&apos;s balance and give the discount
                        </p>
                    </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-4">
                    <input
                        value={redeemPhone}
                        onChange={(e) => setRedeemPhone(e.target.value)}
                        placeholder="Phone number"
                        className="rounded-lg border border-white/[0.08] bg-[#0b1018] px-2.5 py-2 text-[13px] text-slate-200 focus:border-emerald-500/50 focus:outline-none"
                    />
                    <input
                        type="number"
                        min={1}
                        value={redeemPoints}
                        onChange={(e) => setRedeemPoints(e.target.value)}
                        placeholder="How many points"
                        className="rounded-lg border border-white/[0.08] bg-[#0b1018] px-2.5 py-2 text-[13px] text-slate-200 focus:border-emerald-500/50 focus:outline-none"
                    />
                    <select
                        value={redeemMode}
                        onChange={(e) => setRedeemMode(e.target.value as 'redeemed' | 'bonus')}
                        className="rounded-lg border border-white/[0.08] bg-[#0b1018] px-2.5 py-2 text-[13px] text-slate-200 focus:border-emerald-500/50 focus:outline-none"
                    >
                        <option value="redeemed">Take points off</option>
                        <option value="bonus">Give bonus points</option>
                    </select>
                    <button
                        type="button"
                        onClick={submitPoints}
                        disabled={!cafeId || redeeming || !redeemPhone || !redeemPoints}
                        className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-[12px] font-bold text-black transition-colors hover:bg-emerald-400 disabled:opacity-40"
                    >
                        {redeeming ? <Loader2 size={13} className="animate-spin" /> : <Gift size={13} />}
                        Apply
                    </button>
                </div>

                {redeemMode === 'redeemed' && Number(redeemPoints) > 0 && (
                    <p className="mt-2 text-[11px] text-slate-500">
                        That is ₹{Math.floor(Number(redeemPoints) * settings.rupeesPerPoint)} off their bill.
                    </p>
                )}
            </section>

            <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-sm font-bold text-slate-200">Who has points</h3>
                    <div className="relative">
                        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search name or phone"
                            className="rounded-lg border border-white/[0.08] bg-[#0b1018] py-2 pl-8 pr-2.5 text-[12px] text-slate-200 focus:border-purple-500/50 focus:outline-none"
                        />
                    </div>
                </div>

                {!loading && visibleMembers.length === 0 && (
                    <p className="py-8 text-center text-[12px] text-slate-500">
                        {members.length === 0
                            ? 'Nobody has points yet. They start earning as soon as sessions are marked complete.'
                            : 'No customer matches that search.'}
                    </p>
                )}

                <div className="flex flex-col gap-2">
                    {visibleMembers.map((member) => (
                        <div
                            key={member.phone}
                            className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"
                        >
                            <div className="min-w-[150px] flex-1">
                                <p className="text-[13px] font-bold text-slate-200">
                                    {member.name || member.phone}
                                </p>
                                <p className="text-[11px] text-slate-500">
                                    {member.name ? `${member.phone} · ` : ''}last visit{' '}
                                    {formatDate(member.lastActivity)}
                                </p>
                            </div>

                            <span className="text-[11px] text-slate-500">
                                earned {member.earned} · used {member.redeemed}
                            </span>

                            <div className="text-right">
                                <p className="text-[15px] font-bold text-purple-300">{member.balance}</p>
                                <p className="text-[10px] text-slate-500">₹{member.worthRupees} off</p>
                            </div>

                            <button
                                type="button"
                                onClick={() => {
                                    setRedeemPhone(member.phone);
                                    setRedeemMode('redeemed');
                                    setRedeemPoints(String(member.balance));
                                }}
                                className="rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 transition-colors hover:text-white"
                            >
                                Use
                            </button>
                        </div>
                    ))}
                </div>
            </section>

            {recent.length > 0 && (
                <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5">
                    <h3 className="mb-4 text-sm font-bold text-slate-200">Recent activity</h3>
                    <div className="flex flex-col gap-1.5">
                        {recent.map((entry) => (
                            <div
                                key={entry.id}
                                className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
                                style={{ background: 'rgba(255,255,255,0.02)' }}
                            >
                                <span className="text-[12px] text-slate-300">{entry.phone}</span>
                                <span className="text-[11px] text-slate-500">
                                    {REASON_LABELS[entry.reason] || entry.reason} · {formatDate(entry.createdAt)}
                                </span>
                                <span
                                    className="text-[13px] font-bold"
                                    style={{ color: entry.points >= 0 ? '#4ade80' : '#f59e0b' }}
                                >
                                    {entry.points >= 0 ? '+' : ''}
                                    {entry.points}
                                </span>
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
