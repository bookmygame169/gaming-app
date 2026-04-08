'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { CONSOLE_LABELS } from '@/lib/constants';
import { dedupeStationPricingRows, formatStationOptionLabel, normaliseStationName } from '@/lib/stationNames';
import { Card, Button, Input, Select, StatusBadge, LoadingSpinner } from './ui';
import {
    User, Smartphone, Calendar, Clock, Plus, Trash2, X,
    CreditCard, Banknote, CheckCircle, AlertCircle, Search, Star
} from 'lucide-react';
import { CafeRow } from '@/types/database';

import { getLocalDateString, normaliseConsoleType, buildWhatsAppUrl, buildBookingTicketMessage } from '../utils';
import { calcBillingPrice } from '../utils/pricing';

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
    pricingData?: Record<string, any>;   // consolePricing[cafeId]
    stationPricingList?: any[];           // Object.values(stationPricing)
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

export function Billing({ cafeId, cafes, isMobile = false, onSuccess, onMembershipSuccess, pricingData, stationPricingList, membershipPlans = [] }: BillingProps) {
    // Mode: 'gaming' | 'membership'
    const [mode, setMode] = useState<'gaming' | 'membership'>('gaming');

    // Membership cart state
    type MemItem = { id: string; planId: string; quantity: number };
    const [memItems, setMemItems] = useState<MemItem[]>([]);
    const [memManualAmount, setMemManualAmount] = useState<number | null>(null);
    const [memPaymentMode, setMemPaymentMode] = useState<'cash' | 'upi'>('cash');
    const [memSubmitting, setMemSubmitting] = useState(false);

    // Shared customer state
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [bookingDate, setBookingDate] = useState(getLocalDateString());
    const [startTime, setStartTime] = useState('');
    const [items, setItems] = useState<BillingItem[]>([]);
    const [paymentMode, setPaymentMode] = useState<'cash' | 'upi'>('cash');
    const [manualAmount, setManualAmount] = useState<number | null>(null);
    const [submitting, setSubmitting] = useState(false);

    // After a successful gaming booking, store details to show a WhatsApp send option
    type LastBooking = {
        name: string; phone: string; date: string; time: string;
        duration: number; itemsLabel: string; amount: number;
        paymentMode: string; cafeName: string;
    };
    const [lastBooking, setLastBooking] = useState<LastBooking | null>(null);

    // Data State — seeded from props, avoids direct Supabase calls on ISP-blocked networks
    const [pricing, setPricing] = useState<any>(pricingData || null);
    const [stationPricingData, setStationPricingData] = useState<any[]>(stationPricingList || []);
    const [availableConsoles, setAvailableConsoles] = useState<string[]>([]);

    // Autocomplete State
    const [suggestions, setSuggestions] = useState<CustomerSuggestion[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const normalizedStationPricing = useMemo(
        () => dedupeStationPricingRows((stationPricingData || []) as StationPricingRecord[]),
        [stationPricingData]
    );

    // Station options per console type (e.g. ps5 → ['ps5-01','ps5-02'])
    const stationOptions = (consoleType: string): string[] => {
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
            steering: (currentCafe as any).steering_wheel_count || 0,
            racing_sim: (currentCafe as any).racing_sim_count || 0,
        };
        const count = countMap[normalizedConsoleType] || 0;
        return Array.from({ length: count }, (_, i) => `${normalizedConsoleType}-${String(i + 1).padStart(2, '0')}`);
    };

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
                { id: 'racing_sim', count: (currentCafe as any).racing_sim_count },
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

    const getEffectiveStationName = (consoleType: string, stationName?: string) => {
        if (stationName) return normaliseStationName(stationName);
        return stationOptions(consoleType)[0];
    };

    const canPickSingleStation = (consoleType: string, quantity: number) => {
        const normalizedConsoleType = normaliseConsoleType(consoleType);
        return quantity <= 1 || ['ps5', 'ps4', 'xbox'].includes(normalizedConsoleType);
    };

    const calculatePrice = (type: string, qty: number, duration: number, stationName?: string) =>
        calcBillingPrice(type, qty, duration, cafeId, consolePricingMap, stationPricingMap, {
            stationName: getEffectiveStationName(type, stationName),
        });

    useEffect(() => {
        setItems(prevItems => prevItems.map(item => {
            const nextPrice = calculatePrice(item.console, item.quantity, item.duration, item.station);

            return nextPrice === item.price ? item : { ...item, price: nextPrice };
        }));
    }, [cafeId, consolePricingMap, stationPricingMap]);

    // Clear pending autocomplete timeout on unmount
    useEffect(() => {
        return () => {
            if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        };
    }, []);

    // Customer Autocomplete — debounced server-side search (no load-all)
    const searchCustomers = (query: string, field: 'name' | 'phone') => {
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        if (query.length < 2) { setSuggestions([]); setShowSuggestions(false); return; }
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
        const defaultType = availableConsoles[0];
        const defaultQty = 1;
        const defaultDur = 60;

        const newItem: BillingItem = {
            id: Math.random().toString(36).substr(2, 9),
            console: defaultType,
            quantity: defaultQty,
            duration: defaultDur,
            price: calculatePrice(defaultType, defaultQty, defaultDur)
        };
        setItems([...items, newItem]);
    };

    const updateItem = (id: string, field: keyof BillingItem, value: any) => {
        setItems(items.map(item => {
            if (item.id === id) {
                const nextValue = field === 'station'
                    ? (value ? normaliseStationName(String(value)) : undefined)
                    : value;
                const updated = { ...item, [field]: nextValue };

                if (field === 'console' && updated.station && !stationOptions(String(value)).includes(updated.station)) {
                    updated.station = undefined;
                }

                if (
                    ['console', 'quantity'].includes(field) &&
                    updated.station &&
                    !canPickSingleStation(updated.console, updated.quantity)
                ) {
                    updated.station = undefined;
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

    const handleSubmit = async () => {
        if (!customerName || !startTime || items.length === 0) {
            alert('Please fill all required fields');
            return;
        }

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
                        status: 'in-progress',
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
            if (onSuccess) onSuccess();

        } catch (error: any) {
            console.error('Booking failed:', error);
            alert('Failed to create booking: ' + error.message);
        } finally {
            setSubmitting(false);
        }
    };

    // Membership cart helpers
    const addMemItem = () => {
        if (membershipPlans.length === 0) return;
        setMemItems(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), planId: membershipPlans[0].id, quantity: 1 }]);
    };
    const updateMemItem = (id: string, field: 'planId' | 'quantity', value: any) => {
        setMemItems(prev => prev.map(mi => mi.id === id ? { ...mi, [field]: value } : mi));
    };
    const removeMemItem = (id: string) => setMemItems(prev => prev.filter(mi => mi.id !== id));

    const memCalculatedTotal = memItems.reduce((sum, mi) => {
        const plan = membershipPlans.find(p => p.id === mi.planId);
        return sum + (plan ? plan.price * mi.quantity : 0);
    }, 0);
    const memTotalAmount = memManualAmount !== null ? memManualAmount : memCalculatedTotal;

    const handleMemSubmit = async () => {
        if (!customerName.trim()) { alert('Customer name is required'); return; }
        if (!customerPhone.trim()) { alert('Phone number is required'); return; }
        if (!/^\+?\d[\d\s\-()]{7,14}$/.test(customerPhone.trim())) { alert('Invalid phone number'); return; }
        if (memItems.length === 0) { alert('Please add at least one membership plan'); return; }

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
            alert('Membership added successfully!');
            if (onMembershipSuccess) onMembershipSuccess();
            else if (onSuccess) onSuccess();
        } catch (err: any) {
            alert('Failed to add membership: ' + err.message);
        } finally {
            setMemSubmitting(false);
        }
    };

    // Shared customer info card used in both modes
    const customerInfoCard = (
        <Card className="space-y-4 overflow-visible relative z-10">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <User className="text-blue-500" size={20} /> Customer Info
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="relative z-20">
                    <Input
                        label="Name"
                        value={customerName}
                        onChange={(val) => { setCustomerName(val); searchCustomers(val, 'name'); }}
                        placeholder="Enter customer name"
                    />
                    {showSuggestions && suggestions.length > 0 && (
                        <>
                            <div
                                className="fixed inset-0 z-40"
                                onClick={() => setShowSuggestions(false)}
                            />
                            <div className="absolute top-full mt-1 left-0 w-full z-50 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto">
                                {suggestions.map((s, idx) => (
                                    <div
                                        key={idx}
                                        onClick={() => {
                                            setCustomerName(s.name);
                                            setCustomerPhone(s.phone);
                                            setShowSuggestions(false);
                                        }}
                                        className="px-4 py-3 hover:bg-slate-700/50 cursor-pointer border-b border-slate-700/50 last:border-0"
                                    >
                                        <div className="font-medium text-white">{s.name}</div>
                                        <div className="text-xs text-slate-400">{s.phone}</div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
                <Input
                    label={mode === 'membership' ? 'Phone (Required)' : 'Phone (Optional)'}
                    value={customerPhone}
                    onChange={setCustomerPhone}
                    placeholder="Enter phone number"
                    type="tel"
                />
            </div>
        </Card>
    );

    return (
        <div className={`space-y-6 ${isMobile ? 'pb-20' : ''}`}>
            {/* Mode Toggle */}
            <div className="flex rounded-xl overflow-hidden border border-slate-800 w-fit">
                <button
                    onClick={() => setMode('gaming')}
                    className={`px-5 py-2.5 text-sm font-medium flex items-center gap-2 transition-all ${
                        mode === 'gaming'
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-900 text-slate-400 hover:text-white'
                    }`}
                >
                    <Smartphone size={15} /> Gaming Session
                </button>
                <button
                    onClick={() => setMode('membership')}
                    className={`px-5 py-2.5 text-sm font-medium flex items-center gap-2 transition-all ${
                        mode === 'membership'
                            ? 'bg-purple-600 text-white'
                            : 'bg-slate-900 text-slate-400 hover:text-white'
                    }`}
                >
                    <Star size={15} /> Membership
                </button>
            </div>

            {mode === 'gaming' && lastBooking ? (
                /* ── SUCCESS / WHATSAPP CARD ── */
                <div className="rounded-2xl bg-emerald-500/8 border border-emerald-500/30 p-6 space-y-5">
                    <div className="flex items-center gap-3">
                        <CheckCircle className="text-emerald-400 shrink-0" size={28} />
                        <div>
                            <h3 className="text-lg font-bold text-white">Booking Confirmed!</h3>
                            <p className="text-sm text-emerald-400">{lastBooking.name}</p>
                        </div>
                    </div>
                    <div className="bg-slate-900/70 rounded-xl p-4 space-y-2 text-sm">
                        {lastBooking.cafeName && (
                            <div className="flex justify-between"><span className="text-slate-400">Cafe</span><span className="text-white font-medium">{lastBooking.cafeName}</span></div>
                        )}
                        <div className="flex justify-between"><span className="text-slate-400">Date</span><span className="text-white">{lastBooking.date}</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Time</span><span className="text-white">{lastBooking.time} ({lastBooking.duration} min)</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Console</span><span className="text-white">{lastBooking.itemsLabel}</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Amount</span><span className="text-emerald-400 font-bold">₹{lastBooking.amount} ({lastBooking.paymentMode})</span></div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3">
                        {lastBooking.phone ? (
                            <a
                                href={buildWhatsAppUrl(lastBooking.phone, buildBookingTicketMessage(lastBooking))}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-[#25D366] hover:bg-[#20b558] text-white rounded-xl font-semibold transition-colors"
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                Send Ticket on WhatsApp
                            </a>
                        ) : (
                            <div className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 rounded-xl text-slate-500 text-sm">
                                No phone — can&apos;t send WhatsApp
                            </div>
                        )}
                        <button
                            onClick={() => setLastBooking(null)}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-semibold transition-colors"
                        >
                            + New Booking
                        </button>
                    </div>
                </div>
            ) : mode === 'gaming' ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column: Form */}
                    <div className="lg:col-span-2 space-y-6">
                        {customerInfoCard}

                        {/* Booking Items */}
                        <Card className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                    <Smartphone className="text-purple-500" size={20} /> Stations
                                </h3>
                                {items.length > 0 && (
                                    <Button size="sm" variant="secondary" onClick={addItem}>
                                        <Plus size={16} className="mr-1" /> Add Station
                                    </Button>
                                )}
                            </div>

                            {items.length === 0 ? (
                                <div className="py-8 text-center border-2 border-dashed border-slate-800 rounded-xl">
                                    <p className="text-slate-500 mb-4">No stations added yet</p>
                                    <Button size="sm" onClick={addItem}>Add First Station</Button>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {items.map((item) => (
                                        <div key={item.id} className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl relative group transition-all hover:border-slate-700">
                                            <button
                                                onClick={() => removeItem(item.id)}
                                                className="absolute -top-2 -right-2 w-6 h-6 bg-slate-800 text-slate-400 hover:text-red-400 rounded-full flex items-center justify-center border border-slate-700 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <Trash2 size={12} />
                                            </button>

                                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                                <Select
                                                    label="Console"
                                                    value={item.console}
                                                    options={availableConsoles.map(c => ({ value: c, label: CONSOLE_LABELS[c as keyof typeof CONSOLE_LABELS] || c }))}
                                                    onChange={(val) => updateItem(item.id, 'console', val)}
                                                />
                                                <Select
                                                    label="Station"
                                                    value={item.station || ''}
                                                    options={[{ value: '', label: 'Any' }, ...stationOptions(item.console).map(s => ({ value: s, label: formatStationOptionLabel(s) }))]}
                                                    onChange={(val) => updateItem(item.id, 'station', val)}
                                                    disabled={!canPickSingleStation(item.console, item.quantity)}
                                                />
                                                <Select
                                                    label="Players"
                                                    value={String(item.quantity || 1)}
                                                    options={[
                                                        { value: '1', label: '1 Player' },
                                                        { value: '2', label: '2 Players' },
                                                        { value: '3', label: '3 Players' },
                                                        { value: '4', label: '4 Players' },
                                                    ]}
                                                    onChange={(val) => updateItem(item.id, 'quantity', parseInt(val))}
                                                />
                                                <Select
                                                    label="Duration"
                                                    value={String(item.duration)}
                                                    options={[
                                                        { value: '30', label: '30 Mins' },
                                                        { value: '60', label: '1 Hour' },
                                                        { value: '90', label: '1.5 Hours' },
                                                        { value: '120', label: '2 Hours' },
                                                        { value: '180', label: '3 Hours' },
                                                    ]}
                                                    onChange={(val) => updateItem(item.id, 'duration', parseInt(val))}
                                                />
                                                <div className="flex flex-col justify-end">
                                                    <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-right">
                                                        <div className="text-xs text-slate-500 mb-0.5">Price</div>
                                                        <div className="text-emerald-400 font-bold font-mono">₹{item.price}</div>
                                                    </div>
                                                </div>
                                            </div>
                                            {!canPickSingleStation(item.console, item.quantity) && (
                                                <p className="mt-2 text-xs text-slate-500">
                                                    Multiple units will be auto-assigned to separate stations.
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card>
                    </div>

                    {/* Right Column: Summary & Payment */}
                    <div className="lg:col-span-1 space-y-6">
                        <Card className="sticky top-6 space-y-4">
                            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                <Clock className="text-orange-500" size={20} /> Summary
                            </h3>

                            <div className="bg-slate-900/50 rounded-xl p-4 space-y-4">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-slate-400">Date</span>
                                    <input
                                        type="date"
                                        className="bg-transparent text-white text-right outline-none focus:text-blue-400"
                                        value={bookingDate}
                                        onChange={(e) => setBookingDate(e.target.value)}
                                    />
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-slate-400">Start Time</span>
                                    <input
                                        type="time"
                                        className="bg-transparent text-white text-right outline-none focus:text-blue-400"
                                        value={startTime}
                                        onChange={(e) => setStartTime(e.target.value)}
                                    />
                                </div>
                                <div className="border-t border-slate-800 my-2"></div>
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-slate-400">Calculated</span>
                                        <span className="text-sm text-slate-500">₹{calculatedTotal}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-slate-400">Final Amount</span>
                                        <div className="flex items-center gap-1">
                                            <span className="text-white">₹</span>
                                            <input
                                                type="number"
                                                className="w-24 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xl font-bold text-white text-right outline-none focus:border-emerald-500 transition-colors"
                                                value={manualAmount !== null ? manualAmount : calculatedTotal}
                                                onChange={(e) => {
                                                    const val = parseFloat(e.target.value) || 0;
                                                    setManualAmount(val === calculatedTotal ? null : val);
                                                }}
                                                min={0}
                                            />
                                        </div>
                                    </div>
                                    {manualAmount !== null && manualAmount !== calculatedTotal && (
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-amber-400">Manual override applied</span>
                                            <button
                                                onClick={resetManualAmount}
                                                className="text-slate-400 hover:text-white underline"
                                            >
                                                Reset
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        onClick={() => setPaymentMode('cash')}
                                        className={`
                                            p-4 rounded-xl border flex flex-col items-center gap-2 transition-all
                                            ${paymentMode === 'cash'
                                                ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500'
                                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'}
                                        `}
                                    >
                                        <Banknote size={24} />
                                        <span className="text-sm font-semibold">Cash</span>
                                    </button>
                                    <button
                                        onClick={() => setPaymentMode('upi')}
                                        className={`
                                            p-4 rounded-xl border flex flex-col items-center gap-2 transition-all
                                            ${paymentMode === 'upi'
                                                ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500'
                                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'}
                                        `}
                                    >
                                        <Smartphone size={24} />
                                        <span className="text-sm font-semibold">UPI</span>
                                    </button>
                                </div>

                                <Button
                                    className="w-full py-4 text-lg"
                                    onClick={handleSubmit}
                                    loading={submitting}
                                    disabled={items.length === 0}
                                >
                                    Confirm Booking
                                </Button>
                            </div>
                        </Card>
                    </div>
                </div>
            ) : (
                /* Membership Mode */
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-6">
                        {customerInfoCard}

                        {/* Membership Cart */}
                        <Card className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                    <Star className="text-purple-400" size={20} /> Plans
                                </h3>
                                {memItems.length > 0 && (
                                    <Button size="sm" variant="secondary" onClick={addMemItem}>
                                        <Plus size={16} className="mr-1" /> Add Plan
                                    </Button>
                                )}
                            </div>
                            {membershipPlans.length === 0 ? (
                                <div className="py-8 text-center border-2 border-dashed border-slate-800 rounded-xl">
                                    <p className="text-slate-500">No membership plans configured.</p>
                                    <p className="text-slate-600 text-sm mt-1">Add plans in the Memberships tab first.</p>
                                </div>
                            ) : memItems.length === 0 ? (
                                <div className="py-8 text-center border-2 border-dashed border-slate-800 rounded-xl">
                                    <p className="text-slate-500 mb-4">No plans added yet</p>
                                    <Button size="sm" onClick={addMemItem}>Add First Plan</Button>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {memItems.map((mi) => {
                                        const plan = membershipPlans.find(p => p.id === mi.planId);
                                        const lineTotal = plan ? plan.price * mi.quantity : 0;
                                        return (
                                            <div key={mi.id} className="flex items-center gap-3 p-3 bg-slate-900/60 border border-slate-800 rounded-xl group hover:border-purple-500/40 transition-all">
                                                {/* Icon */}
                                                <div className="w-9 h-9 rounded-lg bg-purple-600/20 border border-purple-500/20 flex items-center justify-center flex-shrink-0">
                                                    <Star size={15} className="text-purple-400" />
                                                </div>

                                                {/* Plan selector + meta */}
                                                <div className="flex-1 min-w-0">
                                                    <select
                                                        value={mi.planId}
                                                        onChange={(e) => updateMemItem(mi.id, 'planId', e.target.value)}
                                                        className="bg-transparent text-white font-semibold text-sm w-full outline-none cursor-pointer appearance-none truncate"
                                                    >
                                                        {membershipPlans.map(p => (
                                                            <option key={p.id} value={p.id} className="bg-slate-800 text-white">
                                                                {p.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    {plan && (
                                                        <div className="flex items-center gap-1.5 mt-0.5">
                                                            <span className="text-xs bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-medium">
                                                                {plan.console_type?.toUpperCase()}
                                                            </span>
                                                            <span className="text-xs text-slate-500">
                                                                {plan.plan_type === 'day_pass' ? 'Day Pass' : `${plan.hours}h`} · {plan.validity_days}d
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Qty +/− */}
                                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                                    <button
                                                        onClick={() => updateMemItem(mi.id, 'quantity', Math.max(1, mi.quantity - 1))}
                                                        className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors font-bold text-base leading-none"
                                                    >−</button>
                                                    <span className="text-white font-semibold w-6 text-center text-sm">{mi.quantity}</span>
                                                    <button
                                                        onClick={() => updateMemItem(mi.id, 'quantity', Math.min(20, mi.quantity + 1))}
                                                        className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors font-bold text-base leading-none"
                                                    >+</button>
                                                </div>

                                                {/* Price */}
                                                <div className="text-right flex-shrink-0 min-w-[56px]">
                                                    <div className="text-emerald-400 font-bold font-mono">₹{lineTotal}</div>
                                                    {mi.quantity > 1 && plan && (
                                                        <div className="text-xs text-slate-600">₹{plan.price} ea</div>
                                                    )}
                                                </div>

                                                {/* Remove */}
                                                <button
                                                    onClick={() => removeMemItem(mi.id)}
                                                    className="text-slate-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 ml-1"
                                                >
                                                    <X size={15} />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </Card>
                    </div>

                    {/* Right: Payment summary */}
                    <div className="lg:col-span-1 space-y-6">
                        <Card className="sticky top-6 space-y-4">
                            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                <CreditCard className="text-purple-400" size={20} /> Payment
                            </h3>

                            <div className="bg-slate-900/50 rounded-xl p-4 space-y-3">
                                {memItems.map((mi) => {
                                    const plan = membershipPlans.find(p => p.id === mi.planId);
                                    if (!plan) return null;
                                    return (
                                        <div key={mi.id} className="flex items-center justify-between text-sm">
                                            <span className="text-slate-400">{plan.name} × {mi.quantity}</span>
                                            <span className="text-white font-mono">₹{plan.price * mi.quantity}</span>
                                        </div>
                                    );
                                })}
                                {memItems.length > 0 && <div className="border-t border-slate-800 pt-2" />}
                                <div className="flex items-center justify-between">
                                    <span className="text-slate-400 text-sm">Calculated</span>
                                    <span className="text-slate-500 font-mono text-sm">₹{memCalculatedTotal}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-slate-400 text-sm">Final Amount</span>
                                    <div className="flex items-center gap-1">
                                        <span className="text-white">₹</span>
                                        <input
                                            type="number"
                                            className="w-24 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xl font-bold text-white text-right outline-none focus:border-purple-500 transition-colors"
                                            value={memManualAmount !== null ? memManualAmount : memCalculatedTotal}
                                            onChange={(e) => {
                                                const val = parseFloat(e.target.value) || 0;
                                                setMemManualAmount(val === memCalculatedTotal ? null : val);
                                            }}
                                            min={0}
                                        />
                                    </div>
                                </div>
                                {memManualAmount !== null && memManualAmount !== memCalculatedTotal && (
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-amber-400">Manual override applied</span>
                                        <button onClick={() => setMemManualAmount(null)} className="text-slate-400 hover:text-white underline">Reset</button>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => setMemPaymentMode('cash')}
                                    className={`p-4 rounded-xl border flex flex-col items-center gap-2 transition-all ${
                                        memPaymentMode === 'cash'
                                            ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500'
                                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                                    }`}
                                >
                                    <Banknote size={24} />
                                    <span className="text-sm font-semibold">Cash</span>
                                </button>
                                <button
                                    onClick={() => setMemPaymentMode('upi')}
                                    className={`p-4 rounded-xl border flex flex-col items-center gap-2 transition-all ${
                                        memPaymentMode === 'upi'
                                            ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500'
                                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                                    }`}
                                >
                                    <Smartphone size={24} />
                                    <span className="text-sm font-semibold">UPI</span>
                                </button>
                            </div>

                            <Button
                                className="w-full py-4 text-lg"
                                onClick={handleMemSubmit}
                                loading={memSubmitting}
                                disabled={memItems.length === 0 || !customerName.trim() || !customerPhone.trim()}
                            >
                                Add Membership
                            </Button>
                        </Card>
                    </div>
                </div>
            )}
        </div>
    );
}
