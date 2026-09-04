'use client';

import { useCallback, useEffect, useState } from 'react';
import { Chips, GhostButton, Panel, PrimaryButton, Tag } from './consoleUi';
import { ownerApi } from '../ownerApi';

type Review = {
    id: string;
    rating: number;
    comment: string | null;
    name: string;
    ownerReply: string | null;
    ownerRepliedAt: string | null;
    isHidden: boolean;
    createdAt: string;
};

type Summary = {
    average: number;
    count: number;
    distribution: [number, number, number, number, number];
};

interface OwnerReviewsProps {
    cafeId?: string;
}

const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * What customers said, and the owner's right of reply.
 *
 * An owner can reply to anything and hide abuse, but cannot touch a rating.
 * Being able to edit your own score would make every score on the platform
 * worthless, so the number is the one thing that is not theirs to change.
 */
export function OwnerReviews({ cafeId }: OwnerReviewsProps) {
    const [reviews, setReviews] = useState<Review[]>([]);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [needsReply, setNeedsReply] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [replyingTo, setReplyingTo] = useState<string | null>(null);
    const [replyText, setReplyText] = useState('');
    const [savingId, setSavingId] = useState<string | null>(null);
    const [filter, setFilter] = useState('all');

    const load = useCallback(async () => {
        if (!cafeId) return;

        setLoading(true);
        try {
            const res = await fetch(`/api/owner/reviews?cafeId=${encodeURIComponent(cafeId)}`, {
                credentials: 'include',
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Could not load reviews');

            setReviews(Array.isArray(data.reviews) ? data.reviews : []);
            setSummary(data.summary ?? null);
            setNeedsReply(Number(data.needsReply) || 0);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not load reviews');
        } finally {
            setLoading(false);
        }
    }, [cafeId]);

    useEffect(() => {
        load();
    }, [load]);

    const save = async (reviewId: string, changes: { reply?: string; isHidden?: boolean }) => {
        if (!cafeId) return;

        setSavingId(reviewId);
        try {
            await ownerApi('/api/owner/reviews', {
                method: 'PUT',
                body: { cafeId, reviewId, ...changes },
                fallbackMessage: 'Could not save',
            });
            setReplyingTo(null);
            setReplyText('');
            setError(null);
            load();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save');
        } finally {
            setSavingId(null);
        }
    };

    const total = summary?.count ?? 0;
    const average = summary?.average ?? 0;
    const distribution = summary?.distribution ?? [0, 0, 0, 0, 0];
    const peak = Math.max(...distribution, 1);

    const shown = reviews.filter((review) => {
        if (filter === 'unanswered') return !review.ownerReply && !review.isHidden;
        if (filter === 'low') return review.rating <= 3 && !review.isHidden;
        if (filter === 'hidden') return review.isHidden;
        return true;
    });

    const filters = [
        { id: 'all', label: 'ALL', count: reviews.length },
        { id: 'unanswered', label: 'NO REPLY', count: reviews.filter((r) => !r.ownerReply && !r.isHidden).length },
        { id: 'low', label: '3★ OR LESS', count: reviews.filter((r) => r.rating <= 3 && !r.isHidden).length },
        { id: 'hidden', label: 'HIDDEN', count: reviews.filter((r) => r.isHidden).length },
    ];

    // ── what people mention ──
    //
    // The design tags each review by topic; nothing here records tags, so this
    // counts words instead. A fixed vocabulary, matched against the comment
    // text, with the average rating of the reviews each word appears in — so a
    // topic that shows up in one-star reviews reads differently from one that
    // shows up in fives. It is a word count, not sentiment analysis, and the
    // heading says mention rather than anything stronger.
    const TOPICS: { label: string; words: string[] }[] = [
        { label: 'Staff', words: ['staff', 'service', 'owner', 'helpful', 'rude'] },
        { label: 'Price', words: ['price', 'cheap', 'expensive', 'costly', 'worth', 'rate'] },
        { label: 'Snacks', words: ['snack', 'food', 'maggi', 'coke', 'drink', 'coffee'] },
        { label: 'Setup', words: ['pc', 'ps5', 'xbox', 'setup', 'rig', 'console', 'screen', 'chair'] },
        { label: 'Lag', words: ['lag', 'slow', 'stutter', 'fps', 'internet', 'wifi', 'network'] },
        { label: 'Waiting', words: ['wait', 'queue', 'busy', 'late', 'delay'] },
        { label: 'Booking', words: ['book', 'booking', 'slot', 'refund', 'cancel'] },
        { label: 'Cleanliness', words: ['clean', 'dirty', 'hygiene', 'smell', 'ac'] },
    ];

    const mentions = TOPICS
        .map((topic) => {
            const hits = reviews.filter((r) => {
                const text = (r.comment || '').toLowerCase();
                return topic.words.some((w) => text.includes(w));
            });
            const avg = hits.length > 0
                ? hits.reduce((sum, r) => sum + r.rating, 0) / hits.length
                : 0;
            return { label: topic.label, count: hits.length, avg };
        })
        .filter((t) => t.count > 0)
        .sort((a, b) => b.count - a.count);
    const topMention = Math.max(1, ...mentions.map((m) => m.count));

    return (
        <div className="grid items-start gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
            {/* ── the score, and how it is made up ── */}
            <div className="flex flex-col gap-3.5 border border-[#f2f0ea]/[0.12] bg-[#111113] p-[18px]">
                <span className="font-mono text-[9.5px] tracking-[0.18em] text-[#f2f0ea]/[0.42]">OVERALL</span>

                <div className="flex items-end gap-3">
                    <span className="text-[52px] font-black leading-[0.82] tracking-[-0.03em] text-[#d8ff3c]">
                        {total > 0 ? average.toFixed(1) : '—'}
                    </span>
                    <div className="flex flex-col gap-1 pb-[5px]">
                        <span className="font-mono text-[13px] tracking-[0.1em] text-[#d8ff3c]">
                            {'★'.repeat(Math.round(average))}
                            <span className="text-[#f2f0ea]/20">{'★'.repeat(5 - Math.round(average))}</span>
                        </span>
                        <span className="font-mono text-[10.5px] text-[#f2f0ea]/[0.42]">
                            {total} review{total === 1 ? '' : 's'}
                        </span>
                    </div>
                </div>

                <div className="flex flex-col gap-[7px]">
                    {[5, 4, 3, 2, 1].map((star) => {
                        const n = distribution[star - 1] ?? 0;
                        return (
                            <div key={star} className="grid grid-cols-[26px_minmax(0,1fr)_40px] items-center gap-[9px]">
                                <span className="font-mono text-[10.5px] text-[#f2f0ea]/50">{star}★</span>
                                <div className="h-1.5 bg-[#f2f0ea]/[0.08]">
                                    <div
                                        className="h-1.5"
                                        style={{
                                            width: `${(n / peak) * 100}%`,
                                            background: star >= 4 ? '#d8ff3c' : star === 3 ? 'rgba(242,240,234,.4)' : '#ff5c2b',
                                        }}
                                    />
                                </div>
                                <span className="text-right font-mono text-[10.5px] text-[#f2f0ea]/50">{n}</span>
                            </div>
                        );
                    })}
                </div>

                <div className="flex flex-col gap-px border border-[#f2f0ea]/10 bg-[#f2f0ea]/10">
                    {[
                        { k: 'WAITING ON YOU', v: String(needsReply), c: needsReply > 0 ? '#ff5c2b' : 'rgba(242,240,234,.6)' },
                        { k: 'REPLIED', v: String(reviews.filter((r) => r.ownerReply).length), c: 'rgba(242,240,234,.6)' },
                        { k: 'HIDDEN', v: String(reviews.filter((r) => r.isHidden).length), c: 'rgba(242,240,234,.6)' },
                    ].map((stat) => (
                        <div key={stat.k} className="flex items-center gap-2.5 bg-[#0e0e10] px-[13px] py-[11px]">
                            <span className="font-mono text-[10px] tracking-[0.14em] text-[#f2f0ea]/[0.42]">
                                {stat.k}
                            </span>
                            <span className="flex-1" />
                            <span className="whitespace-nowrap font-mono text-xs" style={{ color: stat.c }}>
                                {stat.v}
                            </span>
                        </div>
                    ))}
                </div>

                {mentions.length > 0 && (
                    <div className="flex flex-col gap-2.5">
                        <span className="font-mono text-[9.5px] tracking-[0.18em] text-[#f2f0ea]/[0.42]">
                            WHAT PEOPLE MENTION
                        </span>
                        <div className="flex flex-col gap-[7px]">
                            {mentions.map((topic) => {
                                // Coloured by the average rating of the reviews it
                                // turns up in, so a common word and a common
                                // complaint do not look the same.
                                const tone = topic.avg >= 4 ? '#d8ff3c' : topic.avg >= 3 ? 'rgba(242,240,234,.5)' : '#ff5c2b';
                                return (
                                    <div
                                        key={topic.label}
                                        className="grid items-center gap-[9px]"
                                        style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,110px) 104px' }}
                                    >
                                        <span className="truncate font-mono text-[10.5px] text-[#f2f0ea]/60">
                                            {topic.label}
                                        </span>
                                        <div className="h-1.5 bg-[#f2f0ea]/[0.08]">
                                            <div
                                                className="h-1.5"
                                                style={{ width: `${(topic.count / topMention) * 100}%`, background: tone }}
                                            />
                                        </div>
                                        <span className="whitespace-nowrap text-right font-mono text-[10.5px]" style={{ color: tone }}>
                                            {topic.count} · {topic.avg.toFixed(1)}★
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                        <span className="font-mono text-[10px] leading-[1.5] text-[#f2f0ea]/30">
                            Counted from the words in review text, with the average rating each appears in.
                        </span>
                    </div>
                )}
            </div>

            {/* ── what people wrote ── */}
            <div className="flex min-w-0 flex-col gap-3.5">
                <div className="flex flex-wrap items-center gap-[9px]">
                    <Chips items={filters} active={filter} onPick={setFilter} />
                    <span className="h-px min-w-[20px] flex-1 bg-[#f2f0ea]/10" />
                    {loading && (
                        <span className="font-mono text-[10.5px] tracking-[0.12em] text-[#f2f0ea]/40">
                            LOADING…
                        </span>
                    )}
                </div>

                {error && (
                    <div className="border border-[#ff5c2b]/[0.28] bg-[#ff5c2b]/[0.06] px-[15px] py-3 font-mono text-[10.5px] tracking-[0.1em] text-[#ff5c2b]">
                        {error}
                    </div>
                )}

                {!loading && shown.length === 0 && (
                    <Panel className="px-4 py-8">
                        <span className="font-mono text-[11.5px] text-[#f2f0ea]/45">
                            {reviews.length === 0
                                ? 'No reviews yet. They appear here as customers leave them.'
                                : 'Nothing under this filter.'}
                        </span>
                    </Panel>
                )}

                {shown.map((review) => {
                    const isReplying = replyingTo === review.id;
                    const edge = review.isHidden
                        ? 'rgba(242,240,234,.2)'
                        : review.rating <= 3
                            ? '#ff5c2b'
                            : review.ownerReply
                                ? 'rgba(216,255,60,.45)'
                                : '#d8ff3c';

                    return (
                        <div
                            key={review.id}
                            className="flex flex-col gap-[11px] border border-[#f2f0ea]/10 bg-[#111113] px-4 py-[15px]"
                            style={{ borderLeft: `2px solid ${edge}` }}
                        >
                            <div className="flex flex-wrap items-center gap-2.5">
                                <span
                                    className="whitespace-nowrap font-mono text-[12.5px] tracking-[0.1em]"
                                    style={{ color: review.rating >= 4 ? '#d8ff3c' : '#ff5c2b' }}
                                >
                                    {'★'.repeat(review.rating)}
                                    <span className="text-[#f2f0ea]/20">{'★'.repeat(5 - review.rating)}</span>
                                </span>
                                <span className="whitespace-nowrap text-[13.5px] font-bold text-[#f2f0ea]">
                                    {review.name}
                                </span>
                                {review.isHidden && <Tag>HIDDEN</Tag>}
                                {!review.ownerReply && !review.isHidden && <Tag tone="orange">NO REPLY</Tag>}
                                <span className="min-w-[10px] flex-1" />
                                <span className="whitespace-nowrap font-mono text-[10.5px] text-[#f2f0ea]/35">
                                    {formatDate(review.createdAt).toUpperCase()}
                                </span>
                            </div>

                            {review.comment && (
                                <span className="text-[13.5px] leading-[1.5] text-[#f2f0ea]/80">
                                    {review.comment}
                                </span>
                            )}

                            {review.ownerReply && !isReplying && (
                                <div
                                    className="flex gap-2.5 bg-[#0e0e10] px-[13px] py-[11px]"
                                    style={{ borderLeft: '2px solid rgba(216,255,60,.45)' }}
                                >
                                    <span className="whitespace-nowrap font-mono text-[9.5px] tracking-[0.14em] text-[#d8ff3c]">
                                        YOU
                                    </span>
                                    <span className="font-mono text-[11px] leading-[1.5] text-[#f2f0ea]/55">
                                        {review.ownerReply}
                                    </span>
                                </div>
                            )}

                            {isReplying ? (
                                <div className="flex flex-col gap-2.5">
                                    <textarea
                                        value={replyText}
                                        onChange={(e) => setReplyText(e.target.value)}
                                        rows={3}
                                        placeholder="Answer them the way you would at the counter."
                                        className="w-full border border-[#f2f0ea]/[0.14] bg-transparent px-3 py-2.5 font-mono text-[11.5px] leading-[1.6] text-[#f2f0ea] outline-none transition-colors placeholder:text-[#f2f0ea]/30 focus:border-[#d8ff3c]"
                                    />
                                    <div className="flex flex-wrap gap-2">
                                        <PrimaryButton
                                            disabled={savingId === review.id || !replyText.trim()}
                                            onClick={() => save(review.id, { reply: replyText.trim() })}
                                        >
                                            {savingId === review.id ? 'SENDING…' : 'POST REPLY'}
                                        </PrimaryButton>
                                        <GhostButton onClick={() => { setReplyingTo(null); setReplyText(''); }}>
                                            CANCEL
                                        </GhostButton>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="min-w-[10px] flex-1" />
                                    <button
                                        type="button"
                                        onClick={() => { setReplyingTo(review.id); setReplyText(review.ownerReply ?? ''); }}
                                        className="border px-3 py-2 font-mono text-[10px] tracking-[0.12em] transition-colors hover:border-[#d8ff3c]"
                                        style={
                                            review.ownerReply
                                                ? { borderColor: 'rgba(242,240,234,.16)', color: 'rgba(242,240,234,.5)' }
                                                : { borderColor: '#d8ff3c', background: 'rgba(216,255,60,.10)', color: '#d8ff3c' }
                                        }
                                    >
                                        {review.ownerReply ? 'EDIT REPLY' : 'REPLY'}
                                    </button>
                                    <button
                                        type="button"
                                        disabled={savingId === review.id}
                                        onClick={() => save(review.id, { isHidden: !review.isHidden })}
                                        className="border border-[#f2f0ea]/[0.14] px-3 py-2 font-mono text-[10px] tracking-[0.12em] text-[#f2f0ea]/50 transition-colors hover:border-[#f2f0ea] hover:text-[#f2f0ea] disabled:opacity-40"
                                    >
                                        {review.isHidden ? 'SHOW' : 'HIDE'}
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* The rating is the one thing on this page that is not the
                    owner's to change, so it says so where they might look for
                    the control. */}
                <span className="font-mono text-[10px] leading-[1.7] tracking-[0.1em] text-[#f2f0ea]/30">
                    YOU CAN REPLY TO ANYTHING AND HIDE ABUSE. THE SCORE ITSELF IS THE CUSTOMER&apos;S.
                </span>
            </div>
        </div>
    );
}
