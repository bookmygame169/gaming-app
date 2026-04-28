'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { CONSOLE_LABELS } from '@/lib/constants';
import { getInitialOwnerBookingStatus } from '@/lib/bookingFilters';
import { dedupeStationPricingRows, formatStationOptionLabel, normaliseStationName } from '@/lib/stationNames';
import { Card, Button } from './ui';
import {
    User, Smartphone, Clock, Plus, Trash2, X,
    CreditCard, Banknote, CheckCircle, Star,
    Store, CalendarDays, IndianRupee, Gamepad2
} from 'lucide-react';
import { CafeRow } from '@/types/database';

import { getLocalDateString, normaliseConsoleType, buildWhatsAppUrl, buildBookingTicketMessage } from '../utils';
import { calcBillingPrice, type ConsolePricingMap } from '../utils/pricing';

interface MembershipPlan {
    id: string;
    name: string;
    price: number;
    hours: number | null;
    validity_days: number;
    plan_type: string;
    console_type: string;
    player_count: string;
}

interface BillingProps {
    cafeId: string;
    cafes: CafeRow[];
    isMobile?: boolean;
    onSuccess?: () => void;
    onMembershipSuccess?: () => void;
    onSnackOnlySale?: () => void;
    pricingData?: ConsolePricingMap[string];
    stationPricingList?: StationPricingRecord[];
    membershipPlans?: MembershipPlan[];
}

type BillingItem = {
    id: string;
    console: string;
    quantity: number;
    duration: number;
    price: number;
    station?: string;
};

type CustomerSuggestion = {
    name: string;
    phone: string;
    visits?: number;
    total_spent?: number;
    last_visit?: string;
};

type StationPricingRecord = {
    cafe_id?: string | null;
    station_name?: string | null;
    station_type?: string | null;
    station_number?: number | null;
    is_active?: boolean | null;
    created_at?: string | null;
    updated_at?: string | null;
};

const DURATION_OPTIONS = [30, 60, 90, 120, 180];
const PLAYER_OPTIONS = [1, 2, 3, 4];

const CONSOLE_THEME: Record<string, { accent: string; short: string }> = {
    ps5: { accent: '#06b6d4', short: 'PS5' },
    ps4: { accent: '#3b82f6', short: 'PS4' },
    xbox: { accent: '#10b981', short: 'XB' },
    pc: { accent: '#8b5cf6', short: 'PC' },
    pool: { accent: '#f59e0b', short: 'PL' },
    snooker: { accent: '#22c55e', short: 'SN' },
    arcade: { accent: '#ef4444', short: 'AR' },
    vr: { accent: '#a855f7', short: 'VR' },
    steering: { accent: '#f97316', short: 'SW' },
    racing_sim: { accent: '#fb7185', short: 'RS' },
};

const SECTION_CARD_CLASS = 'border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] shadow-[0_24px_64px_-36px_rgba(0,0,0,0.9)]';
const SUBPANEL_CLASS = 'rounded-2xl border border-white/[0.08] bg-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]';
const HOVER_CARD_CLASS = 'transition-all duration-200 hover:-translate-y-0.5 hover:border-white/[0.16]';
const CONTROL_SURFACE_CLASS = 'rounded-[24px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]';
const GAMING_SUMMARY_HERO_CLASS = 'rounded-[28px] border border-white/[0.08] bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.16),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] shadow-[0_28px_60px_-36px_rgba(0,0,0,0.95)]';
const MEMBERSHIP_SUMMARY_HERO_CLASS = 'rounded-[28px] border border-white/[0.08] bg-[radial-gradient(circle_at_top_right,rgba(168,85,247,0.16),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] shadow-[0_28px_60px_-36px_rgba(0,0,0,0.95)]';
const CONTROL_LABEL_CLASS = 'mb-2 text-[10px] smallcaps text-[var(--dim)]';

function getConsoleTheme(consoleType: string) {
    return CONSOLE_THEME[consoleType] || { accent: '#06b6d4', short: consoleType.slice(0, 2).toUpperCase() };
}

function normalizePhone(phone: string | null | undefined) {
    return (phone || '').replace(/\D/g, '').slice(-10);
}

function formatLastVisit(value?: string) {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function formatDurationLabel(duration: number) {
    if (duration < 60) return `${duration}m`;
    if (duration === 60) return '1h';
    if (duration === 90) return '1.5h';
    if (duration === 120) return '2h';
    if (duration === 180) return '3h';
    return `${duration}m`;
}

export function Billing({
    cafeId,
    cafes,
    isMobile = false,
    onSuccess,
    onMembershipSuccess,
    onSnackOnlySale,
    pricingData,
    stationPricingList,
    membershipPlans = [],
}: BillingProps) {
    // Mode: 'gaming' | 'membership'
    const [mode, setMode] = useState<'gaming' | 'membership'>('gaming');

    // Membership cart state
    type MemItem = { id: string; planId: string; quantity: number };
    const [memItems, setMemItems] = useState<MemItem[]>([]);
    const [memManualAmount, setMemManualAmount] = useState<number | null>(null);
    const [memPaymentMode, setMemPaymentMode] = useState<'cash' | 'upi'>('cash');
    const [memSubmitting, setMemSubmitting] = useState(false);
    const [qrExpanded, setQrExpanded] = useState(false);

    // Shared customer state
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [bookingDate, setBookingDate] = useState(getLocalDateString());
    const [startTime, setStartTime] = useState('');
    const [items, setItems] = useState<BillingItem[]>([]);
    const [paymentMode, setPaymentMode] = useState<'cash' | 'upi'>('cash');
    const [manualAmount, setManualAmount] = useState<number | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    // After a successful gaming booking, store details to show a WhatsApp send option
    type LastBooking = {
        name: string; phone: string; date: string; time: string;
        duration: number; itemsLabel: string; amount: number;
        paymentMode: string; cafeName: string;
    };
    const [lastBooking, setLastBooking] = useState<LastBooking | null>(null);
    const [autoResetSecs, setAutoResetSecs] = useState<number | null>(null);

    // Recent customers for quick-pick
    const [recentCustomers, setRecentCustomers] = useState<CustomerSuggestion[]>([]);

    // Data State — seeded from props, avoids direct Supabase calls on ISP-blocked networks
    const [pricing, setPricing] = useState<ConsolePricingMap[string] | null>(pricingData || null);
    const [stationPricingData, setStationPricingData] = useState<StationPricingRecord[]>(stationPricingList || []);
    const [availableConsoles, setAvailableConsoles] = useState<string[]>([]);

    // Autocomplete State
    const [suggestions, setSuggestions] = useState<CustomerSuggestion[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestionField, setSuggestionField] = useState<'name' | 'phone' | null>(null);
    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const normalizedStationPricing = useMemo(
        () => dedupeStationPricingRows((stationPricingData || []) as StationPricingRecord[]),
        [stationPricingData]
    );

    // Station options per console type (e.g. ps5 → ['ps5-01','ps5-02'])
    const stationOptions = useCallback((consoleType: string): string[] => {
        const normalizedConsoleType = normaliseConsoleType(consoleType);
        const configuredStations = normalizedStationPricing
            .filter((station: StationPricingRecord) => {
                if (!station.station_name) return false;
                if (station.cafe_id && station.cafe_id !== cafeId) return false;
                if (station.is_active === false) return false;

                const normalizedStationType = normaliseConsoleType(
                    station.station_type || station.station_name.split('-')[0] || ''
                );

                return normalizedStationType === normalizedConsoleType;
            })
            .sort((a: StationPricingRecord, b: StationPricingRecord) => {
                const aNumber = a.station_number ?? Number.MAX_SAFE_INTEGER;
                const bNumber = b.station_number ?? Number.MAX_SAFE_INTEGER;
                if (aNumber !== bNumber) return aNumber - bNumber;
                return (a.station_name || '').localeCompare(b.station_name || '');
            })
            .map((station: StationPricingRecord) => normaliseStationName(station.station_name, station.station_type, station.station_number))
            .filter(Boolean);

        if (configuredStations.length > 0) {
            return Array.from(new Set(configuredStations));
        }

        const currentCafe = cafes.find(c => c.id === cafeId) || cafes[0];
        if (!currentCafe) return [];
        const countMap: Record<string, number> = {
            ps5: currentCafe.ps5_count || 0, ps4: currentCafe.ps4_count || 0,
            xbox: currentCafe.xbox_count || 0, pc: currentCafe.pc_count || 0,
            pool: currentCafe.pool_count || 0, snooker: currentCafe.snooker_count || 0,
            arcade: currentCafe.arcade_count || 0, vr: currentCafe.vr_count || 0,
            steering: currentCafe.steering_wheel_count || 0,
            racing_sim: currentCafe.racing_sim_count || 0,
        };
        const count = countMap[normalizedConsoleType] || 0;
        return Array.from({ length: count }, (_, i) => `${normalizedConsoleType}-${String(i + 1).padStart(2, '0')}`);
    }, [cafeId, cafes, normalizedStationPricing]);

    // Initialize time and available consoles
    useEffect(() => {
        const updateTime = () => {
            const now = new Date();
            setStartTime(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`);
        };
        updateTime();

        // Find current cafe
        const currentCafe = cafes.find(c => c.id === cafeId) || cafes[0];
        if (currentCafe) {
            const consoleTypes = [
                { id: 'ps5', count: currentCafe.ps5_count },
                { id: 'ps4', count: currentCafe.ps4_count },
                { id: 'xbox', count: currentCafe.xbox_count },
                { id: 'pc', count: currentCafe.pc_count },
                { id: 'pool', count: currentCafe.pool_count },
                { id: 'snooker', count: currentCafe.snooker_count },
                { id: 'arcade', count: currentCafe.arcade_count },
                { id: 'vr', count: currentCafe.vr_count },
                { id: 'steering', count: currentCafe.steering_wheel_count },
                { id: 'racing_sim', count: currentCafe.racing_sim_count },
            ];

            setAvailableConsoles(
                consoleTypes.filter(c => (c.count ?? 0) > 0).map(c => c.id)
            );
        }
    }, [cafeId, cafes]);

    // Sync pricing from props when they change (e.g. cafe switch)
    useEffect(() => {
        setPricing(pricingData || null);
    }, [pricingData]);

    useEffect(() => {
        setStationPricingData(stationPricingList || []);
    }, [stationPricingList]);

    const stationPricingMap = useMemo(
        () => Object.fromEntries(normalizedStationPricing.map((station) => [station.station_name, station])),
        [normalizedStationPricing]
    );

    const consolePricingMap = useMemo(
        () => ({ [cafeId]: pricing || {} }),
        [cafeId, pricing]
    );

    const getEffectiveStationName = useCallback((consoleType: string, stationName?: string) => {
        if (stationName) return normaliseStationName(stationName);
        return stationOptions(consoleType)[0];
    }, [stationOptions]);

    const canPickSingleStation = (consoleType: string, quantity: number) => {
        const normalizedConsoleType = normaliseConsoleType(consoleType);
        return quantity <= 1 || ['ps5', 'ps4', 'xbox'].includes(normalizedConsoleType);
    };

    const calculatePrice = useCallback((type: string, qty: number, duration: number, stationName?: string) =>
        calcBillingPrice(type, qty, duration, cafeId, consolePricingMap, stationPricingMap, {
            stationName: getEffectiveStationName(type, stationName),
        }), [cafeId, consolePricingMap, getEffectiveStationName, stationPricingMap]);

    useEffect(() => {
        setItems(prevItems => prevItems.map(item => {
            const nextPrice = calculatePrice(item.console, item.quantity, item.duration, item.station);

            return nextPrice === item.price ? item : { ...item, price: nextPrice };
        }));
    }, [calculatePrice]);

    const createItem = (consoleType: string) => {
        const defaultStation = stationOptions(consoleType)[0];
        return {
            id: Math.random().toString(36).substr(2, 9),
            console: consoleType,
            quantity: 1,
            duration: 60,
            price: calculatePrice(consoleType, 1, 60, defaultStation),
            station: defaultStation,
        } satisfies BillingItem;
    };

    // Clear pending autocomplete timeout on unmount
    useEffect(() => {
        return () => {
            if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        };
    }, []);

    // Auto-reset countdown after successful booking
    useEffect(() => {
        if (!lastBooking) { setAutoResetSecs(null); return; }
        setAutoResetSecs(8);
        const interval = setInterval(() => {
            setAutoResetSecs(s => {
                if (s === null || s <= 1) {
                    clearInterval(interval);
                    setLastBooking(null);
                    onSuccess?.();
                    return null;
                }
                return s - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lastBooking]);

    // Fetch recent customers for quick-pick
    useEffect(() => {
        if (!cafeId) return;
        fetch(`/api/owner/coupons/customers?cafeId=${cafeId}`)
            .then(r => r.json())
            .then(data => {
                if (Array.isArray(data))
                    setRecentCustomers(data.sort((a, b) => (b.visits || 0) - (a.visits || 0)).slice(0, 5));
            })
            .catch(() => {});
    }, [cafeId]);

    // Customer Autocomplete — debounced server-side search (no load-all)
    const searchCustomers = (query: string, field: 'name' | 'phone') => {
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        if (query.length < 2) { setSuggestions([]); setShowSuggestions(false); setSuggestionField(null); return; }
        setSuggestionField(field);
        searchTimeoutRef.current = setTimeout(async () => {
            if (!cafeId) return;
            try {
                const res = await fetch(`/api/owner/coupons/customers?cafeId=${cafeId}&search=${encodeURIComponent(query)}`);
                if (!res.ok) return;
                const data = await res.json();
                if (Array.isArray(data)) { setSuggestions(data.slice(0, 5)); setShowSuggestions(data.length > 0); }
            } catch {}
        }, 300);
    };

    // Item Management
    const addItem = () => {
        if (availableConsoles.length === 0) return;
        setItems([...items, createItem(availableConsoles[0])]);
    };

    const updateItem = (id: string, field: keyof BillingItem, value: string | number | undefined) => {
        setItems(items.map(item => {
            if (item.id === id) {
                const nextValue = field === 'station'
                    ? (value ? normaliseStationName(String(value)) : undefined)
                    : value;
                const updated = { ...item, [field]: nextValue };

                if (field === 'console' && updated.station && !stationOptions(String(value)).includes(updated.station)) {
                    updated.station = undefined;
                }

                if (field === 'console' && canPickSingleStation(String(value), updated.quantity) && !updated.station) {
                    updated.station = stationOptions(String(value))[0];
                }

                if (
                    ['console', 'quantity'].includes(field) &&
                    updated.station &&
                    !canPickSingleStation(updated.console, updated.quantity)
                ) {
                    updated.station = undefined;
                }

                if (field === 'quantity' && canPickSingleStation(updated.console, updated.quantity) && !updated.station) {
                    updated.station = stationOptions(updated.console)[0];
                }

                if (['console', 'quantity', 'duration', 'station'].includes(field)) {
                    updated.price = calculatePrice(updated.console, updated.quantity, updated.duration, updated.station);
                }
                return updated;
            }
            return item;
        }));
    };

    const removeItem = (id: string) => {
        setItems(items.filter(i => i.id !== id));
    };

    const calculatedTotal = items.reduce((sum, i) => sum + i.price, 0);
    const totalAmount = manualAmount !== null ? manualAmount : calculatedTotal;

    // Reset manual amount when items change (recalculate)
    const resetManualAmount = () => setManualAmount(null);

    const matchedCustomer = useMemo(() => {
        const phone = normalizePhone(customerPhone);
        if (!phone) return null;
        return recentCustomers.find((customer) => normalizePhone(customer.phone) === phone) || null;
    }, [customerPhone, recentCustomers]);

    const applyCustomer = (customer: CustomerSuggestion) => {
        setCustomerName(customer.name);
        setCustomerPhone(customer.phone);
        setShowSuggestions(false);
        setSuggestionField(null);
    };

    const modeIntro = mode === 'gaming'
        ? {
            eyebrow: 'Counter Billing',
            title: 'Quick walk-in booking',
            description: 'Build the session, collect payment, and confirm the booking from one counter screen.',
        }
        : {
            eyebrow: 'Membership Checkout',
            title: 'Fast plan billing',
            description: 'Pick the customer, choose the plan, and complete membership checkout without leaving the tab.',
        };

    const handleSubmit = async () => {
        if (!customerName || !startTime || items.length === 0) {
            setFormError('Please fill all required fields and add at least one console.');
            return;
        }
        setFormError(null);

        setSubmitting(true);
        try {
            const timeParts = startTime.split(':').map(Number);
            const hours = Number.isFinite(timeParts[0]) ? timeParts[0] : 0;
            const mins = Number.isFinite(timeParts[1]) ? timeParts[1] : 0;
            const period = hours >= 12 ? 'pm' : 'am';
            const displayHours = hours % 12 || 12;
            const startTime12h = `${displayHours}:${mins.toString().padStart(2, "0")} ${period}`;
            const bookingDuration = items.reduce((max, item) => Math.max(max, item.duration || 60), 0) || 60;

            const res = await fetch('/api/owner/billing', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    booking: {
                        cafe_id: cafeId,
                        customer_name: customerName,
                        customer_phone: customerPhone || null,
                        booking_date: bookingDate,
                        start_time: startTime12h,
                        duration: bookingDuration,
                        total_amount: totalAmount,
                        status: getInitialOwnerBookingStatus(bookingDate, startTime12h),
                        source: 'walk-in',
                        payment_mode: paymentMode,
                    },
                    items: items.map(it => ({
                        ...it,
                        title: it.station ? `${it.duration}|${it.station}` : String(it.duration),
                    })),
                }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Failed to create booking');

            const cafeName = cafes.find(c => c.id === cafeId)?.name || '';
            const itemsLabel = items.map(it => `${it.quantity}x ${it.console.toUpperCase()}`).join(', ');
            setLastBooking({ name: customerName, phone: customerPhone, date: bookingDate, time: startTime12h, duration: bookingDuration, itemsLabel, amount: totalAmount, paymentMode, cafeName });
            setCustomerName('');
            setCustomerPhone('');
            setItems([]);
            setManualAmount(null);
            setPaymentMode('cash');
            setBookingDate(getLocalDateString());
            const now = new Date();
            setStartTime(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`);
            // Don't call onSuccess here — wait for user to click "New Booking"
            // so the success card stays visible for WhatsApp sending

        } catch (error: unknown) {
            console.error('Booking failed:', error);
            const message = error instanceof Error ? error.message : 'Please try again.';
            setFormError(`Failed to create booking: ${message}`);
        } finally {
            setSubmitting(false);
        }
    };

    // Membership cart helpers
    const addMemItem = () => {
        if (membershipPlans.length === 0) return;
        setMemItems(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), planId: membershipPlans[0].id, quantity: 1 }]);
    };
    const updateMemItem = (id: string, field: 'planId' | 'quantity', value: string | number) => {
        setMemItems(prev => prev.map(mi => mi.id === id ? { ...mi, [field]: value } : mi));
    };
    const removeMemItem = (id: string) => setMemItems(prev => prev.filter(mi => mi.id !== id));

    const memCalculatedTotal = memItems.reduce((sum, mi) => {
        const plan = membershipPlans.find(p => p.id === mi.planId);
        return sum + (plan ? plan.price * mi.quantity : 0);
    }, 0);
    const memTotalAmount = memManualAmount !== null ? memManualAmount : memCalculatedTotal;

    const handleMemSubmit = async () => {
        if (!customerName.trim()) { setFormError('Customer name is required'); return; }
        if (!customerPhone.trim()) { setFormError('Phone number is required'); return; }
        if (!/^\+?\d[\d\s\-()]{7,14}$/.test(customerPhone.trim())) { setFormError('Invalid phone number format'); return; }
        if (memItems.length === 0) { setFormError('Please add at least one membership plan'); return; }
        setFormError(null);

        setMemSubmitting(true);
        try {
            const res = await fetch('/api/owner/membership-checkout', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cafe_id: cafeId,
                    customer_name: customerName.trim(),
                    customer_phone: customerPhone.trim(),
                    items: memItems.map((item) => ({
                        planId: item.planId,
                        quantity: item.quantity,
                    })),
                    final_amount: memTotalAmount,
                    payment_mode: memPaymentMode,
                }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Failed to add membership');

            setCustomerName('');
            setCustomerPhone('');
            setMemItems([]);
            setMemManualAmount(null);
            setMemPaymentMode('cash');
            if (onMembershipSuccess) onMembershipSuccess();
            else if (onSuccess) onSuccess();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Please try again.';
            setFormError(`Failed to add membership: ${message}`);
        } finally {
            setMemSubmitting(false);
        }
    };

    const closeSuggestions = () => {
        setShowSuggestions(false);
        setSuggestionField(null);
    };

    const renderSuggestions = (field: 'name' | 'phone') => {
        if (!(showSuggestions && suggestionField === field && suggestions.length > 0)) return null;

        return (
            <div className="glass absolute left-0 top-full z-[200] mt-2 max-h-56 w-full overflow-y-auto rounded-2xl">
                {suggestions.map((suggestion, idx) => (
                    <button
                        key={`${suggestion.phone}-${idx}`}
                        type="button"
                        onMouseDown={(event) => {
                            event.preventDefault();
                            applyCustomer(suggestion);
                        }}
                        className="flex w-full items-center gap-3 border-b border-white/[0.06] px-4 py-3 text-left transition last:border-b-0 hover:bg-white/[0.04]"
                    >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-cyan-500/12 text-xs font-bold text-cyan-300">
                            {suggestion.name.charAt(0).toUpperCase()}
                        </span>
                        <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-white">{suggestion.name}</span>
                            <span className="mono block text-[11px] text-[var(--muted)]">{suggestion.phone}</span>
                        </span>
                    </button>
                ))}
            </div>
        );
    };

    const customerInfoCard = (
        <Card className={`overflow-visible space-y-5 ${SECTION_CARD_CLASS}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/12 text-cyan-300">
                        <User size={18} />
                    </div>
                    <div>
                        <div className="text-[10px] smallcaps text-[var(--dim)]">Customer</div>
                        <h3 className="text-base font-semibold text-white">Walk-in details</h3>
                    </div>
                </div>

                {matchedCustomer && (
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="chip border-transparent bg-cyan-500/12 text-cyan-200">Returning guest</span>
                        {typeof matchedCustomer.visits === 'number' && (
                            <span className="chip border-transparent bg-white/[0.06] text-slate-300">
                                {matchedCustomer.visits} visit{matchedCustomer.visits === 1 ? '' : 's'}
                            </span>
                        )}
                        {matchedCustomer.last_visit && (
                            <span className="chip border-transparent bg-white/[0.06] text-slate-300">
                                Last {formatLastVisit(matchedCustomer.last_visit)}
                            </span>
                        )}
                    </div>
                )}
            </div>

            <div className="grid gap-4 md:grid-cols-2 items-start">
                <div>
                    <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--dim)]">
                        Name
                    </label>
                    <div className="relative glass-2 focus-ring rounded-xl border border-white/[0.07] px-3.5 py-2.5 transition">
                        <div className="flex items-center gap-2">
                            <User size={16} className="text-slate-500" />
                            <input
                                value={customerName}
                                onChange={(event) => {
                                    setCustomerName(event.target.value);
                                    searchCustomers(event.target.value, 'name');
                                }}
                                onBlur={() => setTimeout(closeSuggestions, 150)}
                                placeholder="Walk-in customer"
                                maxLength={100}
                                className="w-full bg-transparent text-sm text-white placeholder:text-[#4b5060] focus:outline-none"
                            />
                        </div>
                        {renderSuggestions('name')}
                    </div>
                </div>

                <div>
                    <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--dim)]">
                        {mode === 'membership' ? 'Phone Required' : 'Phone'}
                    </label>
                    <div className="relative glass-2 focus-ring rounded-xl border border-white/[0.07] px-3.5 py-2.5 transition">
                        <div className="flex items-center gap-2">
                            <Smartphone size={16} className="text-slate-500" />
                            <input
                                value={customerPhone}
                                onChange={(event) => {
                                    setCustomerPhone(event.target.value);
                                    searchCustomers(event.target.value, 'phone');
                                }}
                                onBlur={() => setTimeout(closeSuggestions, 150)}
                                placeholder="98765 43210"
                                maxLength={15}
                                className="mono w-full bg-transparent text-sm text-white placeholder:text-[#4b5060] focus:outline-none"
                            />
                        </div>
                        {renderSuggestions('phone')}
                    </div>
                </div>
            </div>

        </Card>
    );

    return (
        <div className={`space-y-6 ${isMobile && mode === 'gaming' && !lastBooking && items.length > 0 ? 'pb-24' : isMobile ? 'pb-20' : ''}`}>
            <div className="rounded-[28px] border border-white/[0.08] bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.06),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] px-4 py-4 shadow-[0_28px_56px_-40px_rgba(0,0,0,0.95)] sm:px-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-1">
                        <div className="text-[10px] smallcaps text-[var(--dim)]">{modeIntro.eyebrow}</div>
                        <h2 className="text-xl font-semibold tracking-tight text-white sm:text-[1.4rem]">{modeIntro.title}</h2>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {onSnackOnlySale && mode === 'gaming' && (
                            <button
                                type="button"
                                onClick={onSnackOnlySale}
                                className="glass-2 rounded-xl border border-orange-400/15 px-3.5 py-2.5 text-sm font-medium text-orange-300 transition-all duration-200 hover:-translate-y-0.5 hover:border-orange-400/30 hover:bg-orange-500/10"
                            >
                                Snack-only sale
                            </button>
                        )}
                        <div className="glass-2 inline-flex rounded-2xl border border-white/[0.08] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                            <button
                                type="button"
                                onClick={() => setMode('gaming')}
                                className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${mode === 'gaming' ? 'bg-cyan-500/15 text-white shadow-[0_0_24px_-10px_rgba(34,211,238,0.75)]' : 'text-slate-400 hover:text-white'}`}
                            >
                                Gaming
                            </button>
                            <button
                                type="button"
                                onClick={() => setMode('membership')}
                                className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${mode === 'membership' ? 'bg-violet-500/15 text-white shadow-[0_0_24px_-10px_rgba(168,85,247,0.75)]' : 'text-slate-400 hover:text-white'}`}
                            >
                                Membership
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {mode === 'gaming' && lastBooking ? (
                <div className="mx-auto max-w-xl space-y-4">
                    <div className="glass rounded-2xl border border-emerald-500/20 px-5 py-4">
                        <div className="flex items-center gap-4">
                            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300">
                                <CheckCircle size={20} />
                            </div>
                            <div>
                                <p className="text-lg font-semibold text-white">Booking confirmed</p>
                                <p className="text-sm text-emerald-300/80">{lastBooking.name}</p>
                            </div>
                        </div>
                    </div>

                    <Card className="overflow-hidden p-0">
                        {([
                            lastBooking.cafeName ? { icon: <Store size={13} className="text-slate-500" />, label: 'Cafe', value: lastBooking.cafeName, highlight: false } : null,
                            { icon: <CalendarDays size={13} className="text-slate-500" />, label: 'Date', value: lastBooking.date, highlight: false },
                            { icon: <Clock size={13} className="text-slate-500" />, label: 'Time', value: `${lastBooking.time} (${lastBooking.duration} min)`, highlight: false },
                            { icon: <Gamepad2 size={13} className="text-slate-500" />, label: 'Session', value: lastBooking.itemsLabel, highlight: false },
                            { icon: <IndianRupee size={13} className="text-emerald-400" />, label: 'Amount', value: `Rs.${lastBooking.amount} · ${lastBooking.paymentMode}`, highlight: true },
                        ] as const).filter(Boolean).map((row, index, rows) => (
                            <div key={index} className={`flex items-center justify-between px-4 py-3 ${index < rows.length - 1 ? 'border-b border-white/[0.06]' : ''}`}>
                                <span className="flex items-center gap-2 text-sm text-slate-500">{row!.icon}{row!.label}</span>
                                <span className={`text-sm font-medium ${row!.highlight ? 'text-emerald-300' : 'text-white'}`}>{row!.value}</span>
                            </div>
                        ))}
                    </Card>

                    {autoResetSecs !== null && (
                        <div className="glass-2 flex items-center justify-between rounded-xl px-3 py-2">
                            <span className="text-xs text-slate-500">Auto-reset in</span>
                            <div className="flex items-center gap-2">
                                <span className="mono text-sm font-bold text-white">{autoResetSecs}s</span>
                                <div className="h-1 w-24 overflow-hidden rounded-full bg-white/[0.08]">
                                    <div className="h-full rounded-full bg-cyan-400 transition-all duration-1000" style={{ width: `${(autoResetSecs / 8) * 100}%` }} />
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        {lastBooking.phone ? (
                            <a
                                href={buildWhatsAppUrl(lastBooking.phone, buildBookingTicketMessage({ customerName: lastBooking.name, cafeName: lastBooking.cafeName, date: lastBooking.date, startTime: lastBooking.time, duration: lastBooking.duration, itemsLabel: lastBooking.itemsLabel, totalAmount: lastBooking.amount, paymentMode: lastBooking.paymentMode }))}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#20b558]"
                            >
                                Send on WhatsApp
                            </a>
                        ) : (
                            <div className="glass-2 flex items-center justify-center rounded-xl px-4 py-3 text-sm text-slate-500">
                                No phone number
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={() => {
                                setLastBooking(null);
                                onSuccess?.();
                            }}
                            className="glass-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition hover:border-white/15"
                        >
                            New booking
                        </button>
                    </div>
                </div>
            ) : mode === 'gaming' ? (
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_410px] xl:items-start">
                    <div className="space-y-5">
                        {customerInfoCard}

                        <Card className={`space-y-6 ${SECTION_CARD_CLASS}`}>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/12 text-violet-300">
                                        <Gamepad2 size={18} />
                                    </div>
                                    <div>
                                        <div className="text-[10px] smallcaps text-[var(--dim)]">Session Builder</div>
                                        <h3 className="text-base font-semibold text-white">Select stations</h3>
                                    </div>
                                </div>
                                {items.length > 0 && (
                                    <Button size="sm" variant="secondary" onClick={addItem} className="shadow-[0_10px_30px_-18px_rgba(255,255,255,0.25)]">
                                        <Plus size={14} /> Add Station
                                    </Button>
                                )}
                            </div>

                            {items.length === 0 ? (
                                <div className={`${CONTROL_SURFACE_CLASS} p-3`}>
                                    <div className="mb-3 flex items-center justify-between gap-3 px-1">
                                        <div>
                                            <div className="text-[10px] smallcaps text-[var(--dim)]">Available setups</div>
                                            <div className="text-sm font-medium text-white">Start with the station type you want to bill</div>
                                        </div>
                                        <span className="chip border-transparent bg-white/[0.05] text-slate-300">
                                            {availableConsoles.length} type{availableConsoles.length === 1 ? '' : 's'}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                                        {availableConsoles.map((consoleType) => {
                                            const theme = getConsoleTheme(consoleType);
                                            const stationCount = stationOptions(consoleType).length;
                                            return (
                                                <button
                                                    key={consoleType}
                                                    type="button"
                                                    onClick={() => setItems([createItem(consoleType)])}
                                                    className={`relative overflow-hidden rounded-2xl p-4 text-left ${SUBPANEL_CLASS} ${HOVER_CARD_CLASS}`}
                                                    style={{ background: `linear-gradient(180deg, ${theme.accent}18, rgba(0,0,0,0)) , var(--card-2)` }}
                                                >
                                                    <span className="absolute inset-0 grid-dots opacity-30" />
                                                    <div className="relative flex items-start justify-between gap-3">
                                                        <span className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold text-white" style={{ background: `${theme.accent}22`, color: theme.accent }}>
                                                            {theme.short}
                                                        </span>
                                                        <span className="chip border-transparent bg-white/[0.06] text-slate-300">
                                                            {stationCount} station{stationCount === 1 ? '' : 's'}
                                                        </span>
                                                    </div>
                                                    <div className="relative mt-4">
                                                        <div className="text-sm font-semibold text-white">{CONSOLE_LABELS[consoleType as keyof typeof CONSOLE_LABELS] || consoleType.toUpperCase()}</div>
                                                        <div className="mono mt-1 text-[11px] text-[var(--muted)]">Tap to start</div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {items.map((item, index) => {
                                        const theme = getConsoleTheme(item.console);
                                        const stations = stationOptions(item.console);
                                        const allowSingleStation = canPickSingleStation(item.console, item.quantity);

                                        return (
                                            <div
                                                key={item.id}
                                                className="space-y-3 rounded-[26px] border border-white/[0.09] bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] p-4 shadow-[0_26px_48px_-34px_rgba(0,0,0,0.95)]"
                                            >
                                                {/* Header row */}
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-3">
                                                        <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[10px] smallcaps text-[var(--dim)]">
                                                            Item {index + 1}
                                                        </span>
                                                        <div>
                                                            <div className="text-sm font-semibold text-white">
                                                                {CONSOLE_LABELS[item.console as keyof typeof CONSOLE_LABELS] || item.console.toUpperCase()}
                                                            </div>
                                                            <div className="text-[11px] text-[var(--muted)]">
                                                                {item.quantity} player{item.quantity === 1 ? '' : 's'} · {formatDurationLabel(item.duration)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="mono rounded-full px-2.5 py-1 text-sm font-bold" style={{ color: theme.accent, background: `${theme.accent}12` }}>Rs.{item.price}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => removeItem(item.id)}
                                                            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] text-slate-500 transition-all duration-200 hover:-translate-y-0.5 hover:border-red-400/30 hover:text-red-300"
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Console — card grid */}
                                                <div>
                                                    <div className={CONTROL_LABEL_CLASS}>Choose console</div>
                                                    <div className={`${CONTROL_SURFACE_CLASS} p-3`}>
                                                        <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
                                                        {availableConsoles.map((consoleType) => {
                                                            const t = getConsoleTheme(consoleType);
                                                            const selected = item.console === consoleType;
                                                            const stationCount = stationOptions(consoleType).length;
                                                            return (
                                                                <button
                                                                    key={consoleType}
                                                                    type="button"
                                                                    onClick={() => updateItem(item.id, 'console', consoleType)}
                                                                    className={`relative overflow-hidden rounded-2xl border p-3 text-left transition-all duration-200 ${selected ? '' : HOVER_CARD_CLASS}`}
                                                                    style={{
                                                                        background: selected
                                                                            ? `linear-gradient(180deg, ${t.accent}20, rgba(255,255,255,0.025) 55%, rgba(0,0,0,0) 100%), var(--card-2)`
                                                                            : `linear-gradient(180deg, ${t.accent}10, rgba(255,255,255,0.01) 55%, rgba(0,0,0,0) 100%), var(--card-2)`,
                                                                        borderColor: selected ? `${t.accent}70` : 'rgba(255,255,255,0.08)',
                                                                        boxShadow: selected
                                                                            ? `0 0 0 1px ${t.accent}55, 0 22px 38px -28px ${t.accent}88, inset 0 1px 0 rgba(255,255,255,0.04)`
                                                                            : 'inset 0 1px 0 rgba(255,255,255,0.03), 0 20px 30px -28px rgba(0,0,0,0.9)',
                                                                    }}
                                                                >
                                                                    <span className="absolute inset-0 grid-dots opacity-20" />
                                                                    <div className="relative flex flex-col gap-2">
                                                                        <div className="flex items-center justify-between gap-2">
                                                                            <span className="flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold" style={{ background: `${t.accent}22`, color: t.accent }}>
                                                                                {t.short}
                                                                            </span>
                                                                            <span
                                                                                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                                                                                style={{
                                                                                    background: selected ? `${t.accent}18` : 'rgba(255,255,255,0.05)',
                                                                                    color: selected ? '#e8f7ff' : '#94a3b8',
                                                                                    border: selected ? `1px solid ${t.accent}28` : '1px solid rgba(255,255,255,0.05)',
                                                                                }}
                                                                            >
                                                                                {stationCount}
                                                                            </span>
                                                                        </div>
                                                                        <div>
                                                                            <div className="text-sm font-semibold text-white">
                                                                                {CONSOLE_LABELS[consoleType as keyof typeof CONSOLE_LABELS] || consoleType.toUpperCase()}
                                                                            </div>
                                                                            <div className="text-[11px]" style={{ color: selected ? t.accent : 'var(--muted)' }}>
                                                                                {selected ? '✓ Selected' : 'Tap to switch'}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </button>
                                                            );
                                                        })}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Station + Players */}
                                                <div className="grid gap-4 lg:grid-cols-2">
                                                    {/* Station */}
                                                    <div className={`${CONTROL_SURFACE_CLASS} p-4`}>
                                                        <div className={CONTROL_LABEL_CLASS}>Station</div>
                                                        {allowSingleStation ? (
                                                            <div className="flex flex-wrap gap-2">
                                                                {stations.length === 0 ? (
                                                                    <p className="text-xs text-[var(--muted)]">Configure stations in Settings.</p>
                                                                ) : stations.map((station) => {
                                                                    const selected = item.station === station;
                                                                    return (
                                                                        <button
                                                                            key={station}
                                                                            type="button"
                                                                            onClick={() => updateItem(item.id, 'station', station)}
                                                                            className="relative rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5"
                                                                            style={{
                                                                                background: selected ? `${theme.accent}18` : 'rgba(255,255,255,0.04)',
                                                                                border: selected ? `1.5px solid ${theme.accent}60` : '1.5px solid rgba(255,255,255,0.07)',
                                                                                color: selected ? '#fff' : '#94a3b8',
                                                                                boxShadow: selected ? `0 0 16px -4px ${theme.accent}50` : 'none',
                                                                            }}
                                                                        >
                                                                            {formatStationOptionLabel(station)}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        ) : (
                                                            <p className="text-xs text-[var(--muted)]">Auto-assigns to available stations.</p>
                                                        )}
                                                    </div>

                                                    {/* Players */}
                                                    <div className={`${CONTROL_SURFACE_CLASS} p-4`}>
                                                        <div className={CONTROL_LABEL_CLASS}>Players</div>
                                                        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                                                            {PLAYER_OPTIONS.map((players) => {
                                                                const selected = item.quantity === players;
                                                                return (
                                                                    <button
                                                                        key={players}
                                                                        type="button"
                                                                        onClick={() => updateItem(item.id, 'quantity', players)}
                                                                        className="rounded-xl py-3 text-sm font-bold transition-all duration-200 hover:-translate-y-0.5"
                                                                        style={{
                                                                            background: selected ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)',
                                                                            border: selected ? '1.5px solid rgba(255,255,255,0.20)' : '1.5px solid rgba(255,255,255,0.07)',
                                                                            color: selected ? '#fff' : '#64748b',
                                                                        }}
                                                                    >
                                                                        {players}P
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Duration */}
                                                <div className={`${CONTROL_SURFACE_CLASS} p-4`}>
                                                    <div className={CONTROL_LABEL_CLASS}>Duration</div>
                                                    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
                                                        {DURATION_OPTIONS.map((dur) => {
                                                            const selected = item.duration === dur;
                                                            return (
                                                                <button
                                                                    key={dur}
                                                                    type="button"
                                                                    onClick={() => updateItem(item.id, 'duration', dur)}
                                                                    className="rounded-xl py-3 text-sm font-bold transition-all duration-200 hover:-translate-y-0.5"
                                                                    style={{
                                                                        background: selected ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.04)',
                                                                        border: selected ? '1.5px solid rgba(6,182,212,0.40)' : '1.5px solid rgba(255,255,255,0.07)',
                                                                        color: selected ? '#67e8f9' : '#64748b',
                                                                        boxShadow: selected ? '0 0 20px -6px rgba(6,182,212,0.5)' : 'none',
                                                                    }}
                                                                >
                                                                    {formatDurationLabel(dur)}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </Card>

                    </div>

                    <div className="space-y-5">
                        <Card className={`sticky top-6 space-y-5 ${SECTION_CARD_CLASS}`}>
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/12 text-amber-300">
                                    <Clock size={18} />
                                </div>
                                <div>
                                    <div className="text-[10px] smallcaps text-[var(--dim)]">Summary</div>
                                    <h3 className="text-base font-semibold text-white">Collect payment</h3>
                                </div>
                            </div>

                            <div className={`${GAMING_SUMMARY_HERO_CLASS} p-5`}>
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <div className="text-[10px] smallcaps text-cyan-200/70">Due now</div>
                                        <div className="mono mt-2 text-[2.15rem] font-semibold tracking-tight text-white">Rs.{totalAmount}</div>
                                        <p className="mt-2 text-sm text-cyan-100/70">
                                            {items.length > 0
                                                ? `${items.length} booking line${items.length === 1 ? '' : 's'} ready for checkout`
                                                : 'Add a setup to begin billing'}
                                        </p>
                                    </div>
                                    <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-200">
                                        {paymentMode.toUpperCase()}
                                    </span>
                                </div>
                                <div className="mt-4 grid grid-cols-2 gap-3">
                                    <div className={`${CONTROL_SURFACE_CLASS} px-3.5 py-3`}>
                                        <div className="text-[10px] smallcaps text-[var(--dim)]">Calculated</div>
                                        <div className="mono mt-2 text-lg font-semibold text-white">Rs.{calculatedTotal}</div>
                                    </div>
                                    <div className={`${CONTROL_SURFACE_CLASS} px-3.5 py-3`}>
                                        <div className="text-[10px] smallcaps text-[var(--dim)]">Payment mode</div>
                                        <div className="mt-2 text-lg font-semibold text-white">{paymentMode === 'cash' ? 'Cash' : 'UPI'}</div>
                                    </div>
                                </div>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className={`${CONTROL_SURFACE_CLASS} focus-ring px-3.5 py-3 transition`}>
                                    <div className="mb-1.5 flex items-center gap-2 text-[10px] smallcaps text-[var(--dim)]">
                                        <CalendarDays size={13} className="text-slate-500" />
                                        Date
                                    </div>
                                    <input
                                        type="date"
                                        value={bookingDate}
                                        onChange={(event) => setBookingDate(event.target.value)}
                                        className="w-full bg-transparent text-sm text-white focus:outline-none"
                                        style={{ colorScheme: 'dark' }}
                                    />
                                </label>
                                <label className={`${CONTROL_SURFACE_CLASS} focus-ring px-3.5 py-3 transition`}>
                                    <div className="mb-1.5 flex items-center gap-2 text-[10px] smallcaps text-[var(--dim)]">
                                        <Clock size={13} className="text-slate-500" />
                                        Start Time
                                    </div>
                                    <input
                                        type="time"
                                        value={startTime}
                                        onChange={(event) => setStartTime(event.target.value)}
                                        className="mono w-full bg-transparent text-sm text-white focus:outline-none"
                                        style={{ colorScheme: 'dark' }}
                                    />
                                </label>
                            </div>

                            {items.length > 0 ? (
                                <div className="space-y-2">
                                    <div className="px-1 text-[10px] smallcaps text-[var(--dim)]">Booking lines</div>
                                    {items.map((item) => (
                                        <div key={item.id} className={`${CONTROL_SURFACE_CLASS} flex items-center justify-between gap-3 px-3.5 py-3`}>
                                            <div className="flex items-center gap-3">
                                                <span
                                                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold"
                                                    style={{
                                                        background: `${getConsoleTheme(item.console).accent}1a`,
                                                        color: getConsoleTheme(item.console).accent,
                                                    }}
                                                >
                                                    {getConsoleTheme(item.console).short}
                                                </span>
                                                <div>
                                                    <div className="text-sm font-medium text-white">
                                                        {CONSOLE_LABELS[item.console as keyof typeof CONSOLE_LABELS] || item.console.toUpperCase()}
                                                    </div>
                                                    <div className="text-[11px] text-[var(--muted)]">
                                                        {item.quantity} player{item.quantity === 1 ? '' : 's'} · {formatDurationLabel(item.duration)}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="mono text-sm font-semibold text-white">Rs.{item.price}</div>
                                                <div className="text-[11px] text-[var(--muted)]">
                                                    {item.station ? formatStationOptionLabel(item.station) : 'Auto assign'}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className={`${CONTROL_SURFACE_CLASS} rounded-2xl px-4 py-6 text-center text-sm text-[var(--muted)]`}>
                                    Select a console to start building the booking.
                                </div>
                            )}

                            <div className={`${CONTROL_SURFACE_CLASS} rounded-[22px] p-4`}>
                                <div className="flex items-center justify-between gap-3">
                                    <div className="text-[10px] smallcaps text-[var(--dim)]">Final amount</div>
                                    <span className="mono rounded-full bg-white/[0.04] px-3 py-1 text-xs text-slate-300">Calc Rs.{calculatedTotal}</span>
                                </div>
                                <div className="mt-4 flex items-center justify-between gap-3">
                                    <span className="text-sm text-[var(--muted)]">Charge customer</span>
                                    <div className="flex items-center gap-2">
                                        <span className="mono text-sm text-white">Rs.</span>
                                        <input
                                            type="number"
                                            value={manualAmount !== null ? manualAmount : calculatedTotal}
                                            onChange={(event) => {
                                                const value = parseFloat(event.target.value) || 0;
                                                setManualAmount(value === calculatedTotal ? null : value);
                                            }}
                                            min={0}
                                            className="mono w-32 rounded-xl border border-white/[0.07] bg-white/[0.04] px-3 py-2 text-right text-lg font-semibold text-white focus:border-cyan-400/40 focus:outline-none"
                                        />
                                    </div>
                                </div>
                                {manualAmount !== null && manualAmount !== calculatedTotal && (
                                    <div className="mt-3 flex items-center justify-between text-xs">
                                        <span className="text-amber-300">Manual override applied</span>
                                        <button type="button" onClick={resetManualAmount} className="text-slate-400 underline transition hover:text-white">
                                            Reset
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => setPaymentMode('cash')}
                                    className={`rounded-2xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 ${paymentMode === 'cash' ? 'border-emerald-400/30 bg-emerald-500/12 text-emerald-200 shadow-[0_18px_36px_-22px_rgba(16,185,129,0.8)]' : 'glass-2 text-slate-300 hover:border-white/15'}`}
                                >
                                    <Banknote className="mb-3" size={20} />
                                    <div className="text-sm font-semibold">Cash</div>
                                    <div className="mt-1 text-xs text-current/70">Collect directly at the counter</div>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPaymentMode('upi')}
                                    className={`rounded-2xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 ${paymentMode === 'upi' ? 'border-cyan-400/30 bg-cyan-500/12 text-cyan-100 shadow-[0_18px_36px_-22px_rgba(34,211,238,0.8)]' : 'glass-2 text-slate-300 hover:border-white/15'}`}
                                >
                                    <Smartphone className="mb-3" size={20} />
                                    <div className="text-sm font-semibold">UPI</div>
                                    <div className="mt-1 text-xs text-current/70">Show the QR and collect instantly</div>
                                </button>
                            </div>

                            {paymentMode === 'upi' && totalAmount > 0 && (
                                <div className="space-y-3 rounded-[24px] border border-cyan-400/15 bg-[linear-gradient(180deg,rgba(6,182,212,0.08),rgba(6,182,212,0.03))] px-4 py-4 text-center shadow-[0_20px_40px_-28px_rgba(34,211,238,0.7)]">
                                    <div className="flex items-center justify-between gap-3 text-left">
                                        <div>
                                            <div className="text-[10px] smallcaps text-cyan-200/70">UPI collect</div>
                                            <div className="text-sm font-semibold text-white">Scan and receive Rs.{totalAmount}</div>
                                        </div>
                                        <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2.5 py-1 text-[11px] text-cyan-100">
                                            Tap QR
                                        </span>
                                    </div>
                                    <div
                                        className="inline-flex cursor-pointer rounded-2xl bg-[#d4d4d4] p-3 transition"
                                        onClick={() => setQrExpanded((value) => !value)}
                                        title={qrExpanded ? 'Click to shrink' : 'Click to enlarge'}
                                    >
                                        <QRCodeSVG
                                            value={`upi://pay?pa=${encodeURIComponent('paytmqr6k4kf1@ptys')}&pn=${encodeURIComponent('BookMyGame')}&am=${totalAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent('Booking Payment')}`}
                                            size={qrExpanded ? 260 : 180}
                                            bgColor="#d4d4d4"
                                            fgColor="#111111"
                                            level="Q"
                                        />
                                    </div>
                                    <p className="text-xs text-slate-400">
                                        Scan to pay <span className="font-semibold text-white">Rs.{totalAmount}</span> via UPI.
                                    </p>
                                </div>
                            )}

                            {formError && (
                                <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">{formError}</p>
                            )}

                            <Button
                                className="w-full justify-center py-3.5 text-base"
                                onClick={handleSubmit}
                                loading={submitting}
                                disabled={submitting || items.length === 0}
                            >
                                {submitting ? 'Creating...' : 'Confirm Booking'}
                            </Button>
                        </Card>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_410px] xl:items-start">
                    <div className="space-y-5">
                        {customerInfoCard}

                        <Card className={`space-y-6 ${SECTION_CARD_CLASS}`}>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/12 text-violet-300">
                                        <Star size={18} />
                                    </div>
                                    <div>
                                        <div className="text-[10px] smallcaps text-[var(--dim)]">Membership Cart</div>
                                        <h3 className="text-base font-semibold text-white">Select plans</h3>
                                    </div>
                                </div>
                                {membershipPlans.length > 0 && (
                                    <Button size="sm" variant="secondary" onClick={addMemItem} className="shadow-[0_10px_30px_-18px_rgba(255,255,255,0.25)]">
                                        <Plus size={14} /> Add Plan
                                    </Button>
                                )}
                            </div>

                            {membershipPlans.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-white/[0.08] px-4 py-10 text-center">
                                    <p className="text-sm text-slate-400">No membership plans configured.</p>
                                    <p className="mt-1 text-xs text-slate-500">Add plans in the Memberships tab first.</p>
                                </div>
                            ) : memItems.length === 0 ? (
                                <div className={`${CONTROL_SURFACE_CLASS} p-3`}>
                                    <div className="mb-3 flex items-center justify-between gap-3 px-1">
                                        <div>
                                            <div className="text-[10px] smallcaps text-[var(--dim)]">Available plans</div>
                                            <div className="text-sm font-medium text-white">Start the checkout with the plan you want to sell</div>
                                        </div>
                                        <span className="chip border-transparent bg-white/[0.05] text-slate-300">
                                            {membershipPlans.length} plan{membershipPlans.length === 1 ? '' : 's'}
                                        </span>
                                    </div>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                    {membershipPlans.slice(0, 4).map((plan) => (
                                        <button
                                            key={plan.id}
                                            type="button"
                                            onClick={() => setMemItems([{ id: Math.random().toString(36).substr(2, 9), planId: plan.id, quantity: 1 }])}
                                            className={`${SUBPANEL_CLASS} rounded-2xl p-4 text-left ${HOVER_CARD_CLASS}`}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/14 text-sm font-bold text-violet-300">
                                                    {plan.console_type?.slice(0, 2).toUpperCase() || 'PL'}
                                                </span>
                                                <span className="chip border-transparent bg-violet-500/12 text-violet-200">
                                                    Rs.{plan.price}
                                                </span>
                                            </div>
                                            <div className="mt-4 text-sm font-semibold text-white">{plan.name}</div>
                                            <div className="mt-1 text-[11px] text-[var(--muted)]">
                                                {plan.plan_type === 'day_pass' ? 'Day pass' : `${plan.hours || 0}h`} · {plan.validity_days} days
                                            </div>
                                        </button>
                                    ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {memItems.map((item) => {
                                        const plan = membershipPlans.find((entry) => entry.id === item.planId);
                                        const lineTotal = plan ? plan.price * item.quantity : 0;
                                        return (
                                            <div key={item.id} className="rounded-[26px] border border-white/[0.09] bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] p-4 shadow-[0_26px_48px_-34px_rgba(0,0,0,0.95)]">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0 flex-1">
                                                        <label className="mb-1.5 block text-[10px] smallcaps text-[var(--dim)]">Plan</label>
                                                        <select
                                                            value={item.planId}
                                                            onChange={(event) => updateMemItem(item.id, 'planId', event.target.value)}
                                                            className="w-full rounded-xl border border-white/[0.07] bg-white/[0.04] px-3 py-2.5 text-sm text-white focus:border-violet-400/30 focus:outline-none"
                                                            style={{ colorScheme: 'dark' }}
                                                        >
                                                            {membershipPlans.map((option) => (
                                                                <option key={option.id} value={option.id} className="bg-[#11111a] text-white">
                                                                    {option.name}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        {plan && (
                                                            <div className="mt-2 flex flex-wrap gap-2">
                                                                <span className="chip border-transparent bg-white/[0.06] text-slate-300">
                                                                    {plan.console_type?.toUpperCase()}
                                                                </span>
                                                                <span className="chip border-transparent bg-white/[0.06] text-slate-300">
                                                                    {plan.plan_type === 'day_pass' ? 'Day pass' : `${plan.hours || 0}h`}
                                                                </span>
                                                                <span className="chip border-transparent bg-white/[0.06] text-slate-300">
                                                                    {plan.validity_days} days
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={() => removeMemItem(item.id)}
                                                        className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] text-slate-400 transition-all duration-200 hover:-translate-y-0.5 hover:border-red-400/30 hover:text-red-300"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>

                                                <div className={`${CONTROL_SURFACE_CLASS} mt-4 flex items-center justify-between gap-3 px-3.5 py-3`}>
                                                    <div>
                                                        <div className="text-[10px] smallcaps text-[var(--dim)]">Quantity</div>
                                                        <div className="mt-2 flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => updateMemItem(item.id, 'quantity', Math.max(1, item.quantity - 1))}
                                                            className="glass-2 flex h-9 w-9 items-center justify-center rounded-xl text-white transition-all duration-200 hover:-translate-y-0.5 hover:border-white/15"
                                                        >
                                                            -
                                                        </button>
                                                        <span className="mono w-10 text-center text-sm font-semibold text-white">{item.quantity}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => updateMemItem(item.id, 'quantity', Math.min(20, item.quantity + 1))}
                                                            className="glass-2 flex h-9 w-9 items-center justify-center rounded-xl text-white transition-all duration-200 hover:-translate-y-0.5 hover:border-white/15"
                                                        >
                                                            +
                                                        </button>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-[10px] smallcaps text-[var(--dim)]">Line total</div>
                                                        <div className="mono text-base font-semibold text-white">Rs.{lineTotal}</div>
                                                        {plan && item.quantity > 1 && (
                                                            <div className="text-[11px] text-[var(--muted)]">Rs.{plan.price} each</div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </Card>
                    </div>

                    <div className="space-y-5">
                        <Card className={`sticky top-6 space-y-5 ${SECTION_CARD_CLASS}`}>
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/12 text-violet-300">
                                    <CreditCard size={18} />
                                </div>
                                <div>
                                    <div className="text-[10px] smallcaps text-[var(--dim)]">Payment</div>
                                    <h3 className="text-base font-semibold text-white">Checkout plan</h3>
                                </div>
                            </div>

                            <div className={`${MEMBERSHIP_SUMMARY_HERO_CLASS} p-5`}>
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <div className="text-[10px] smallcaps text-violet-200/70">Due now</div>
                                        <div className="mono mt-2 text-[2.15rem] font-semibold tracking-tight text-white">Rs.{memTotalAmount}</div>
                                        <p className="mt-2 text-sm text-violet-100/70">
                                            {memItems.length > 0
                                                ? `${memItems.length} cart line${memItems.length === 1 ? '' : 's'} ready for checkout`
                                                : 'Add a membership plan to begin checkout'}
                                        </p>
                                    </div>
                                    <span className="rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-200">
                                        {memPaymentMode.toUpperCase()}
                                    </span>
                                </div>
                                <div className="mt-4 grid grid-cols-2 gap-3">
                                    <div className={`${CONTROL_SURFACE_CLASS} px-3.5 py-3`}>
                                        <div className="text-[10px] smallcaps text-[var(--dim)]">Calculated</div>
                                        <div className="mono mt-2 text-lg font-semibold text-white">Rs.{memCalculatedTotal}</div>
                                    </div>
                                    <div className={`${CONTROL_SURFACE_CLASS} px-3.5 py-3`}>
                                        <div className="text-[10px] smallcaps text-[var(--dim)]">Payment mode</div>
                                        <div className="mt-2 text-lg font-semibold text-white">{memPaymentMode === 'cash' ? 'Cash' : 'UPI'}</div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                {memItems.length > 0 ? memItems.map((item) => {
                                    const plan = membershipPlans.find((entry) => entry.id === item.planId);
                                    if (!plan) return null;
                                    return (
                                        <div key={item.id} className={`${CONTROL_SURFACE_CLASS} flex items-center justify-between gap-3 px-3.5 py-3`}>
                                            <div className="flex items-center gap-3">
                                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/14 text-sm font-bold text-violet-300">
                                                    {plan.console_type?.slice(0, 2).toUpperCase() || 'PL'}
                                                </span>
                                                <div>
                                                    <div className="text-sm font-medium text-white">{plan.name}</div>
                                                    <div className="text-[11px] text-[var(--muted)]">Qty {item.quantity}</div>
                                                </div>
                                            </div>
                                            <div className="mono text-sm font-semibold text-white">Rs.{plan.price * item.quantity}</div>
                                        </div>
                                    );
                                }) : (
                                    <div className={`${CONTROL_SURFACE_CLASS} rounded-2xl px-4 py-6 text-center text-sm text-[var(--muted)]`}>
                                        Select a plan to start the checkout.
                                    </div>
                                )}
                            </div>

                            <div className={`${CONTROL_SURFACE_CLASS} rounded-[22px] p-4`}>
                                <div className="flex items-center justify-between gap-3">
                                    <div className="text-[10px] smallcaps text-[var(--dim)]">Final amount</div>
                                    <span className="mono rounded-full bg-white/[0.04] px-3 py-1 text-xs text-slate-300">Calc Rs.{memCalculatedTotal}</span>
                                </div>
                                <div className="mt-4 flex items-center justify-between gap-3">
                                    <span className="text-sm text-[var(--muted)]">Charge customer</span>
                                    <div className="flex items-center gap-2">
                                        <span className="mono text-sm text-white">Rs.</span>
                                        <input
                                            type="number"
                                            value={memManualAmount !== null ? memManualAmount : memCalculatedTotal}
                                            onChange={(event) => {
                                                const value = parseFloat(event.target.value) || 0;
                                                setMemManualAmount(value === memCalculatedTotal ? null : value);
                                            }}
                                            min={0}
                                            className="mono w-32 rounded-xl border border-white/[0.07] bg-white/[0.04] px-3 py-2 text-right text-lg font-semibold text-white focus:border-violet-400/30 focus:outline-none"
                                        />
                                    </div>
                                </div>
                                {memManualAmount !== null && memManualAmount !== memCalculatedTotal && (
                                    <div className="mt-3 flex items-center justify-between text-xs">
                                        <span className="text-amber-300">Manual override applied</span>
                                        <button type="button" onClick={() => setMemManualAmount(null)} className="text-slate-400 underline transition hover:text-white">
                                            Reset
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => setMemPaymentMode('cash')}
                                    className={`rounded-2xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 ${memPaymentMode === 'cash' ? 'border-emerald-400/30 bg-emerald-500/12 text-emerald-200 shadow-[0_18px_36px_-22px_rgba(16,185,129,0.8)]' : 'glass-2 text-slate-300 hover:border-white/15'}`}
                                >
                                    <Banknote className="mb-3" size={20} />
                                    <div className="text-sm font-semibold">Cash</div>
                                    <div className="mt-1 text-xs text-current/70">Collect directly at the counter</div>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMemPaymentMode('upi')}
                                    className={`rounded-2xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 ${memPaymentMode === 'upi' ? 'border-violet-400/30 bg-violet-500/12 text-violet-100 shadow-[0_18px_36px_-22px_rgba(168,85,247,0.8)]' : 'glass-2 text-slate-300 hover:border-white/15'}`}
                                >
                                    <Smartphone className="mb-3" size={20} />
                                    <div className="text-sm font-semibold">UPI</div>
                                    <div className="mt-1 text-xs text-current/70">Show the QR and collect instantly</div>
                                </button>
                            </div>

                            {memPaymentMode === 'upi' && memTotalAmount > 0 && (
                                <div className="space-y-3 rounded-[24px] border border-violet-400/15 bg-[linear-gradient(180deg,rgba(168,85,247,0.09),rgba(168,85,247,0.04))] px-4 py-4 text-center shadow-[0_20px_40px_-28px_rgba(168,85,247,0.7)]">
                                    <div className="flex items-center justify-between gap-3 text-left">
                                        <div>
                                            <div className="text-[10px] smallcaps text-violet-200/70">UPI collect</div>
                                            <div className="text-sm font-semibold text-white">Scan and receive Rs.{memTotalAmount}</div>
                                        </div>
                                        <span className="rounded-full border border-violet-400/20 bg-violet-500/10 px-2.5 py-1 text-[11px] text-violet-100">
                                            Tap QR
                                        </span>
                                    </div>
                                    <div
                                        className="inline-flex cursor-pointer rounded-2xl bg-[#d4d4d4] p-3 transition"
                                        onClick={() => setQrExpanded((value) => !value)}
                                        title={qrExpanded ? 'Click to shrink' : 'Click to enlarge'}
                                    >
                                        <QRCodeSVG
                                            value={`upi://pay?pa=${encodeURIComponent('paytmqr6k4kf1@ptys')}&pn=${encodeURIComponent('BookMyGame')}&am=${memTotalAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent('Membership Payment')}`}
                                            size={qrExpanded ? 260 : 180}
                                            bgColor="#d4d4d4"
                                            fgColor="#111111"
                                            level="Q"
                                        />
                                    </div>
                                    <p className="text-xs text-slate-400">
                                        Scan to pay <span className="font-semibold text-white">Rs.{memTotalAmount}</span> via UPI.
                                    </p>
                                </div>
                            )}

                            {formError && (
                                <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">{formError}</p>
                            )}

                            <Button
                                className="w-full justify-center py-3.5 text-base"
                                onClick={handleMemSubmit}
                                loading={memSubmitting}
                                disabled={memSubmitting || memItems.length === 0 || !customerName.trim() || !customerPhone.trim()}
                            >
                                {memSubmitting ? 'Adding...' : 'Add Membership'}
                            </Button>
                        </Card>
                    </div>
                </div>
            )}

            {/* Sticky mobile confirm bar */}
            {isMobile && mode === 'gaming' && !lastBooking && items.length > 0 && (
                <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center gap-3 border-t border-white/[0.08] bg-[#0d0d14]/95 px-4 py-3 backdrop-blur-md">
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-slate-500 font-medium">Total</p>
                        <p className="text-xl font-bold text-white leading-none">₹{totalAmount}</p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setPaymentMode(paymentMode === 'cash' ? 'upi' : 'cash')}
                            className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${paymentMode === 'cash' ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300' : 'border-cyan-500/30 bg-cyan-500/15 text-cyan-200'}`}
                        >
                            {paymentMode === 'cash' ? 'Cash' : 'UPI'}
                        </button>
                        <Button
                            onClick={handleSubmit}
                            loading={submitting}
                            disabled={submitting}
                            className="px-5 py-2 rounded-xl text-sm font-bold"
                        >
                            Confirm
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
