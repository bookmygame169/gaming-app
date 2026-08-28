'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { getCafePayee, buildUpiPaymentUrl } from '@/lib/upi';
import { CONSOLE_LABELS } from '@/lib/constants';
import { getInitialOwnerBookingStatus } from '@/lib/bookingFilters';
import { dedupeStationPricingRows, normaliseStationName } from '@/lib/stationNames';
import { Card, Button } from './ui';
import {
    User, Smartphone, Clock, Plus, Trash2, X,
    CreditCard, Banknote, CheckCircle, Star,
    Store, CalendarDays, IndianRupee, Gamepad2, ExternalLink
} from 'lucide-react';
import { CafeRow } from '@/types/database';

import { getLocalDateString, normaliseConsoleType, buildWhatsAppUrl, buildBookingTicketMessage, formatDurationLabel } from '../utils';
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
    onMembershipSuccess?: (result?: { hasDayPass: boolean; hasHourlyMembership: boolean }) => void;
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
    /**
     * A specific machine, or undefined for whichever is free.
     *
     * The server has always accepted this — reserveStations takes requested
     * stations and refuses one that is occupied — but nothing ever sent it, so
     * every booking was auto-assigned and staff could not put a customer on the
     * desk they were standing at. With the lock running per machine that is the
     * difference between the right PC unlocking and the wrong one.
     */
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

const DURATION_OPTIONS = [30, 60, 90, 120, 150, 180, 240, 300];
const PLAYER_OPTIONS = [1, 2, 3, 4];

const CONSOLE_THEME: Record<string, { accent: string; short: string }> = {
    ps5: { accent: '#d8ff3c', short: 'PS5' },
    ps4: { accent: '#d8ff3c', short: 'PS4' },
    xbox: { accent: '#d8ff3c', short: 'XB' },
    pc: { accent: '#d8ff3c', short: 'PC' },
    pool: { accent: '#ffa53c', short: 'PL' },
    snooker: { accent: '#ffa53c', short: 'SN' },
    arcade: { accent: '#ff5c2b', short: 'AR' },
    vr: { accent: '#d8ff3c', short: 'VR' },
    steering: { accent: '#ffa53c', short: 'SW' },
    racing_sim: { accent: '#ff5c2b', short: 'RS' },
};

const SECTION_CARD_CLASS = 'border border-[#f2f0ea]/10 bg-[#111113]';
const SUBPANEL_CLASS = 'border border-[#f2f0ea]/10 bg-[#0b0b0c]';
const HOVER_CARD_CLASS = 'transition-colors duration-150 hover:border-[#d8ff3c]';
const CONTROL_SURFACE_CLASS = 'border border-[#f2f0ea]/10 bg-[#111113]';
const GAMING_SUMMARY_HERO_CLASS = 'border border-[#f2f0ea]/10 bg-[#111113]';
const MEMBERSHIP_SUMMARY_HERO_CLASS = 'border border-[#f2f0ea]/10 bg-[#111113]';
const CONTROL_LABEL_CLASS = 'font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#f2f0ea]/[0.42]';

/** The design's control row: a fixed label column, then the control. */
const CONTROL_ROW_CLASS =
    'grid grid-cols-1 items-start gap-2 border-b border-[#f2f0ea]/[0.07] px-4 py-3.5 last:border-b-0 sm:grid-cols-[74px_minmax(0,1fr)] sm:gap-4 sm:items-center';

function getConsoleTheme(consoleType: string) {
    return CONSOLE_THEME[consoleType] || { accent: '#d8ff3c', short: consoleType.slice(0, 2).toUpperCase() };
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

function toWholeRupees(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.round(value));
}

function getCurrentIndiaTimeInput(date: Date = new Date()): string {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        hourCycle: 'h23',
        minute: '2-digit',
    }).formatToParts(date);
    const hour = parts.find((part) => part.type === 'hour')?.value || '00';
    const minute = parts.find((part) => part.type === 'minute')?.value || '00';
    return `${hour}:${minute}`;
}

function getBookingPaymentLink(bookingId: string): string {
    if (typeof window === 'undefined') return `/bookings/${bookingId}`;
    return `${window.location.origin}/bookings/${bookingId}`;
}

function buildAdvancePaymentMessage({
    customerName,
    cafeName,
    date,
    startTime,
    duration,
    itemsLabel,
    totalAmount,
    paymentLink,
}: {
    customerName: string;
    cafeName?: string | null;
    date: string;
    startTime: string;
    duration: number;
    itemsLabel: string;
    totalAmount: number;
    paymentLink: string;
}): string {
    const firstName = customerName.split(' ')[0] || 'there';
    return [
        ...(cafeName ? [`*${cafeName}*`, ``] : []),
        `*Advance Booking Payment*`,
        ``,
        `Hey *${firstName}*,`,
        cafeName ? `Your slot is held at *${cafeName}* until payment is verified.` : `Your gaming slot is held until payment is verified.`,
        ``,
        `━━━━━━━━━━━━━━━━`,
        `*Date*     ${date}`,
        `*Time*     ${startTime} _(${formatDurationLabel(duration, { long: true })})_`,
        `*Console*  ${itemsLabel}`,
        `*Amount*   Rs.${totalAmount} · UPI`,
        `━━━━━━━━━━━━━━━━`,
        ``,
        `Pay here: ${paymentLink}`,
        ``,
        `After payment, we will verify it in Paytm Business and confirm your booking.`,
    ].join('\n');
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
    // Mode: walk-in gaming, advance payment-link booking, or membership checkout.
    const [mode, setMode] = useState<'gaming' | 'advance' | 'membership'>('gaming');

    // Membership cart state
    type MemItem = { id: string; planId: string; quantity: number };
    const [memItems, setMemItems] = useState<MemItem[]>([]);
    const [memManualAmount, setMemManualAmount] = useState<number | null>(null);
    const [memPaymentMode, setMemPaymentMode] = useState<'cash' | 'upi'>('cash');
    const [memSubmitting, setMemSubmitting] = useState(false);
    const [qrExpanded, setQrExpanded] = useState(false);

    // The QR must pay this café, not a platform-wide account. Null until the
    // owner sets their UPI id under Payments, in which case no QR is shown —
    // a missing QR means "take cash", a wrong one means the money is gone.
    const upiPayee = useMemo(() => {
        const cafe = cafes.find((entry) => entry.id === cafeId);
        return cafe ? getCafePayee(cafe) : null;
    }, [cafes, cafeId]);

    // Shared customer state
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [bookingDate, setBookingDate] = useState(getLocalDateString());
    const [startTime, setStartTime] = useState(() => getCurrentIndiaTimeInput());
    const [items, setItems] = useState<BillingItem[]>([]);
    const [paymentMode, setPaymentMode] = useState<'cash' | 'upi'>('cash');
    const [manualAmount, setManualAmount] = useState<number | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    // After a successful gaming booking, store details to show a WhatsApp send option
    type LastBooking = {
        name: string; phone: string; date: string; time: string;
        duration: number; itemsLabel: string; amount: number;
        paymentMode: string; cafeName: string; kind: 'walk-in' | 'advance';
        bookingId?: string; paymentLink?: string;
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
            setStartTime(getCurrentIndiaTimeInput());
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

    const calculatePrice = useCallback((type: string, qty: number, duration: number) =>
        calcBillingPrice(type, qty, duration, cafeId, consolePricingMap, stationPricingMap),
        [cafeId, consolePricingMap, stationPricingMap]);

    useEffect(() => {
        setItems(prevItems => prevItems.map(item => {
            const nextPrice = calculatePrice(item.console, item.quantity, item.duration);

            return nextPrice === item.price ? item : { ...item, price: nextPrice };
        }));
    }, [calculatePrice]);

    const createItem = (consoleType: string) => {
        return {
            id: Math.random().toString(36).substr(2, 9),
            console: consoleType,
            quantity: 1,
            duration: 60,
            price: calculatePrice(consoleType, 1, 60),
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
        if (!lastBooking || lastBooking.kind === 'advance') { setAutoResetSecs(null); return; }
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

    useEffect(() => {
        if (mode === 'advance') setPaymentMode('upi');
    }, [mode]);

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
                const updated = { ...item, [field]: value };

                if (['console', 'quantity', 'duration'].includes(field)) {
                    updated.price = calculatePrice(updated.console, updated.quantity, updated.duration);
                }

                // A pinned machine belongs to one console type, and a quantity
                // above one needs that many machines rather than a single named
                // desk. Either change makes the pin invalid, so it is dropped
                // instead of being sent and rejected.
                if (field === 'console' || (field === 'quantity' && Number(value) !== 1)) {
                    updated.station = undefined;
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
    const previousCalculatedTotalRef = useRef(calculatedTotal);

    useEffect(() => {
        if (previousCalculatedTotalRef.current === calculatedTotal) return;
        previousCalculatedTotalRef.current = calculatedTotal;
        setManualAmount(null);
    }, [calculatedTotal]);

    // Reset manual amount when items change (recalculate)
    const resetManualAmount = () => setManualAmount(null);

    // What this customer already has with the café — points they could spend,
    // a membership they have already paid for. Looked up as the number is
    // typed, because nobody stops mid-sale to open another tab, and a balance
    // nobody sees is a balance nobody offers.
    const [customerInsight, setCustomerInsight] = useState<{
        loyalty: { enabled: boolean; balance: number; worthRupees: number; canRedeem: boolean } | null;
        membership: { planName: string; hoursRemaining: number } | null;
        wallet: { balance: number } | null;
    } | null>(null);

    useEffect(() => {
        const digits = normalizePhone(customerPhone);
        if (!cafeId || digits.length < 10) {
            setCustomerInsight(null);
            return;
        }

        let cancelled = false;
        // Debounced: this fires on every keystroke of the last digits.
        const timer = setTimeout(async () => {
            try {
                const res = await fetch(
                    `/api/owner/customer-lookup?cafeId=${encodeURIComponent(cafeId)}&phone=${encodeURIComponent(digits)}`,
                    { credentials: 'include' }
                );
                if (!res.ok) return;
                const data = await res.json();
                if (!cancelled && data.found) {
                    setCustomerInsight({
                        loyalty: data.loyalty,
                        membership: data.membership,
                        wallet: data.wallet ?? null,
                    });
                }
            } catch {
                // A sale must never be blocked by this.
            }
        }, 350);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [customerPhone, cafeId]);

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
            description: 'Single customer, multiple console lines, one shared start time, one checkout.',
        }
        : mode === 'advance'
        ? {
            eyebrow: 'Advance Booking',
            title: 'Create payment link',
            description: 'Hold a slot, send the payment link on WhatsApp, then confirm after Paytm Business verification.',
        }
        : {
            eyebrow: 'Membership Checkout',
            title: 'Fast plan billing',
            description: 'Pick the customer, choose the plan, and complete membership checkout without leaving the tab.',
        };

    const handleSubmit = async () => {
        const isAdvanceBooking = mode === 'advance';
        if (!customerName || !startTime || items.length === 0) {
            setFormError('Please fill all required fields and add at least one console.');
            return;
        }
        if (isAdvanceBooking && !customerPhone.trim()) {
            setFormError('Customer phone is required to send the advance booking link.');
            return;
        }
        if (isAdvanceBooking && bookingDate < getLocalDateString()) {
            setFormError('Advance booking date cannot be in the past.');
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
            const effectivePaymentMode = isAdvanceBooking ? 'upi' : paymentMode;

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
                        status: isAdvanceBooking ? 'pending' : getInitialOwnerBookingStatus(bookingDate, startTime12h),
                        source: isAdvanceBooking ? 'advance' : 'walk-in',
                        payment_mode: effectivePaymentMode,
                    },
                    items: items.map(it => ({
                        console: it.console,
                        quantity: it.quantity,
                        price: it.price,
                        // The API reads a requested machine out of this field,
                        // and falls back to assigning a free one when there is
                        // none. Same format it has always parsed.
                        title: it.station
                            ? `${it.duration}|${it.station}`
                            : String(it.duration),
                    })),
                }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Failed to create booking');

            const cafeName = cafes.find(c => c.id === cafeId)?.name || '';
            const itemsLabel = items.map(it => `${it.quantity}x ${it.console.toUpperCase()}`).join(', ');
            const paymentLink = result.bookingId ? getBookingPaymentLink(result.bookingId) : undefined;
            setLastBooking({
                name: customerName,
                phone: customerPhone,
                date: bookingDate,
                time: startTime12h,
                duration: bookingDuration,
                itemsLabel,
                amount: totalAmount,
                paymentMode: effectivePaymentMode,
                cafeName,
                kind: isAdvanceBooking ? 'advance' : 'walk-in',
                bookingId: result.bookingId,
                paymentLink,
            });
            setCustomerName('');
            setCustomerPhone('');
            setItems([]);
            setManualAmount(null);
            setPaymentMode(isAdvanceBooking ? 'upi' : 'cash');
            setBookingDate(getLocalDateString());
            setStartTime(getCurrentIndiaTimeInput());
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

    const memCalculatedTotal = toWholeRupees(memItems.reduce((sum, mi) => {
        const plan = membershipPlans.find(p => p.id === mi.planId);
        return sum + (plan ? plan.price * mi.quantity : 0);
    }, 0));
    const memTotalAmount = toWholeRupees(memManualAmount !== null ? memManualAmount : memCalculatedTotal);
    const previousMemCalculatedTotalRef = useRef(memCalculatedTotal);

    useEffect(() => {
        if (previousMemCalculatedTotalRef.current === memCalculatedTotal) return;
        previousMemCalculatedTotalRef.current = memCalculatedTotal;
        setMemManualAmount(null);
    }, [memCalculatedTotal]);

    const handleMemSubmit = async () => {
        if (!customerName.trim()) { setFormError('Customer name is required'); return; }
        if (!customerPhone.trim()) { setFormError('Phone number is required'); return; }
        if (!/^\+?\d[\d\s\-()]{7,14}$/.test(customerPhone.trim())) { setFormError('Invalid phone number format'); return; }
        if (memItems.length === 0) { setFormError('Please add at least one membership plan'); return; }
        const selectedPlans = memItems
            .map((item) => membershipPlans.find((plan) => plan.id === item.planId))
            .filter((plan): plan is MembershipPlan => Boolean(plan));
        const hasDayPass = selectedPlans.some((plan) => plan.plan_type === 'day_pass');
        const hasHourlyMembership = selectedPlans.some((plan) => plan.plan_type !== 'day_pass');
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
            if (onMembershipSuccess) onMembershipSuccess({ hasDayPass, hasHourlyMembership });
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
            <div className="absolute left-0 top-full z-[200] mt-2 max-h-56 w-full overflow-y-auto ">
                {suggestions.map((suggestion, idx) => (
                    <button
                        key={`${suggestion.phone}-${idx}`}
                        type="button"
                        onMouseDown={(event) => {
                            event.preventDefault();
                            applyCustomer(suggestion);
                        }}
                        className="flex w-full items-center gap-3 border-b border-[#f2f0ea]/[0.07] px-4 py-3 text-left transition last:border-b-0 hover:bg-[#f2f0ea]/[0.04]"
                    >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center bg-[#d8ff3c]/12 text-xs font-bold text-[#d8ff3c]">
                            {suggestion.name.charAt(0).toUpperCase()}
                        </span>
                        <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-[#f2f0ea]">{suggestion.name}</span>
                            <span className="mono block text-[11px] text-[var(--muted)]">{suggestion.phone}</span>
                        </span>
                    </button>
                ))}
            </div>
        );
    };

    const isGamingFlow = mode === 'gaming' || mode === 'advance';
    const isAdvanceMode = mode === 'advance';
    const customerCardTitle = isAdvanceMode
        ? 'Advance customer'
        : mode === 'membership'
        ? 'Member details'
        : 'Walk-in details';

    const customerInfoCard = (
        <Card className={`overflow-visible space-y-5 ${SECTION_CARD_CLASS}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center bg-[#d8ff3c]/12 text-[#d8ff3c]">
                        <User size={18} />
                    </div>
                    <div>
                        <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-[#f2f0ea]/[0.42]">Customer</div>
                        <h3 className="text-base font-semibold text-[#f2f0ea]">{customerCardTitle}</h3>
                    </div>
                </div>

                {matchedCustomer && (
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="chip border-transparent bg-[#d8ff3c]/12 text-[#d8ff3c]">Returning guest</span>
                        {typeof matchedCustomer.visits === 'number' && (
                            <span className="chip border-transparent bg-[#f2f0ea]/[0.06] text-[#f2f0ea]/70">
                                {matchedCustomer.visits} visit{matchedCustomer.visits === 1 ? '' : 's'}
                            </span>
                        )}
                        {matchedCustomer.last_visit && (
                            <span className="chip border-transparent bg-[#f2f0ea]/[0.06] text-[#f2f0ea]/70">
                                Last {formatLastVisit(matchedCustomer.last_visit)}
                            </span>
                        )}
                    </div>
                )}

                {/* Points and membership, shown at the moment the bill is being
                    made rather than in a tab nobody opens mid-sale. */}
                {(customerInsight?.loyalty?.balance ||
                    customerInsight?.membership ||
                    customerInsight?.wallet?.balance) && (
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Wallet first: it is the customer's own money, and
                            charging them again for a session they have already
                            paid for is the mistake worth preventing. */}
                        {customerInsight?.wallet && customerInsight.wallet.balance > 0 && (
                            <span className="chip border-transparent bg-[#d8ff3c]/12 text-[#d8ff3c]">
                                ₹{customerInsight.wallet.balance} in wallet
                            </span>
                        )}

                        {customerInsight?.membership && (
                            <span className="chip border-transparent bg-[#d8ff3c]/12 text-[#d8ff3c]">
                                {customerInsight.membership.planName} ·{' '}
                                {customerInsight.membership.hoursRemaining}h left
                            </span>
                        )}

                        {customerInsight?.loyalty && customerInsight.loyalty.balance > 0 && (
                            <span
                                className={`chip border-transparent ${
                                    customerInsight.loyalty.canRedeem
                                        ? 'bg-[#d8ff3c]/12 text-[#d8ff3c]'
                                        : 'bg-[#f2f0ea]/[0.06] text-[#f2f0ea]/50'
                                }`}
                            >
                                {customerInsight.loyalty.balance} points
                                {customerInsight.loyalty.canRedeem
                                    ? ` · can take ₹${customerInsight.loyalty.worthRupees} off`
                                    : ' · not enough to use yet'}
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
                    <div className="relative focus-ring border border-white/[0.07] px-3.5 py-2.5 transition">
                        <div className="flex items-center gap-2">
                            <User size={16} className="text-[#f2f0ea]/40" />
                            <input
                                value={customerName}
                                onChange={(event) => {
                                    setCustomerName(event.target.value);
                                    searchCustomers(event.target.value, 'name');
                                }}
                                onBlur={() => setTimeout(closeSuggestions, 150)}
                                placeholder="Walk-in customer"
                                maxLength={100}
                                className="w-full bg-transparent text-sm text-[#f2f0ea] placeholder:text-[#4b5060] focus:outline-none"
                            />
                        </div>
                        {renderSuggestions('name')}
                    </div>
                </div>

                <div>
                    <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--dim)]">
                        {mode === 'membership' || mode === 'advance' ? 'Phone Required' : 'Phone'}
                    </label>
                    <div className="relative focus-ring border border-white/[0.07] px-3.5 py-2.5 transition">
                        <div className="flex items-center gap-2">
                            <Smartphone size={16} className="text-[#f2f0ea]/40" />
                            <input
                                value={customerPhone}
                                onChange={(event) => {
                                    setCustomerPhone(event.target.value);
                                    searchCustomers(event.target.value, 'phone');
                                }}
                                onBlur={() => setTimeout(closeSuggestions, 150)}
                                placeholder="98765 43210"
                                maxLength={15}
                                className="mono w-full bg-transparent text-sm text-[#f2f0ea] placeholder:text-[#4b5060] focus:outline-none"
                            />
                        </div>
                        {renderSuggestions('phone')}
                    </div>
                </div>
            </div>

        </Card>
    );

    return (
        <div className={`space-y-6 ${isMobile && isGamingFlow && !lastBooking && items.length > 0 ? 'pb-24' : isMobile ? 'pb-20' : ''}`}>
            <div className="border border-[#f2f0ea]/10 bg-[#111113] px-4 py-4 sm:px-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-1">
                        <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-[#f2f0ea]/[0.42]">{modeIntro.eyebrow}</div>
                        <h2 className="text-lg font-extrabold tracking-[-0.01em] text-[#f2f0ea]">{modeIntro.title}</h2>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {onSnackOnlySale && mode === 'gaming' && (
                            <button
                                type="button"
                                onClick={onSnackOnlySale}
                                className="border border-[#ff5c2b]/15 px-3.5 py-2.5 text-sm font-medium text-[#ff5c2b] transition-all duration-200 hover:border-[#ff5c2b]/30 hover:bg-[#ff5c2b]/10"
                            >
                                Snack-only sale
                            </button>
                        )}
                        <div className="inline-flex border border-[#f2f0ea]/10 p-1.5">
                            <button
                                type="button"
                                onClick={() => setMode('gaming')}
                                className={` px-4 py-2.5 text-sm font-medium transition-all ${mode === 'gaming' ? 'bg-[#d8ff3c]/15 text-[#f2f0ea]' : 'text-[#f2f0ea]/50 hover:text-[#f2f0ea]'}`}
                            >
                                Walk-in
                            </button>
                            <button
                                type="button"
                                onClick={() => setMode('advance')}
                                className={` px-4 py-2.5 text-sm font-medium transition-all ${mode === 'advance' ? 'bg-[#ff5c2b]/15 text-[#f2f0ea]' : 'text-[#f2f0ea]/50 hover:text-[#f2f0ea]'}`}
                            >
                                Advance
                            </button>
                            <button
                                type="button"
                                onClick={() => setMode('membership')}
                                className={` px-4 py-2.5 text-sm font-medium transition-all ${mode === 'membership' ? 'bg-[#d8ff3c]/15 text-[#f2f0ea]' : 'text-[#f2f0ea]/50 hover:text-[#f2f0ea]'}`}
                            >
                                Membership
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {isGamingFlow && lastBooking ? (
                <div className="mx-auto max-w-xl space-y-4">
                    <div className={` px-5 py-4 ${lastBooking.kind === 'advance' ? 'border border-[#ff5c2b]/20' : 'border border-[#d8ff3c]/20'}`}>
                        <div className="flex items-center gap-4">
                            <div className={`flex h-11 w-11 items-center justify-center  ${lastBooking.kind === 'advance' ? 'bg-[#ff5c2b]/15 text-[#ff5c2b]' : 'bg-[#d8ff3c]/15 text-[#d8ff3c]'}`}>
                                <CheckCircle size={20} />
                            </div>
                            <div>
                                <p className="text-lg font-semibold text-[#f2f0ea]">
                                    {lastBooking.kind === 'advance' ? 'Payment link ready' : 'Booking confirmed'}
                                </p>
                                <p className={`text-sm ${lastBooking.kind === 'advance' ? 'text-[#ff5c2b]/80' : 'text-[#d8ff3c]/80'}`}>{lastBooking.name}</p>
                            </div>
                        </div>
                    </div>

                    <Card className="overflow-hidden p-0">
                        {([
                            lastBooking.cafeName ? { icon: <Store size={13} className="text-[#f2f0ea]/40" />, label: 'Cafe', value: lastBooking.cafeName, highlight: false } : null,
                            { icon: <CalendarDays size={13} className="text-[#f2f0ea]/40" />, label: 'Date', value: lastBooking.date, highlight: false },
                            { icon: <Clock size={13} className="text-[#f2f0ea]/40" />, label: 'Time', value: `${lastBooking.time} (${formatDurationLabel(lastBooking.duration, { long: true })})`, highlight: false },
                            { icon: <Gamepad2 size={13} className="text-[#f2f0ea]/40" />, label: 'Session', value: lastBooking.itemsLabel, highlight: false },
                            { icon: <IndianRupee size={13} className={lastBooking.kind === 'advance' ? 'text-[#ff5c2b]' : 'text-[#d8ff3c]'} />, label: lastBooking.kind === 'advance' ? 'Amount due' : 'Amount', value: `Rs.${lastBooking.amount} · ${lastBooking.paymentMode}`, highlight: true },
                        ] as const).filter(Boolean).map((row, index, rows) => (
                            <div key={index} className={`flex items-center justify-between px-4 py-3 ${index < rows.length - 1 ? 'border-b border-[#f2f0ea]/[0.07]' : ''}`}>
                                <span className="flex items-center gap-2 text-sm text-[#f2f0ea]/40">{row!.icon}{row!.label}</span>
                                <span className={`text-sm font-medium ${row!.highlight ? (lastBooking.kind === 'advance' ? 'text-[#ff5c2b]' : 'text-[#d8ff3c]') : 'text-[#f2f0ea]'}`}>{row!.value}</span>
                            </div>
                        ))}
                    </Card>

                    {lastBooking.kind === 'advance' && lastBooking.paymentLink && (
                        <a
                            href={lastBooking.paymentLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between px-4 py-3 text-sm text-[#d8ff3c] transition hover:border-[#d8ff3c]/30"
                        >
                            <span className="min-w-0 truncate">{lastBooking.paymentLink}</span>
                            <ExternalLink size={14} className="shrink-0" />
                        </a>
                    )}

                    {autoResetSecs !== null && (
                        <div className="flex items-center justify-between px-3 py-2">
                            <span className="text-xs text-[#f2f0ea]/40">Auto-reset in</span>
                            <div className="flex items-center gap-2">
                                <span className="mono text-sm font-bold text-[#f2f0ea]">{autoResetSecs}s</span>
                                <div className="h-1 w-24 overflow-hidden rounded-full bg-[#f2f0ea]/[0.08]">
                                    <div className="h-full rounded-full bg-[#d8ff3c] transition-all duration-1000" style={{ width: `${(autoResetSecs / 8) * 100}%` }} />
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        {lastBooking.phone ? (
                            (() => {
                                const message = lastBooking.kind === 'advance' && lastBooking.paymentLink
                                    ? buildAdvancePaymentMessage({
                                        customerName: lastBooking.name,
                                        cafeName: lastBooking.cafeName,
                                        date: lastBooking.date,
                                        startTime: lastBooking.time,
                                        duration: lastBooking.duration,
                                        itemsLabel: lastBooking.itemsLabel,
                                        totalAmount: lastBooking.amount,
                                        paymentLink: lastBooking.paymentLink,
                                    })
                                    : buildBookingTicketMessage({
                                        customerName: lastBooking.name,
                                        cafeName: lastBooking.cafeName,
                                        date: lastBooking.date,
                                        startTime: lastBooking.time,
                                        duration: lastBooking.duration,
                                        itemsLabel: lastBooking.itemsLabel,
                                        totalAmount: lastBooking.amount,
                                        paymentMode: lastBooking.paymentMode,
                                    });

                                return (
                                    <a
                                        href={buildWhatsAppUrl(lastBooking.phone, message)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center justify-center gap-2 bg-[#25D366] px-4 py-3 text-sm font-semibold text-[#f2f0ea] transition-colors hover:bg-[#20b558]"
                                    >
                                        {lastBooking.kind === 'advance' ? 'Send payment link' : 'Send on WhatsApp'}
                                    </a>
                                );
                            })()
                        ) : (
                            <div className="flex items-center justify-center px-4 py-3 text-sm text-[#f2f0ea]/40">
                                No phone number
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={() => {
                                setLastBooking(null);
                                onSuccess?.();
                            }}
                            className="px-4 py-3 text-sm font-semibold text-[#f2f0ea] transition hover:border-white/15"
                        >
                            New booking
                        </button>
                    </div>
                </div>
            ) : isGamingFlow ? (
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_410px] xl:items-start">
                    <div className="space-y-5">
                        {customerInfoCard}

                        <Card className={`space-y-6 ${SECTION_CARD_CLASS}`}>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center bg-[#d8ff3c]/12 text-[#d8ff3c]">
                                        <Gamepad2 size={18} />
                                    </div>
                                    <div>
                                        <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-[#f2f0ea]/[0.42]">Session Builder</div>
                                        <h3 className="text-base font-semibold text-[#f2f0ea]">Build shared session</h3>
                                        {items.length > 0 && (
                                            <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-[var(--muted)]">
                                                <span>One customer bill</span>
                                                <span className="text-[#f2f0ea]/30">/</span>
                                                <span>Same start time</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {items.length > 0 && (
                                    <Button size="sm" variant="secondary" onClick={addItem} className="">
                                        <Plus size={14} /> Add Console
                                    </Button>
                                )}
                            </div>

                            {items.length === 0 ? (
                                <div className={`${CONTROL_SURFACE_CLASS} p-3`}>
                                    <div className="mb-3 flex items-center justify-between gap-3 px-1">
                                        <div>
                                            <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-[#f2f0ea]/[0.42]">Available setups</div>
                                            <div className="text-sm font-medium text-[#f2f0ea]">Start with the first console for this customer</div>
                                        </div>
                                        <span className="chip border-transparent bg-[#f2f0ea]/[0.05] text-[#f2f0ea]/70">
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
                                                    className={`relative overflow-hidden  p-4 text-left ${SUBPANEL_CLASS} ${HOVER_CARD_CLASS}`}
                                                    style={{ background: `linear-gradient(180deg, ${theme.accent}18, rgba(0,0,0,0)) , var(--card-2)` }}
                                                >
                                                    <span className="absolute inset-0 grid-dots opacity-30" />
                                                    <div className="relative flex items-start justify-between gap-3">
                                                        <span className="flex h-10 w-10 items-center justify-center text-sm font-bold text-[#f2f0ea]" style={{ background: `${theme.accent}22`, color: theme.accent }}>
                                                            {theme.short}
                                                        </span>
                                                        <span className="chip border-transparent bg-[#f2f0ea]/[0.06] text-[#f2f0ea]/70">
                                                            {stationCount} station{stationCount === 1 ? '' : 's'}
                                                        </span>
                                                    </div>
                                                    <div className="relative mt-4">
                                                        <div className="text-sm font-semibold text-[#f2f0ea]">{CONSOLE_LABELS[consoleType as keyof typeof CONSOLE_LABELS] || consoleType.toUpperCase()}</div>
                                                        <div className="mono mt-1 text-[11px] text-[var(--muted)]">Tap to add first line</div>
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

                                        return (
                                            <div
                                                key={item.id}
                                                className="space-y-3 rounded-[26px] border border-[#f2f0ea]/10 bg-[#111113] p-4"
                                            >
                                                {/* Header row */}
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-3">
                                                        <span className="rounded-full border border-[#f2f0ea]/10 bg-[#f2f0ea]/[0.04] px-2.5 py-1 text-[10px] smallcaps text-[var(--dim)]">
                                                            Item {index + 1}
                                                        </span>
                                                        <div>
                                                            <div className="text-sm font-semibold text-[#f2f0ea]">
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
                                                            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#f2f0ea]/10 text-[#f2f0ea]/40 transition-all duration-200 hover:border-[#ff5c2b]/30 hover:text-[#ff5c2b]"
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
                                                                    className={`relative overflow-hidden  border p-3 text-left transition-all duration-200 ${selected ? '' : HOVER_CARD_CLASS}`}
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
                                                                            <span className="flex h-9 w-9 items-center justify-center text-xs font-bold" style={{ background: `${t.accent}22`, color: t.accent }}>
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
                                                                            <div className="text-sm font-semibold text-[#f2f0ea]">
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

                                                {/* Players */}
                                                <div className={CONTROL_ROW_CLASS}>
                                                        <div className={CONTROL_LABEL_CLASS}>Players</div>
                                                        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                                                            {PLAYER_OPTIONS.map((players) => {
                                                                const selected = item.quantity === players;
                                                                return (
                                                                    <button
                                                                        key={players}
                                                                        type="button"
                                                                        onClick={() => updateItem(item.id, 'quantity', players)}
                                                                        className="py-2.5 font-mono text-[11px] tracking-[0.1em] transition-colors"
                                                                        style={{
                                                                            background: selected ? 'rgba(216,255,60,.12)' : 'transparent',
                                                                            border: selected ? '1px solid #d8ff3c' : '1px solid rgba(242,240,234,.14)',
                                                                            color: selected ? '#d8ff3c' : 'rgba(242,240,234,.5)',
                                                                        }}
                                                                    >
                                                                        {players}P
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                </div>

                                                {/* Duration */}
                                                <div className={CONTROL_ROW_CLASS}>
                                                    <div className={CONTROL_LABEL_CLASS}>Duration</div>
                                                    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
                                                        {DURATION_OPTIONS.map((dur) => {
                                                            const selected = item.duration === dur;
                                                            return (
                                                                <button
                                                                    key={dur}
                                                                    type="button"
                                                                    onClick={() => updateItem(item.id, 'duration', dur)}
                                                                    className=" py-3 text-sm font-bold transition-all duration-200"
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

                                                {/* Machine — only when one is being booked. Above that,
                                                    the booking needs several and the server picks them. */}
                                                {item.quantity === 1 && stationOptions(item.console).length > 0 && (
                                                    <div className={CONTROL_ROW_CLASS}>
                                                        <div className={CONTROL_LABEL_CLASS}>Machine</div>
                                                        <div className="grid grid-cols-3 gap-2 md:grid-cols-4 xl:grid-cols-6">
                                                            {[undefined, ...stationOptions(item.console)].map((station) => {
                                                                const selected = item.station === station;
                                                                return (
                                                                    <button
                                                                        key={station ?? 'any'}
                                                                        type="button"
                                                                        onClick={() => updateItem(item.id, 'station', station)}
                                                                        className=" py-3 text-xs font-bold uppercase tracking-wide transition-all duration-200"
                                                                        style={{
                                                                            background: selected ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.04)',
                                                                            border: selected ? '1.5px solid rgba(6,182,212,0.40)' : '1.5px solid rgba(255,255,255,0.07)',
                                                                            color: selected ? '#67e8f9' : '#64748b',
                                                                            boxShadow: selected ? '0 0 20px -6px rgba(6,182,212,0.5)' : 'none',
                                                                        }}
                                                                    >
                                                                        {station ?? 'Any'}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                        <div className="mono mt-2 text-[11px] text-[var(--muted)]">
                                                            Any picks the first machine free for this time. Choosing one
                                                            fails the booking rather than moving the customer if it is taken.
                                                        </div>
                                                    </div>
                                                )}

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
                                <div className="flex h-10 w-10 items-center justify-center bg-[#ff5c2b]/12 text-[#ff5c2b]">
                                    <Clock size={18} />
                                </div>
                                <div>
                                    <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-[#f2f0ea]/[0.42]">Summary</div>
                                    <h3 className="text-base font-semibold text-[#f2f0ea]">
                                        {isAdvanceMode ? 'Create payment link' : 'Collect payment'}
                                    </h3>
                                </div>
                            </div>

                            <div className={`${GAMING_SUMMARY_HERO_CLASS} p-5`}>
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <div className="text-[10px] smallcaps text-[#d8ff3c]/70">
                                            {isAdvanceMode ? 'Payable by customer' : 'Due now'}
                                        </div>
                                        <div className="mono mt-2 text-[2.15rem] font-semibold tracking-tight text-[#f2f0ea]">Rs.{totalAmount}</div>
                                        <p className="mt-2 text-sm text-[#d8ff3c]/70">
                                            {items.length > 0
                                                ? isAdvanceMode
                                                    ? `${items.length} booking line${items.length === 1 ? '' : 's'} ready for payment link`
                                                    : `${items.length} booking line${items.length === 1 ? '' : 's'} ready for checkout`
                                                : 'Add a setup to begin billing'}
                                        </p>
                                    </div>
                                    <span className="rounded-full border border-[#d8ff3c]/20 bg-[#d8ff3c]/10 px-3 py-1.5 text-xs font-semibold text-[#d8ff3c]">
                                        {(isAdvanceMode ? 'upi' : paymentMode).toUpperCase()}
                                    </span>
                                </div>
                                <div className="mt-4 grid grid-cols-2 gap-3">
                                    <div className={`${CONTROL_SURFACE_CLASS} px-3.5 py-3`}>
                                        <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-[#f2f0ea]/[0.42]">Calculated</div>
                                        <div className="mono mt-2 text-lg font-semibold text-[#f2f0ea]">Rs.{calculatedTotal}</div>
                                    </div>
                                    <div className={`${CONTROL_SURFACE_CLASS} px-3.5 py-3`}>
                                        <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-[#f2f0ea]/[0.42]">Payment mode</div>
                                        <div className="mt-2 text-lg font-semibold text-[#f2f0ea]">{isAdvanceMode ? 'UPI' : paymentMode === 'cash' ? 'Cash' : 'UPI'}</div>
                                    </div>
                                </div>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className={`${CONTROL_SURFACE_CLASS} focus-ring px-3.5 py-3 transition`}>
                                    <div className="mb-1.5 flex items-center gap-2 text-[10px] smallcaps text-[var(--dim)]">
                                        <CalendarDays size={13} className="text-[#f2f0ea]/40" />
                                        Date
                                    </div>
                                    <input
                                        type="date"
                                        value={bookingDate}
                                        onChange={(event) => setBookingDate(event.target.value)}
                                        className="w-full bg-transparent text-sm text-[#f2f0ea] focus:outline-none"
                                        style={{ colorScheme: 'dark' }}
                                    />
                                </label>
                                <label className={`${CONTROL_SURFACE_CLASS} focus-ring px-3.5 py-3 transition`}>
                                    <div className="mb-1.5 flex items-center gap-2 text-[10px] smallcaps text-[var(--dim)]">
                                        <Clock size={13} className="text-[#f2f0ea]/40" />
                                        Start Time
                                    </div>
                                    <input
                                        type="time"
                                        value={startTime}
                                        onChange={(event) => setStartTime(event.target.value)}
                                        className="mono w-full bg-transparent text-sm text-[#f2f0ea] focus:outline-none"
                                        style={{ colorScheme: 'dark' }}
                                    />
                                </label>
                            </div>

                            {items.length > 0 ? (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between gap-3 px-1">
                                        <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-[#f2f0ea]/[0.42]">Booking lines</div>
                                        <div className="text-[11px] font-medium text-[#d8ff3c]/80">Shared start {startTime || '--:--'}</div>
                                    </div>
                                    {items.map((item) => (
                                        <div key={item.id} className={`${CONTROL_SURFACE_CLASS} flex items-center justify-between gap-3 px-3.5 py-3`}>
                                            <div className="flex items-center gap-3">
                                                <span
                                                    className="flex h-10 w-10 shrink-0 items-center justify-center text-sm font-bold"
                                                    style={{
                                                        background: `${getConsoleTheme(item.console).accent}1a`,
                                                        color: getConsoleTheme(item.console).accent,
                                                    }}
                                                >
                                                    {getConsoleTheme(item.console).short}
                                                </span>
                                                <div>
                                                    <div className="text-sm font-medium text-[#f2f0ea]">
                                                        {CONSOLE_LABELS[item.console as keyof typeof CONSOLE_LABELS] || item.console.toUpperCase()}
                                                    </div>
                                                    <div className="text-[11px] text-[var(--muted)]">
                                                        {item.quantity} player{item.quantity === 1 ? '' : 's'} · {formatDurationLabel(item.duration)}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="mono text-sm font-semibold text-[#f2f0ea]">Rs.{item.price}</div>
                                                <div className="text-[11px] text-[var(--muted)]">Auto station</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className={`${CONTROL_SURFACE_CLASS}  px-4 py-6 text-center text-sm text-[var(--muted)]`}>
                                    Select a console to start building the booking.
                                </div>
                            )}

                            <div className={`${CONTROL_SURFACE_CLASS} rounded-[22px] p-4`}>
                                <div className="flex items-center justify-between gap-3">
                                    <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-[#f2f0ea]/[0.42]">Final amount</div>
                                    <span className="mono rounded-full bg-[#f2f0ea]/[0.04] px-3 py-1 text-xs text-[#f2f0ea]/70">Calc Rs.{calculatedTotal}</span>
                                </div>
                                <div className="mt-4 flex items-center justify-between gap-3">
                                    <span className="text-sm text-[var(--muted)]">Charge customer</span>
                                    <div className="flex items-center gap-2">
                                        <span className="mono text-sm text-[#f2f0ea]">Rs.</span>
                                        <input
                                            type="number"
                                            value={manualAmount !== null ? manualAmount : calculatedTotal}
                                            onChange={(event) => {
                                                const value = parseFloat(event.target.value) || 0;
                                                setManualAmount(value === calculatedTotal ? null : value);
                                            }}
                                            min={0}
                                            className="mono w-32 border border-white/[0.07] bg-[#f2f0ea]/[0.04] px-3 py-2 text-right text-lg font-semibold text-[#f2f0ea] focus:border-[#d8ff3c]/40 focus:outline-none"
                                        />
                                    </div>
                                </div>
                                {manualAmount !== null && manualAmount !== calculatedTotal && (
                                    <div className="mt-3 flex items-center justify-between text-xs">
                                        <span className="text-[#ff5c2b]">Manual override applied</span>
                                        <button type="button" onClick={resetManualAmount} className="text-[#f2f0ea]/50 underline transition hover:text-[#f2f0ea]">
                                            Reset
                                        </button>
                                    </div>
                                )}
                            </div>

                            {isAdvanceMode ? (
                                <div className=" border border-[#ff5c2b]/20 bg-[#ff5c2b]/10 p-4 text-[#ff5c2b]">
                                    <Smartphone className="mb-3 text-[#ff5c2b]" size={20} />
                                    <div className="text-sm font-semibold">UPI payment link</div>
                                    <div className="mt-1 text-xs text-[#ff5c2b]/70">
                                        Payment is locked to UPI. Share the generated link and confirm after checking Paytm Business.
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setPaymentMode('cash')}
                                        className={` border p-4 text-left transition-all duration-200 ${paymentMode === 'cash' ? 'border-[#d8ff3c]/30 bg-[#d8ff3c]/12 text-[#d8ff3c]' : 'text-[#f2f0ea]/70 hover:border-white/15'}`}
                                    >
                                        <Banknote className="mb-3" size={20} />
                                        <div className="text-sm font-semibold">Cash</div>
                                        <div className="mt-1 text-xs text-current/70">Collect directly at the counter</div>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPaymentMode('upi')}
                                        className={` border p-4 text-left transition-all duration-200 ${paymentMode === 'upi' ? 'border-[#d8ff3c]/30 bg-[#d8ff3c]/12 text-[#d8ff3c]' : 'text-[#f2f0ea]/70 hover:border-white/15'}`}
                                    >
                                        <Smartphone className="mb-3" size={20} />
                                        <div className="text-sm font-semibold">UPI</div>
                                        <div className="mt-1 text-xs text-current/70">Show the QR and collect instantly</div>
                                    </button>
                                </div>
                            )}

                            {!isAdvanceMode && paymentMode === 'upi' && totalAmount > 0 && !upiPayee && (
                                <p className=" border border-[#ff5c2b]/20 bg-[#ff5c2b]/[0.06] px-3 py-2 text-xs text-[#ff5c2b]">
                                    Add your UPI id under Payments to show a QR here. Until then, collect
                                    this one by cash or your own QR.
                                </p>
                            )}

                            {!isAdvanceMode && paymentMode === 'upi' && totalAmount > 0 && upiPayee && (
                                <div className="space-y-3 border border-[#d8ff3c]/15 bg-[#111113] px-4 py-4 text-center">
                                    <div className="flex items-center justify-between gap-3 text-left">
                                        <div>
                                            <div className="text-[10px] smallcaps text-[#d8ff3c]/70">UPI collect</div>
                                            <div className="text-sm font-semibold text-[#f2f0ea]">Scan and receive Rs.{totalAmount}</div>
                                        </div>
                                        <span className="rounded-full border border-[#d8ff3c]/20 bg-[#d8ff3c]/10 px-2.5 py-1 text-[11px] text-[#d8ff3c]">
                                            Tap QR
                                        </span>
                                    </div>
                                    <div
                                        className="inline-flex cursor-pointer bg-[#d4d4d4] p-3 transition"
                                        onClick={() => setQrExpanded((value) => !value)}
                                        title={qrExpanded ? 'Click to shrink' : 'Click to enlarge'}
                                    >
                                        <QRCodeSVG
                                            value={buildUpiPaymentUrl(upiPayee, totalAmount, 'walkin00', undefined)}
                                            size={qrExpanded ? 260 : 180}
                                            bgColor="#d4d4d4"
                                            fgColor="#111111"
                                            level="Q"
                                        />
                                    </div>
                                    <p className="text-xs text-[#f2f0ea]/50">
                                        Scan to pay <span className="font-semibold text-[#f2f0ea]">Rs.{totalAmount}</span> via UPI.
                                    </p>
                                </div>
                            )}

                            {formError && (
                                <p className=" border border-[#ff5c2b]/20 bg-[#ff5c2b]/10 px-3 py-2 text-sm text-[#ff5c2b]">{formError}</p>
                            )}

                            <Button
                                className="w-full justify-center py-3.5 text-base"
                                onClick={handleSubmit}
                                loading={submitting}
                                disabled={submitting || items.length === 0}
                            >
                                {submitting ? 'Creating...' : isAdvanceMode ? 'Create Payment Link' : 'Confirm Booking'}
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
                                    <div className="flex h-10 w-10 items-center justify-center bg-[#d8ff3c]/12 text-[#d8ff3c]">
                                        <Star size={18} />
                                    </div>
                                    <div>
                                        <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-[#f2f0ea]/[0.42]">Membership Cart</div>
                                        <h3 className="text-base font-semibold text-[#f2f0ea]">Select plans</h3>
                                    </div>
                                </div>
                                {membershipPlans.length > 0 && (
                                    <Button size="sm" variant="secondary" onClick={addMemItem} className="">
                                        <Plus size={14} /> Add Plan
                                    </Button>
                                )}
                            </div>

                            {membershipPlans.length === 0 ? (
                                <div className=" border border-dashed border-[#f2f0ea]/10 px-4 py-10 text-center">
                                    <p className="text-sm text-[#f2f0ea]/50">No membership plans configured.</p>
                                    <p className="mt-1 text-xs text-[#f2f0ea]/40">Add plans in the Memberships tab first.</p>
                                </div>
                            ) : memItems.length === 0 ? (
                                <div className={`${CONTROL_SURFACE_CLASS} p-3`}>
                                    <div className="mb-3 flex items-center justify-between gap-3 px-1">
                                        <div>
                                            <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-[#f2f0ea]/[0.42]">Available plans</div>
                                            <div className="text-sm font-medium text-[#f2f0ea]">Start the checkout with the plan you want to sell</div>
                                        </div>
                                        <span className="chip border-transparent bg-[#f2f0ea]/[0.05] text-[#f2f0ea]/70">
                                            {membershipPlans.length} plan{membershipPlans.length === 1 ? '' : 's'}
                                        </span>
                                    </div>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                    {membershipPlans.slice(0, 4).map((plan) => (
                                        <button
                                            key={plan.id}
                                            type="button"
                                            onClick={() => setMemItems([{ id: Math.random().toString(36).substr(2, 9), planId: plan.id, quantity: 1 }])}
                                            className={`${SUBPANEL_CLASS}  p-4 text-left ${HOVER_CARD_CLASS}`}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <span className="flex h-10 w-10 items-center justify-center bg-[#d8ff3c]/14 text-sm font-bold text-[#d8ff3c]">
                                                    {plan.console_type?.slice(0, 2).toUpperCase() || 'PL'}
                                                </span>
                                                <span className="chip border-transparent bg-[#d8ff3c]/12 text-[#d8ff3c]">
                                                    Rs.{plan.price}
                                                </span>
                                            </div>
                                            <div className="mt-4 text-sm font-semibold text-[#f2f0ea]">{plan.name}</div>
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
                                            <div key={item.id} className="rounded-[26px] border border-[#f2f0ea]/10 bg-[#111113] p-4">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0 flex-1">
                                                        <label className="mb-1.5 block text-[10px] smallcaps text-[var(--dim)]">Plan</label>
                                                        <select
                                                            value={item.planId}
                                                            onChange={(event) => updateMemItem(item.id, 'planId', event.target.value)}
                                                            className="w-full border border-white/[0.07] bg-[#f2f0ea]/[0.04] px-3 py-2.5 text-sm text-[#f2f0ea] focus:border-[#d8ff3c]/30 focus:outline-none"
                                                            style={{ colorScheme: 'dark' }}
                                                        >
                                                            {membershipPlans.map((option) => (
                                                                <option key={option.id} value={option.id} className="bg-[#11111a] text-[#f2f0ea]">
                                                                    {option.name}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        {plan && (
                                                            <div className="mt-2 flex flex-wrap gap-2">
                                                                <span className="chip border-transparent bg-[#f2f0ea]/[0.06] text-[#f2f0ea]/70">
                                                                    {plan.console_type?.toUpperCase()}
                                                                </span>
                                                                <span className="chip border-transparent bg-[#f2f0ea]/[0.06] text-[#f2f0ea]/70">
                                                                    {plan.plan_type === 'day_pass' ? 'Day pass' : `${plan.hours || 0}h`}
                                                                </span>
                                                                <span className="chip border-transparent bg-[#f2f0ea]/[0.06] text-[#f2f0ea]/70">
                                                                    {plan.validity_days} days
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={() => removeMemItem(item.id)}
                                                        className="flex h-8 w-8 items-center justify-center rounded-full border border-[#f2f0ea]/10 text-[#f2f0ea]/50 transition-all duration-200 hover:border-[#ff5c2b]/30 hover:text-[#ff5c2b]"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>

                                                <div className={`${CONTROL_SURFACE_CLASS} mt-4 flex items-center justify-between gap-3 px-3.5 py-3`}>
                                                    <div>
                                                        <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-[#f2f0ea]/[0.42]">Quantity</div>
                                                        <div className="mt-2 flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => updateMemItem(item.id, 'quantity', Math.max(1, item.quantity - 1))}
                                                            className="flex h-9 w-9 items-center justify-center text-[#f2f0ea] transition-all duration-200 hover:border-white/15"
                                                        >
                                                            -
                                                        </button>
                                                        <span className="mono w-10 text-center text-sm font-semibold text-[#f2f0ea]">{item.quantity}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => updateMemItem(item.id, 'quantity', Math.min(20, item.quantity + 1))}
                                                            className="flex h-9 w-9 items-center justify-center text-[#f2f0ea] transition-all duration-200 hover:border-white/15"
                                                        >
                                                            +
                                                        </button>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-[#f2f0ea]/[0.42]">Line total</div>
                                                        <div className="mono text-base font-semibold text-[#f2f0ea]">Rs.{lineTotal}</div>
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
                                <div className="flex h-10 w-10 items-center justify-center bg-[#d8ff3c]/12 text-[#d8ff3c]">
                                    <CreditCard size={18} />
                                </div>
                                <div>
                                    <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-[#f2f0ea]/[0.42]">Payment</div>
                                    <h3 className="text-base font-semibold text-[#f2f0ea]">Checkout plan</h3>
                                </div>
                            </div>

                            <div className={`${MEMBERSHIP_SUMMARY_HERO_CLASS} p-5`}>
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <div className="text-[10px] smallcaps text-[#d8ff3c]/70">Due now</div>
                                        <div className="mono mt-2 text-[2.15rem] font-semibold tracking-tight text-[#f2f0ea]">Rs.{memTotalAmount}</div>
                                        <p className="mt-2 text-sm text-[#d8ff3c]/70">
                                            {memItems.length > 0
                                                ? `${memItems.length} cart line${memItems.length === 1 ? '' : 's'} ready for checkout`
                                                : 'Add a membership plan to begin checkout'}
                                        </p>
                                    </div>
                                    <span className="rounded-full border border-[#d8ff3c]/20 bg-[#d8ff3c]/10 px-3 py-1.5 text-xs font-semibold text-[#d8ff3c]">
                                        {memPaymentMode.toUpperCase()}
                                    </span>
                                </div>
                                <div className="mt-4 grid grid-cols-2 gap-3">
                                    <div className={`${CONTROL_SURFACE_CLASS} px-3.5 py-3`}>
                                        <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-[#f2f0ea]/[0.42]">Calculated</div>
                                        <div className="mono mt-2 text-lg font-semibold text-[#f2f0ea]">Rs.{memCalculatedTotal}</div>
                                    </div>
                                    <div className={`${CONTROL_SURFACE_CLASS} px-3.5 py-3`}>
                                        <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-[#f2f0ea]/[0.42]">Payment mode</div>
                                        <div className="mt-2 text-lg font-semibold text-[#f2f0ea]">{memPaymentMode === 'cash' ? 'Cash' : 'UPI'}</div>
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
                                                <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-[#d8ff3c]/14 text-sm font-bold text-[#d8ff3c]">
                                                    {plan.console_type?.slice(0, 2).toUpperCase() || 'PL'}
                                                </span>
                                                <div>
                                                    <div className="text-sm font-medium text-[#f2f0ea]">{plan.name}</div>
                                                    <div className="text-[11px] text-[var(--muted)]">Qty {item.quantity}</div>
                                                </div>
                                            </div>
                                            <div className="mono text-sm font-semibold text-[#f2f0ea]">Rs.{plan.price * item.quantity}</div>
                                        </div>
                                    );
                                }) : (
                                    <div className={`${CONTROL_SURFACE_CLASS}  px-4 py-6 text-center text-sm text-[var(--muted)]`}>
                                        Select a plan to start the checkout.
                                    </div>
                                )}
                            </div>

                            <div className={`${CONTROL_SURFACE_CLASS} rounded-[22px] p-4`}>
                                <div className="flex items-center justify-between gap-3">
                                    <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-[#f2f0ea]/[0.42]">Final amount</div>
                                    <span className="mono rounded-full bg-[#f2f0ea]/[0.04] px-3 py-1 text-xs text-[#f2f0ea]/70">Calc Rs.{memCalculatedTotal}</span>
                                </div>
                                <div className="mt-4 flex items-center justify-between gap-3">
                                    <span className="text-sm text-[var(--muted)]">Charge customer</span>
                                    <div className="flex items-center gap-2">
                                        <span className="mono text-sm text-[#f2f0ea]">Rs.</span>
                                        <input
                                            type="number"
                                            value={memManualAmount !== null ? memManualAmount : memCalculatedTotal}
                                            onChange={(event) => {
                                                const value = toWholeRupees(parseFloat(event.target.value) || 0);
                                                setMemManualAmount(value === memCalculatedTotal ? null : value);
                                            }}
                                            min={0}
                                            step={1}
                                            className="mono w-32 border border-white/[0.07] bg-[#f2f0ea]/[0.04] px-3 py-2 text-right text-lg font-semibold text-[#f2f0ea] focus:border-[#d8ff3c]/30 focus:outline-none"
                                        />
                                    </div>
                                </div>
                                {memManualAmount !== null && memManualAmount !== memCalculatedTotal && (
                                    <div className="mt-3 flex items-center justify-between text-xs">
                                        <span className="text-[#ff5c2b]">Manual override applied</span>
                                        <button type="button" onClick={() => setMemManualAmount(null)} className="text-[#f2f0ea]/50 underline transition hover:text-[#f2f0ea]">
                                            Reset
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => setMemPaymentMode('cash')}
                                    className={` border p-4 text-left transition-all duration-200 ${memPaymentMode === 'cash' ? 'border-[#d8ff3c]/30 bg-[#d8ff3c]/12 text-[#d8ff3c]' : 'text-[#f2f0ea]/70 hover:border-white/15'}`}
                                >
                                    <Banknote className="mb-3" size={20} />
                                    <div className="text-sm font-semibold">Cash</div>
                                    <div className="mt-1 text-xs text-current/70">Collect directly at the counter</div>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMemPaymentMode('upi')}
                                    className={` border p-4 text-left transition-all duration-200 ${memPaymentMode === 'upi' ? 'border-[#d8ff3c]/30 bg-[#d8ff3c]/12 text-[#d8ff3c]' : 'text-[#f2f0ea]/70 hover:border-white/15'}`}
                                >
                                    <Smartphone className="mb-3" size={20} />
                                    <div className="text-sm font-semibold">UPI</div>
                                    <div className="mt-1 text-xs text-current/70">Show the QR and collect instantly</div>
                                </button>
                            </div>

                            {memPaymentMode === 'upi' && memTotalAmount > 0 && !upiPayee && (
                                <p className=" border border-[#ff5c2b]/20 bg-[#ff5c2b]/[0.06] px-3 py-2 text-xs text-[#ff5c2b]">
                                    Add your UPI id under Payments to show a QR here.
                                </p>
                            )}

                            {memPaymentMode === 'upi' && memTotalAmount > 0 && upiPayee && (
                                <div className="space-y-3 border border-[#d8ff3c]/15 bg-[#111113] px-4 py-4 text-center">
                                    <div className="flex items-center justify-between gap-3 text-left">
                                        <div>
                                            <div className="text-[10px] smallcaps text-[#d8ff3c]/70">UPI collect</div>
                                            <div className="text-sm font-semibold text-[#f2f0ea]">Scan and receive Rs.{memTotalAmount}</div>
                                        </div>
                                        <span className="rounded-full border border-[#d8ff3c]/20 bg-[#d8ff3c]/10 px-2.5 py-1 text-[11px] text-[#d8ff3c]">
                                            Tap QR
                                        </span>
                                    </div>
                                    <div
                                        className="inline-flex cursor-pointer bg-[#d4d4d4] p-3 transition"
                                        onClick={() => setQrExpanded((value) => !value)}
                                        title={qrExpanded ? 'Click to shrink' : 'Click to enlarge'}
                                    >
                                        <QRCodeSVG
                                            value={buildUpiPaymentUrl(upiPayee, memTotalAmount, 'membrshp', undefined)}
                                            size={qrExpanded ? 260 : 180}
                                            bgColor="#d4d4d4"
                                            fgColor="#111111"
                                            level="Q"
                                        />
                                    </div>
                                    <p className="text-xs text-[#f2f0ea]/50">
                                        Scan to pay <span className="font-semibold text-[#f2f0ea]">Rs.{memTotalAmount}</span> via UPI.
                                    </p>
                                </div>
                            )}

                            {formError && (
                                <p className=" border border-[#ff5c2b]/20 bg-[#ff5c2b]/10 px-3 py-2 text-sm text-[#ff5c2b]">{formError}</p>
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
            {isMobile && isGamingFlow && !lastBooking && items.length > 0 && (
                <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center gap-3 border-t border-[#f2f0ea]/10 bg-[#0d0d14]/95 px-4 py-3 backdrop-blur-md">
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-[#f2f0ea]/40 font-medium">Total</p>
                        <p className="text-xl font-bold text-[#f2f0ea] leading-none">₹{totalAmount}</p>
                    </div>
                    <div className="flex gap-2">
                        {isAdvanceMode ? (
                            <span className=" border border-[#ff5c2b]/30 bg-[#ff5c2b]/15 px-3 py-2 text-sm font-semibold text-[#ff5c2b]">
                                UPI
                            </span>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setPaymentMode(paymentMode === 'cash' ? 'upi' : 'cash')}
                                className={` border px-3 py-2 text-sm font-semibold transition-colors ${paymentMode === 'cash' ? 'border-[#d8ff3c]/30 bg-[#d8ff3c]/15 text-[#d8ff3c]' : 'border-[#d8ff3c]/30 bg-[#d8ff3c]/15 text-[#d8ff3c]'}`}
                            >
                                {paymentMode === 'cash' ? 'Cash' : 'UPI'}
                            </button>
                        )}
                        <Button
                            onClick={handleSubmit}
                            loading={submitting}
                            disabled={submitting}
                            className="px-5 py-2 text-sm font-bold"
                        >
                            {isAdvanceMode ? 'Create link' : 'Confirm'}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
