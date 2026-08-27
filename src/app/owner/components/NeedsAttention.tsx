'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
    IndianRupee,
    Star,
    Trophy,
    ShieldAlert,
    MonitorPlay,
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
    playRequests: {
        available: boolean;
        waiting: number;
        waitingAmount: number;
        oldestWaitingAt: string | null;
    };
};

/**
 * Fetches the cross-feature summary. Shared so the sidebar badges and the
 * dashboard cards cannot disagree about how many payments are waiting.
 */
/**
 * How often the counts refresh.
 *
 * They used to load once and never again, which was survivable when everything
 * they counted was hours old. It stopped being survivable when a customer
 * started paying by UPI at a locked PC: they are stood there until the payment
 * is confirmed, and a badge that only appears on a manual refresh means nobody
 * ever learns they are waiting.
 */
const SUMMARY_POLL_MS = 20000;

/**
 * A short chime, generated rather than fetched.
 *
 * No audio file to ship, cache or 404. Browsers refuse to play anything before
 * the page has been interacted with, which is why this fails quietly - by the
 * time an owner has a customer waiting they have long since clicked something,
 * and on the off chance they have not, the badge is still there.
 */
function playChime() {
    try {
        type WindowWithAudio = Window & { webkitAudioContext?: typeof AudioContext };
        const Ctor = window.AudioContext || (window as WindowWithAudio).webkitAudioContext;
        if (!Ctor) return;

        const context = new Ctor();
        const oscillator = context.createOscillator();
        const gain = context.createGain();

        oscillator.connect(gain);
        gain.connect(context.destination);

        // Two notes rather than a beep. A single tone reads as an error; a rising
        // pair reads as "something arrived", which is what this is.
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(660, context.currentTime);
        oscillator.frequency.setValueAtTime(880, context.currentTime + 0.12);

        gain.gain.setValueAtTime(0.0001, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.2, context.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.32);

        oscillator.start();
        oscillator.stop(context.currentTime + 0.34);
        oscillator.onended = () => context.close();
    } catch {
        // Audio is a courtesy. Never let it break the dashboard.
    }
}

export function useOwnerSummary(cafeId?: string, refreshKey = 0) {
    const [summary, setSummary] = useState<OwnerSummary | null>(null);

    // What the count was last time, so a chime marks an arrival rather than
    // sounding on every poll while one sits unattended.
    const lastWaitingRef = useRef<number | null>(null);

    const load = useCallback(async () => {
        if (!cafeId) return;

        try {
            const res = await fetch(`/api/owner/summary?cafeId=${encodeURIComponent(cafeId)}`, {
                credentials: 'include',
            });
            if (!res.ok) return;

            const next = (await res.json()) as OwnerSummary;

            // Both queues, counted together. A lock-screen request is the more
            // urgent of the two - that customer is in the room, sat at a
            // machine - and a chime that only tracked payment claims would stay
            // silent for the one person who cannot do anything until it rings.
            const waiting = (next?.payments?.waiting ?? 0) + (next?.playRequests?.waiting ?? 0);
            const previous = lastWaitingRef.current;

            // Not on the first load. Opening the dashboard to a payment that has
            // been waiting since yesterday should not sound like it just landed.
            if (previous !== null && waiting > previous) {
                playChime();
            }

            lastWaitingRef.current = waiting;
            setSummary(next);
        } catch {
            // The dashboard is useful without this; a failure shows no cards
            // rather than an error the owner cannot act on.
        }
    }, [cafeId]);

    useEffect(() => {
        // load() sets state only after `await fetch(...)`, so nothing here runs
        // synchronously. The rule cannot see past the async boundary, so it
        // flags the call itself.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
    }, [load, refreshKey]);

    useEffect(() => {
        if (!cafeId) return;

        const timer = setInterval(load, SUMMARY_POLL_MS);
        return () => clearInterval(timer);
    }, [cafeId, load]);

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
        /** The word on the right — what pressing this row gets you. */
        cta: string;
    }> = [];

    const amber = { border: '#ff5c2b', bg: '#111113', fg: '#ff5c2b' };
    const cyan = { border: '#d8ff3c', bg: '#111113', fg: '#d8ff3c' };
    const violet = { border: 'rgba(242,240,234,.4)', bg: '#111113', fg: 'rgba(242,240,234,.6)' };
    const rose = { border: '#ff5c2b', bg: '#111113', fg: '#ff5c2b' };

    // Ahead of everything, including payment claims. Both are people waiting to
    // play, but this one is sitting at the machine right now: they filled the
    // form in on the locked screen and it will say "waiting" until this is
    // answered.
    if (summary.playRequests?.waiting > 0) {
        const waiting = summary.playRequests.waiting;

        cards.push({
            key: 'play-requests',
            tab: 'stations',
            icon: <MonitorPlay size={15} />,
            tone: rose,
            title: `${waiting} ${waiting > 1 ? 'people are' : 'person is'} waiting at a PC`,
            detail: `₹${summary.playRequests.waitingAmount.toLocaleString('en-IN')} · approving unlocks the machine and starts their time`,
            cta: 'APPROVE',
        });
    }

    // Money first. Somebody is waiting to play.
    if (summary.payments.waiting > 0) {
        cards.push({
            key: 'payments',
            tab: 'payments',
            icon: <IndianRupee size={15} />,
            tone: amber,
            title: `${summary.payments.waiting} payment${summary.payments.waiting > 1 ? 's' : ''} to check`,
            detail: `₹${summary.payments.waitingAmount.toLocaleString('en-IN')} claimed · confirming unlocks their session`,
            cta: 'CONFIRM',
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
            cta: 'REPLY',
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
            cta: 'SET UP',
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
            cta: 'OPEN',
        });
    }

    if (cards.length === 0) return null;

    return (
        <section>
            <div className="mb-3 flex items-center gap-3">
                <span className="font-mono text-[10px] tracking-[0.2em] text-[#f2f0ea]/50">
                    NEEDS ATTENTION
                </span>
                <span className="h-px flex-1 bg-[#f2f0ea]/10" />
            </div>

            <div className="flex flex-col gap-2">
                {cards.map((card) => (
                    <button
                        key={card.key}
                        type="button"
                        onClick={() => onNavigate(card.tab)}
                        className="flex items-start gap-[11px] bg-[#111113] px-[13px] py-3 text-left transition-colors hover:bg-[#17171a]"
                        style={{ borderLeft: `2px solid ${card.tone.border}` }}
                    >
                        <span className="flex min-w-0 flex-col gap-1">
                            <span className="text-[13px] font-bold tracking-[-0.005em] text-[#f2f0ea]">
                                {card.title}
                            </span>
                            <span className="font-mono text-[10.5px] leading-[1.6] text-[#f2f0ea]/45">
                                {card.detail}
                            </span>
                        </span>

                        <span className="flex-1" />

                        <span
                            className="whitespace-nowrap font-mono text-[10px] tracking-[0.12em]"
                            style={{ color: card.tone.fg }}
                        >
                            {card.cta}
                        </span>
                    </button>
                ))}
            </div>
        </section>
    );
}
