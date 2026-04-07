'use client';

import { useState, useCallback } from 'react';
import { Trash2, RotateCcw, AlertTriangle, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { Card } from './ui';

type DeletedBooking = {
  id: string;
  cafe_name: string;
  cafe_id: string;
  booking_date: string;
  start_time: string;
  duration: number;
  total_amount: number;
  status: string;
  customer_name: string | null;
  user_name: string | null;
  user_phone: string | null;
  deleted_at: string;
  deleted_remark: string | null;
  booking_items?: { id: string; console: string; quantity: number; price: number }[];
};

const formatCurrency = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const formatDate = (d: string) =>
  new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const formatDateTime = (d: string) =>
  new Date(d).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

export function DeletedBookingsPanel() {
  const [open, setOpen] = useState(false);
  const [bookings, setBookings] = useState<DeletedBooking[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const fetchDeleted = useCallback(async (offset = 0) => {
    if (offset === 0) { setLoading(true); setError(null); } else { setLoadingMore(true); }
    try {
      const res = await fetch(`/api/owner/deleted-bookings?offset=${offset}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      if (offset === 0) {
        setBookings(data.deletedBookings || []);
      } else {
        setBookings(prev => [...prev, ...(data.deletedBookings || [])]);
      }
      setHasMore(data.hasMore ?? false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next && bookings.length === 0) fetchDeleted();
  };

  const restore = async (bookingId: string) => {
    setActionId(bookingId);
    try {
      const res = await fetch('/api/owner/deleted-bookings', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBookings(prev => prev.filter(b => b.id !== bookingId));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      alert(`Failed to restore: ${message}`);
    } finally {
      setActionId(null);
    }
  };

  return (
    <>
      <div className="mt-6">
        {/* Toggle header */}
        <button
          onClick={handleToggle}
          className="w-full flex items-center justify-between px-5 py-3.5 rounded-xl bg-slate-800/60 border border-slate-700/50 hover:bg-slate-800 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
              <Trash2 size={16} className="text-red-400" />
            </div>
            <div className="text-left">
              <div className="text-sm font-semibold text-slate-200">Deleted Bookings</div>
              <div className="text-xs text-slate-500">Bookings removed by you — restore anytime from here</div>
            </div>
            {bookings.length > 0 && (
              <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/15 text-red-400">
                {bookings.length}
              </span>
            )}
          </div>
          {open ? (
            <ChevronUp size={18} className="text-slate-400 group-hover:text-white transition-colors" />
          ) : (
            <ChevronDown size={18} className="text-slate-400 group-hover:text-white transition-colors" />
          )}
        </button>

        {/* Panel content */}
        {open && (
          <div className="mt-3">
            <Card padding="none">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <AlertTriangle size={14} className="text-amber-400" />
                  <span>Deleted bookings stay hidden from the main list until you restore or permanently remove them.</span>
                </div>
                <button
                  onClick={() => fetchDeleted()}
                  disabled={loading}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Loading...' : 'Refresh'}
                </button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12 gap-3 text-slate-400">
                  <Loader2 size={20} className="animate-spin" />
                  <span className="text-sm">Loading deleted bookings...</span>
                </div>
              ) : error ? (
                <div className="py-8 text-center text-red-400 text-sm">{error}</div>
              ) : bookings.length === 0 ? (
                <div className="py-12 text-center">
                  <Trash2 size={32} className="text-slate-700 mx-auto mb-3" />
                  <p className="text-slate-500 text-sm">No deleted bookings</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-800">
                  {bookings.map((b) => {
                    const isProcessing = actionId === b.id;
                    const customerLabel = b.user_name || b.customer_name || 'Walk-in';
                    return (
                      <div
                        key={b.id}
                        className="flex items-start justify-between gap-4 px-5 py-4 hover:bg-slate-800/30 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="font-medium text-sm text-slate-200">{customerLabel}</span>
                            {b.user_phone && (
                              <span className="text-xs text-slate-400">{b.user_phone}</span>
                            )}
                            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-400">
                              {b.cafe_name}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              b.status === 'completed' ? 'bg-emerald-500/15 text-emerald-400' :
                              b.status === 'confirmed' ? 'bg-blue-500/15 text-blue-400' :
                              b.status === 'cancelled' ? 'bg-red-500/15 text-red-400' :
                              'bg-slate-700 text-slate-400'
                            }`}>
                              {b.status}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 mb-1.5">
                            <span>{formatDate(b.booking_date)} · {b.start_time} · {b.duration} min</span>
                            <span className="text-emerald-400 font-semibold">{formatCurrency(b.total_amount)}</span>
                            <span className="text-slate-600">ID: #{b.id.slice(0, 8).toUpperCase()}</span>
                          </div>
                          <div className="text-xs text-red-400/70 mb-1.5">
                            Deleted {formatDateTime(b.deleted_at)}
                          </div>
                          {b.booking_items && b.booking_items.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-1.5">
                              {b.booking_items.map((item) => (
                                <span
                                  key={item.id}
                                  className="text-[11px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 border border-slate-700"
                                >
                                  {item.console} ×{item.quantity} · {formatCurrency(item.price)}
                                </span>
                              ))}
                            </div>
                          )}
                          {b.deleted_remark && (
                            <div className="flex items-start gap-1.5 text-xs text-amber-400/80 bg-amber-500/5 border border-amber-500/15 rounded-lg px-3 py-2">
                              <AlertTriangle size={11} className="mt-0.5 shrink-0 text-amber-400" />
                              <span><span className="font-medium text-amber-400">Remark:</span> {b.deleted_remark}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => restore(b.id)}
                            disabled={isProcessing}
                            title="Restore booking"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                          >
                            {isProcessing ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <RotateCcw size={13} />
                            )}
                            Restore
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {hasMore && (
                    <div className="py-4 text-center border-t border-slate-800">
                      <button
                        onClick={() => fetchDeleted(bookings.length)}
                        disabled={loadingMore}
                        className="flex items-center gap-2 mx-auto px-4 py-2 rounded-lg text-xs font-medium bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-300 transition-colors disabled:opacity-50"
                      >
                        {loadingMore ? <Loader2 size={13} className="animate-spin" /> : null}
                        Load more
                      </button>
                    </div>
                  )}
                </div>
              )}
            </Card>
          </div>
        )}
      </div>

    </>
  );
}
