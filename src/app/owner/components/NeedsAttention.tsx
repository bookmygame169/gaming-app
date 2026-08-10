'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    IndianRupee,
    Star,
    Sparkles,
    Trophy,
    ChevronRight,
    ShieldAlert,
} from 'lucide-react';
import type { NavTab } from '../types';

export type OwnerSummary = {
    loyalty: {
        available: boolean;
        enabled: boolean;
        outstandingPoints: number;
        outstandingRupees: number;
        members: number;
    };
    reviews: {
        available: boolean;
        average: number;
        count: number;
        needsReply: number;
        latestUnanswered: string | null;
    };
    payments: {
        available: boolean;
        upiConfigured: boolean;
        waiting: number;
        waitingAmount: number;
    };
    tournaments: {
        available: boolean;
        upcoming: number;
        nextName: string | null;
        nextDate: string | null;
    };
};

/**
 * Fetches the cross-feature summary. Shared so the sidebar badges and the
 * dashboard cards cannot disagree about how many payments are waiting.
 */
export function useOwnerSummary(cafeId?: string, refreshKey = 0) {
    const [summary, setSummary] = useState<OwnerSummary | null>(null);

    const load = useCallback(async () => {
        if (!cafeId) return;

        try {
            const res = await fetch(`/api/owner/summary?cafeId=${encodeURIComponent(cafeId)}`, {
                credentials: 'include',
            });
            if (!res.ok) return;
            setSummary(await res.json());
        } catch {
            // The dashboard is useful without this; a failure shows no cards
            // rather than an error the owner cannot act on.
        }
    }, [cafeId]);

    useEffect(() => {
        load();
    }, [load, refreshKey]);

    return summary;
}

interface NeedsAttentionProps {
    summary: OwnerSummary | null;
    onNavigate: (tab: NavTab) => void;
}

const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/**
 * The one place on the dashboard that reaches into the other tabs.
 *
 * Loyalty, reviews, payments and tournaments were each built as their own tab,
 * which meant an owner only discovered a customer waiting on a reply — or a
 * payment waiting to be checked — by happening to click through. Money and
 * unanswered customers are exactly what should not wait on curiosity, so the
 * things that need a decision surface here and link straight to where the
 * decision gets made.
 *
 * Cards appear only when there is something to do. A quiet café sees nothing,
 * which is the point: a row of zeroes trains people to ignore the section.
 */
export function NeedsAttention({ summary, onNavigate }: NeedsAttentionProps) {
    if (!summary) return null;

    const cards: Array<{
        key: string;
        tab: NavTab;
        icon: React.ReactNode;
        tone: { border: string; bg: string; fg: string };
        title: string;
        detail: string;
    }> = [];

    const amber = { border: 'rgba(245,158,11,0.28)', bg: 'rgba(245,158,11,0.06)', fg: '#fbbf24' };
    const cyan = { border: 'rgba(34,211,238,0.28)', bg: 'rgba(34,211,238,0.06)', fg: '#22d3ee' };
    const violet = { border: 'rgba(168,85,247,0.28)', bg: 'rgba(168,85,247,0.06)', fg: '#c084fc' };

    // Money first. Somebody is waiting to play.
    if (summary.payments.waiting > 0) {
        cards.push({
            key: 'payments',
            tab: 'payments',
            icon: <IndianRupee size={15} />,
            tone: amber,
            title: `${summary.payments.waiting} payment${summary.payments.waiting > 1 ? 's' : ''} to check`,
            detail: `₹${summary.payments.waitingAmount.toLocaleString('en-IN')} claimed · confirming unlocks their session`,
        });
    }

    if (summary.reviews.needsReply > 0) {
        cards.push({
            key: 'reviews',
            tab: 'reviews',
            icon: <Star size={15} />,
            tone: cyan,
            title: `${summary.reviews.needsReply} review${summary.reviews.needsReply > 1 ? 's' : ''} with no reply`,
            detail: summary.reviews.latestUnanswered
                ? `"${summary.reviews.latestUnanswered}"`
                : 'A reply is what other customers read',
        });
    }

    // Only worth saying when they have taken the trouble to set up a UPI id and
    // then left online payment unusable.
    if (summary.payments.available && !summary.payments.upiConfigured) {
        cards.push({
            key: 'upi',
            tab: 'payments',
            icon: <ShieldAlert size={15} />,
            tone: amber,
            title: 'No UPI id set',
            detail: 'Customers cannot pay online — they are told to pay at the counter',
        });
    }

    if (summary.tournaments.upcoming > 0 && summary.tournaments.nextName) {
        cards.push({
            key: 'tournaments',
            tab: 'tournaments',
            icon: <Trophy size={15} />,
            tone: violet,
            title: summary.tournaments.nextName,
            detail: summary.tournaments.nextDate
                ? `Next event · ${formatDate(summary.tournaments.nextDate)}`
                : 'Upcoming event',
        });
    }

    if (cards.length === 0) return null;

    return (
        <section>
            <h2
                className="mb-3 text-sm text-slate-500"
                style={{ fontVariant: 'all-small-caps', letterSpacing: '0.12em', fontWeight: 600 }}
            >
                Needs your attention
            </h2>

            <div className="grid gap-2 sm:grid-cols-2">
                {cards.map((card) => (
                    <button
                        key={card.key}
                        type="button"
                        onClick={() => onNavigate(card.tab)}
                        className="flex items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-all duration-200 hover:-translate-y-0.5"
                        style={{ border: `1px solid ${card.tone.border}`, background: card.tone.bg }}
                    >
                        <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                            style={{ background: 'rgba(255,255,255,0.06)', color: card.tone.fg }}
                        >
                            {card.icon}
                        </span>

                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-bold text-slate-100">
                                {card.title}
                            </span>
                            <span className="block truncate text-[11px] text-slate-400">
                                {card.detail}
                            </span>
                        </span>

                        <ChevronRight size={14} className="shrink-0 text-slate-500" />
                    </button>
                ))}
            </div>
        </section>
    );
}

interface FeatureStatsProps {
    summary: OwnerSummary | null;
    onNavigate: (tab: NavTab) => void;
}

/**
 * The standing numbers from the other tabs — rating, points owed, upcoming
 * events. Unlike the cards above these are not to-dos, so they show even at
 * zero once the feature is in use.
 */
export function FeatureStats({ summary, onNavigate }: FeatureStatsProps) {
    if (!summary) return null;

    const tiles: Array<{ key: string; tab: NavTab; label: string; value: string; hint: string; icon: React.ReactNode; color: string }> = [];

    if (summary.reviews.available && summary.reviews.count > 0) {
        tiles.push({
            key: 'rating',
            tab: 'reviews',
            label: 'Rating',
            value: summary.reviews.average.toFixed(1),
            hint: `${summary.reviews.count} review${summary.reviews.count > 1 ? 's' : ''}`,
            icon: <Star size={14} />,
            color: '#f59e0b',
        });
    }

    if (summary.loyalty.available && summary.loyalty.enabled) {
        tiles.push({
            key: 'loyalty',
            tab: 'loyalty',
            label: 'Points owed',
            // Rupees, not points: the liability is what matters to an owner.
            value: `₹${summary.loyalty.outstandingRupees.toLocaleString('en-IN')}`,
            hint: `${summary.loyalty.members} collecting`,
            icon: <Sparkles size={14} />,
            color: '#a855f7',
        });
    }

    if (summary.tournaments.available && summary.tournaments.upcoming > 0) {
        tiles.push({
            key: 'tournaments',
            tab: 'tournaments',
            label: 'Events',
            value: String(summary.tournaments.upcoming),
            hint: 'upcoming',
            icon: <Trophy size={14} />,
            color: '#22d3ee',
        });
    }

    if (tiles.length === 0) return null;

    return (
        <div className="grid gap-2 sm:grid-cols-3">
            {tiles.map((tile) => (
                <button
                    key={tile.key}
                    type="button"
                    onClick={() => onNavigate(tile.tab)}
                    className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3.5 py-3 text-left transition-colors hover:border-white/[0.16]"
                >
                    <span
                        className="flex h-8 w-8 items-center justify-center rounded-lg"
                        style={{ background: 'rgba(255,255,255,0.05)', color: tile.color }}
                    >
                        {tile.icon}
                    </span>
                    <span className="min-w-0">
                        <span className="block text-[10px] uppercase tracking-wide text-slate-500">
                            {tile.label}
                        </span>
                        <span className="text-[15px] font-bold text-slate-100">{tile.value}</span>
                        <span className="ml-1.5 text-[11px] text-slate-500">{tile.hint}</span>
                    </span>
                </button>
            ))}
        </div>
    );
}
