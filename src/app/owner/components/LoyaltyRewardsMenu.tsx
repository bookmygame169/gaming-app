'use client';

import { useCallback, useEffect, useState } from 'react';
import { Gift, Plus, Pencil, Loader2, X, EyeOff, Eye, Coffee, Clock, Percent } from 'lucide-react';
import { ownerApi } from '../ownerApi';

export type RewardKind = 'free_minutes' | 'free_item' | 'discount';

export type Reward = {
    id: string;
    name: string;
    description: string | null;
    pointsCost: number;
    kind: RewardKind;
    value: number;
    isActive: boolean;
    sortOrder: number;
};

interface LoyaltyRewardsMenuProps {
    cafeId?: string;
    /** Called after any change, so the tab's other sections can refresh. */
    onChanged?: () => void;
}

const KIND_META: Record<RewardKind, { label: string; unit: string; icon: React.ReactNode }> = {
    free_minutes: { label: 'Free play time', unit: 'minutes', icon: <Clock size={13} /> },
    free_item: { label: 'Free item', unit: '₹ it costs you', icon: <Coffee size={13} /> },
    discount: { label: 'Money off', unit: '₹ off the bill', icon: <Percent size={13} /> },
};

/**
 * Starting points, so an owner is not staring at an empty form wondering what a
 * reward is meant to look like. Deliberately cheap: a first reward nobody can
 * reach teaches customers the scheme is not worth tracking.
 */
const TEMPLATES: Array<{ name: string; kind: RewardKind; value: number; pointsCost: number }> = [
    { name: 'Free soft drink', kind: 'free_item', value: 20, pointsCost: 40 },
    { name: '30 minutes free', kind: 'free_minutes', value: 30, pointsCost: 100 },
    { name: '1 hour free', kind: 'free_minutes', value: 60, pointsCost: 180 },
    { name: '₹50 off', kind: 'discount', value: 50, pointsCost: 120 },
];

const emptyForm = {
    id: '',
    name: '',
    description: '',
    pointsCost: '',
    kind: 'free_item' as RewardKind,
    value: '',
};

/**
 * The café's reward menu.
 *
 * Points redeemed as "₹1 each" are just a discount with extra steps. What a
 * customer comes back for is a named thing — a cold drink, half an hour free —
 * so the café writes its own list and sets its own prices.
 */
export function LoyaltyRewardsMenu({ cafeId, onChanged }: LoyaltyRewardsMenuProps) {
    const [rewards, setRewards] = useState<Reward[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        if (!cafeId) return;

        setLoading(true);
        try {
            const res = await fetch(
                `/api/owner/loyalty/rewards?cafeId=${encodeURIComponent(cafeId)}`,
                { credentials: 'include' }
            );
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Could not load rewards');

            setRewards(Array.isArray(data.rewards) ? data.rewards : []);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not load rewards');
        } finally {
            setLoading(false);
        }
    }, [cafeId]);

    useEffect(() => {
        load();
    }, [load]);

    const save = async () => {
        if (!cafeId) return;

        if (!form.name.trim()) {
            setError('Give the reward a name.');
            return;
        }

        setSaving(true);
        try {
            await ownerApi('/api/owner/loyalty/rewards', {
                body: {
                    cafeId,
                    id: form.id || undefined,
                    name: form.name,
                    description: form.description,
                    pointsCost: Number(form.pointsCost),
                    kind: form.kind,
                    value: Number(form.value),
                },
                fallbackMessage: 'Could not save',
            });
            setShowForm(false);
            setForm(emptyForm);
            setError(null);
            load();
            onChanged?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save');
        } finally {
            setSaving(false);
        }
    };

    const setActive = async (reward: Reward, isActive: boolean) => {
        if (!cafeId) return;

        try {
            // Reactivating goes through the same save path; only retiring uses
            // DELETE, and even that just flips the flag.
            const res = isActive
                ? await fetch('/api/owner/loyalty/rewards', {
                      method: 'POST',
                      credentials: 'include',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                          cafeId,
                          id: reward.id,
                          name: reward.name,
                          description: reward.description,
                          pointsCost: reward.pointsCost,
                          kind: reward.kind,
                          value: reward.value,
                          isActive: true,
                      }),
                  })
                : await fetch('/api/owner/loyalty/rewards', {
                      method: 'DELETE',
                      credentials: 'include',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ cafeId, id: reward.id }),
                  });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || 'Could not save');
            }

            load();
            onChanged?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save');
        }
    };

    const openEdit = (reward: Reward) => {
        setForm({
            id: reward.id,
            name: reward.name,
            description: reward.description ?? '',
            pointsCost: String(reward.pointsCost),
            kind: reward.kind,
            value: String(reward.value),
        });
        setShowForm(true);
    };

    const applyTemplate = (template: (typeof TEMPLATES)[number]) => {
        setForm({
            id: '',
            name: template.name,
            description: '',
            pointsCost: String(template.pointsCost),
            kind: template.kind,
            value: String(template.value),
        });
        setShowForm(true);
    };

    return (
        <section className=" border border-[#f2f0ea]/10 bg-[#111113] p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center bg-[#ff5c2b]/15">
                        <Gift size={15} className="text-[#ff5c2b]" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-[#f2f0ea]">What points can buy</h3>
                        <p className="text-[11px] text-[#f2f0ea]/40">
                            A free drink brings people back. A number does not.
                        </p>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={() => {
                        setForm(emptyForm);
                        setShowForm(true);
                    }}
                    disabled={!cafeId}
                    className="flex items-center gap-1.5 bg-[#ff5c2b] px-3 py-2 text-[12px] font-bold text-black transition-colors hover:bg-[#ff5c2b] disabled:opacity-40"
                >
                    <Plus size={13} />
                    Add reward
                </button>
            </div>

            {error && (
                <div className="mb-4 border border-[#ff5c2b]/25 bg-[#ff5c2b]/[0.06] p-3 text-[12px] text-[#ff5c2b]">
                    {error}
                </div>
            )}

            {loading && (
                <div className="flex items-center gap-2 py-6 text-[12px] text-[#f2f0ea]/40">
                    <Loader2 size={14} className="animate-spin" /> Loading…
                </div>
            )}

            {!loading && rewards.length === 0 && (
                <div className="py-4">
                    <p className="mb-3 text-center text-[12px] text-[#f2f0ea]/40">
                        Nothing on the menu yet. Start with one of these:
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                        {TEMPLATES.map((template) => (
                            <button
                                key={template.name}
                                type="button"
                                onClick={() => applyTemplate(template)}
                                className=" border border-[#f2f0ea]/10 px-3 py-2 text-[12px] text-[#f2f0ea]/70 transition-colors hover:border-[#ff5c2b]/40 hover:text-[#f2f0ea]"
                            >
                                {template.name}
                                <span className="ml-1.5 text-[11px] text-[#f2f0ea]/40">
                                    {template.pointsCost} pts
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="flex flex-col gap-2">
                {rewards.map((reward) => (
                    <div
                        key={reward.id}
                        className="flex flex-wrap items-center gap-3 border border-[#f2f0ea]/[0.07] bg-[#111113] p-3"
                        style={{ opacity: reward.isActive ? 1 : 0.45 }}
                    >
                        <span className="flex h-7 w-7 items-center justify-center bg-white/[0.05] text-[#ff5c2b]">
                            {KIND_META[reward.kind].icon}
                        </span>

                        <div className="min-w-[140px] flex-1">
                            <p className="text-[13px] font-bold text-[#f2f0ea]">
                                {reward.name}
                                {!reward.isActive && (
                                    <span className="ml-2 text-[10px] font-bold uppercase text-[#f2f0ea]/40">
                                        off the menu
                                    </span>
                                )}
                            </p>
                            <p className="text-[11px] text-[#f2f0ea]/40">
                                {reward.description ||
                                    `${KIND_META[reward.kind].label} · ${reward.value} ${
                                        reward.kind === 'free_minutes' ? 'min' : '₹'
                                    }`}
                            </p>
                        </div>

                        <span className=" bg-[#ff5c2b]/12 px-2.5 py-1 text-[12px] font-bold text-[#ff5c2b]">
                            {reward.pointsCost} pts
                        </span>

                        <div className="flex gap-1">
                            <button
                                type="button"
                                onClick={() => openEdit(reward)}
                                className=" border border-[#f2f0ea]/10 p-1.5 text-[#f2f0ea]/50 transition-colors hover:text-[#f2f0ea]"
                            >
                                <Pencil size={13} />
                            </button>
                            <button
                                type="button"
                                onClick={() => setActive(reward, !reward.isActive)}
                                title={reward.isActive ? 'Take off the menu' : 'Put back on the menu'}
                                className=" border border-[#f2f0ea]/10 p-1.5 text-[#f2f0ea]/50 transition-colors hover:text-[#f2f0ea]"
                            >
                                {reward.isActive ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {showForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
                    <div className="w-full max-w-md border border-[#f2f0ea]/10 bg-[#0f1520] p-5">
                        <div className="mb-4 flex items-center justify-between">
                            <h4 className="text-sm font-bold text-[#f2f0ea]">
                                {form.id ? 'Edit reward' : 'New reward'}
                            </h4>
                            <button
                                type="button"
                                onClick={() => setShowForm(false)}
                                className="text-[#f2f0ea]/40 hover:text-[#f2f0ea]"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="grid gap-3">
                            <div>
                                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#f2f0ea]/40">
                                    What the customer sees
                                </label>
                                <input
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    placeholder="Free Coke"
                                    className="w-full border border-[#f2f0ea]/10 bg-transparent px-2.5 py-2 text-[13px] text-[#f2f0ea] focus:border-[#ff5c2b]/50 focus:outline-none"
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#f2f0ea]/40">
                                    Type
                                </label>
                                <select
                                    value={form.kind}
                                    onChange={(e) =>
                                        setForm({ ...form, kind: e.target.value as RewardKind })
                                    }
                                    className="w-full border border-[#f2f0ea]/10 bg-transparent px-2.5 py-2 text-[13px] text-[#f2f0ea] focus:border-[#ff5c2b]/50 focus:outline-none"
                                >
                                    {(Object.keys(KIND_META) as RewardKind[]).map((kind) => (
                                        <option key={kind} value={kind}>
                                            {KIND_META[kind].label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#f2f0ea]/40">
                                        {KIND_META[form.kind].unit}
                                    </label>
                                    <input
                                        type="number"
                                        min={0}
                                        value={form.value}
                                        onChange={(e) => setForm({ ...form, value: e.target.value })}
                                        className="w-full border border-[#f2f0ea]/10 bg-transparent px-2.5 py-2 text-[13px] text-[#f2f0ea] focus:border-[#ff5c2b]/50 focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#f2f0ea]/40">
                                        Points it costs
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        value={form.pointsCost}
                                        onChange={(e) =>
                                            setForm({ ...form, pointsCost: e.target.value })
                                        }
                                        className="w-full border border-[#f2f0ea]/10 bg-transparent px-2.5 py-2 text-[13px] text-[#f2f0ea] focus:border-[#ff5c2b]/50 focus:outline-none"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#f2f0ea]/40">
                                    Small print (optional)
                                </label>
                                <input
                                    value={form.description}
                                    onChange={(e) =>
                                        setForm({ ...form, description: e.target.value })
                                    }
                                    placeholder="One per visit"
                                    className="w-full border border-[#f2f0ea]/10 bg-transparent px-2.5 py-2 text-[13px] text-[#f2f0ea] focus:border-[#ff5c2b]/50 focus:outline-none"
                                />
                            </div>
                        </div>

                        <div className="mt-5 flex gap-2">
                            <button
                                type="button"
                                onClick={save}
                                disabled={saving}
                                className="flex items-center gap-1.5 bg-[#ff5c2b] px-4 py-2 text-[12px] font-bold text-black transition-colors hover:bg-[#ff5c2b] disabled:opacity-40"
                            >
                                {saving && <Loader2 size={12} className="animate-spin" />}
                                Save
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowForm(false)}
                                className=" border border-[#f2f0ea]/10 px-4 py-2 text-[12px] text-[#f2f0ea]/50 hover:text-[#f2f0ea]"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
