'use client';

import { useCallback, useEffect, useState } from 'react';
import { Star, Loader2, AlertCircle, MessageSquare, Eye, EyeOff, Send } from 'lucide-react';

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

function Stars({ rating }: { rating: number }) {
    return (
        <span className="inline-flex gap-0.5">
            {[1, 2, 3, 4, 5].map((n) => (
                <Star
                    key={n}
                    size={12}
                    fill={n <= Math.round(rating) ? '#f59e0b' : 'none'}
                    className={n <= Math.round(rating) ? 'text-amber-500' : 'text-slate-600'}
                />
            ))}
        </span>
    );
}

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
            const res = await fetch('/api/owner/reviews', {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cafeId, reviewId, ...changes }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Could not save');

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

    return (
        <div className="flex flex-col gap-4">
            <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5">
                <div className="mb-5 flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15">
                        <Star size={15} className="text-amber-400" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-slate-200">Reviews</h3>
                        <p className="text-[11px] text-slate-500">
                            What customers say after they play
                        </p>
                    </div>
                </div>

                {error && (
                    <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3 text-[12px] text-amber-300">
                        <AlertCircle size={14} className="mt-0.5 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {loading && (
                    <div className="flex items-center gap-2 py-6 text-[12px] text-slate-500">
                        <Loader2 size={14} className="animate-spin" /> Loading…
                    </div>
                )}

                {!loading && total === 0 && !error && (
                    <p className="py-8 text-center text-[12px] text-slate-500">
                        No reviews yet. Customers are asked to rate a session once it is marked
                        complete.
                    </p>
                )}

                {total > 0 && (
                    <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-center">
                            <p className="text-3xl font-bold text-slate-100">
                                {summary!.average.toFixed(1)}
                            </p>
                            <div className="mt-1.5">
                                <Stars rating={summary!.average} />
                            </div>
                            <p className="mt-1 text-[11px] text-slate-500">
                                {total} {total === 1 ? 'review' : 'reviews'}
                            </p>
                        </div>

                        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 sm:col-span-2">
                            {[5, 4, 3, 2, 1].map((star) => {
                                const count = summary!.distribution[star - 1];
                                const pct = total > 0 ? (count / total) * 100 : 0;

                                return (
                                    <div key={star} className="mb-1 flex items-center gap-2 last:mb-0">
                                        <span className="w-3 text-[11px] text-slate-500">{star}</span>
                                        <Star size={9} fill="#f59e0b" className="text-amber-500" />
                                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                                            <div
                                                className="h-full rounded-full bg-amber-500"
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                        <span className="w-6 text-right text-[11px] text-slate-500">
                                            {count}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Replying is the highest-value thing an owner can do here, so
                    the count of unanswered reviews is called out rather than
                    left to be counted down the list. */}
                {needsReply > 0 && (
                    <p className="mt-3 text-[12px] text-amber-300">
                        {needsReply} {needsReply === 1 ? 'review has' : 'reviews have'} no reply yet.
                        Answering one — especially a bad one — is what other customers read.
                    </p>
                )}
            </section>

            <div className="flex flex-col gap-2">
                {reviews.map((review) => (
                    <div
                        key={review.id}
                        className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
                        style={{ opacity: review.isHidden ? 0.5 : 1 }}
                    >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                                <Stars rating={review.rating} />
                                <span className="text-[13px] font-bold text-slate-200">{review.name}</span>
                                {review.isHidden && (
                                    <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold uppercase text-slate-400">
                                        Hidden
                                    </span>
                                )}
                            </div>
                            <span className="text-[11px] text-slate-500">
                                {formatDate(review.createdAt)}
                            </span>
                        </div>

                        {review.comment && (
                            <p className="mt-2.5 text-[13px] leading-relaxed text-slate-300">
                                {review.comment}
                            </p>
                        )}

                        {review.ownerReply && replyingTo !== review.id && (
                            <div className="mt-3 border-l-2 border-cyan-500/50 pl-3">
                                <p className="text-[11px] font-bold text-cyan-400">Your reply</p>
                                <p className="mt-0.5 text-[12px] leading-relaxed text-slate-400">
                                    {review.ownerReply}
                                </p>
                            </div>
                        )}

                        {replyingTo === review.id ? (
                            <div className="mt-3">
                                <textarea
                                    value={replyText}
                                    onChange={(e) => setReplyText(e.target.value)}
                                    maxLength={1000}
                                    rows={3}
                                    placeholder="Reply publicly…"
                                    className="w-full rounded-lg border border-white/[0.08] bg-[#0b1018] px-2.5 py-2 text-[13px] text-slate-200 focus:border-cyan-500/50 focus:outline-none"
                                />
                                <div className="mt-2 flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => save(review.id, { reply: replyText })}
                                        disabled={savingId === review.id}
                                        className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-1.5 text-[12px] font-bold text-black transition-colors hover:bg-cyan-400 disabled:opacity-40"
                                    >
                                        {savingId === review.id ? (
                                            <Loader2 size={12} className="animate-spin" />
                                        ) : (
                                            <Send size={12} />
                                        )}
                                        Post reply
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setReplyingTo(null);
                                            setReplyText('');
                                        }}
                                        className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-[12px] text-slate-400 hover:text-white"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="mt-3 flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setReplyingTo(review.id);
                                        setReplyText(review.ownerReply || '');
                                    }}
                                    className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 transition-colors hover:text-white"
                                >
                                    <MessageSquare size={11} />
                                    {review.ownerReply ? 'Edit reply' : 'Reply'}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => save(review.id, { isHidden: !review.isHidden })}
                                    disabled={savingId === review.id}
                                    className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[11px] font-semibold text-slate-400 transition-colors hover:text-white disabled:opacity-40"
                                >
                                    {review.isHidden ? <Eye size={11} /> : <EyeOff size={11} />}
                                    {review.isHidden ? 'Show again' : 'Hide'}
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
