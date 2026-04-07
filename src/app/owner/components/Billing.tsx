'use client';

import { useState, useEffect, useRef } from 'react';
import { CONSOLE_LABELS } from '@/lib/constants';
import { Card, Button, Input, Select, StatusBadge, LoadingSpinner } from './ui';
import {
    User, Smartphone, Calendar, Clock, Plus, Trash2, X,
    CreditCard, Banknote, CheckCircle, AlertCircle, Search, Star
} from 'lucide-react';
import { CafeRow } from '@/types/database';

import { getLocalDateString } from '../utils';

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

    // Data State — seeded from props, avoids direct Supabase calls on ISP-blocked networks
    const [pricing, setPricing] = useState<any>(pricingData || null);
    const [stationPricingData, setStationPricingData] = useState<any[]>(stationPricingList || []);
    const [availableConsoles, setAvailableConsoles] = useState<string[]>([]);

    // Autocomplete State
    const [suggestions, setSuggestions] = useState<CustomerSuggestion[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Station options per console type (e.g. ps5 → ['ps5-01','ps5-02'])
    const stationOptions = (consoleType: string): string[] => {
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
        const count = countMap[consoleType.toLowerCase()] || 0;
        return Array.from({ length: count }, (_, i) => `${consoleType}-${String(i + 1).padStart(2, '0')}`);
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
        if (pricingData) setPricing(pricingData);
    }, [pricingData]);

    useEffect(() => {
        if (stationPricingList) setStationPricingData(stationPricingList);
    }, [stationPricingList]);

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

    // Pricing Helper
    const calculatePrice = (type: string, qty: number, duration: number) => {
        // Map app console types to DB types if needed (e.g. steering -> steering_wheel)
        const dbType = type === 'steering' ? 'steering_wheel' : type;
        const tier = pricing?.[dbType];

        // Per-station console types (pricing is per station, not per controller group)
        const perStationTypes = ['pc', 'vr', 'steering_wheel', 'steering', 'racing_sim', 'arcade'];
        const isPerStation = perStationTypes.includes(type.toLowerCase()) || perStationTypes.includes(dbType.toLowerCase());

        // Try console_pricing first (tier-based)
        if (tier) {
            if (duration === 90) {
                const p60 = tier[`qty${qty}_60min`] || (isPerStation ? (tier['qty1_60min'] || 0) * qty : 0);
                const p30 = tier[`qty${qty}_30min`] || (isPerStation ? (tier['qty1_30min'] || 0) * qty : 0);
                return p60 + p30;
            }

            const exactKey = `qty${qty}_${duration}min`;
            if (tier[exactKey]) return tier[exactKey];

            if (isPerStation && qty > 1) {
                const baseKey = `qty1_${duration}min`;
                if (tier[baseKey]) return tier[baseKey] * qty;
            }

            if (duration === 120) {
                const base = tier[`qty${qty}_60min`] || (isPerStation ? (tier['qty1_60min'] || 0) * qty : 0);
                if (base > 0) return base * 2;
            }
            if (duration === 180) {
                const base = tier[`qty${qty}_60min`] || (isPerStation ? (tier['qty1_60min'] || 0) * qty : 0);
                if (base > 0) return base * 3;
            }

            // If tier exists and has a value, return it
            const anyKey = Object.keys(tier).find(k => tier[k] > 0);
            if (anyKey) return 0; // tier exists but no matching duration
        }

        // Fallback: try station_pricing
        const stationTypeMap: Record<string, string> = {
            'ps5': 'PS5', 'ps4': 'PS4', 'xbox': 'Xbox', 'pc': 'PC',
            'pool': 'Pool', 'snooker': 'Snooker', 'arcade': 'Arcade',
            'vr': 'VR', 'steering': 'Steering Wheel', 'steering_wheel': 'Steering Wheel',
            'racing_sim': 'Racing Sim',
        };
        const stationType = stationTypeMap[type] || type;
        const station = stationPricingData.find((sp: any) => sp.station_type === stationType);

        if (station) {
            const halfHour = station.half_hour_rate || 0;
            const fullHour = station.hourly_rate || 0;

            if (duration === 30) return halfHour * qty;
            if (duration === 60) return fullHour * qty;
            if (duration === 90) return (halfHour + fullHour) * qty;
            if (duration === 120) return fullHour * 2 * qty;
            if (duration === 180) return fullHour * 3 * qty;
        }

        return 0;
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
                const updated = { ...item, [field]: value };
                if (['console', 'quantity', 'duration'].includes(field)) {
                    updated.price = calculatePrice(updated.console, updated.quantity, updated.duration);
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
            const [hours, mins] = startTime.split(':').map(Number);
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

            setCustomerName('');
            setCustomerPhone('');
            setItems([]);
            if (onSuccess) onSuccess();
            alert('Booking created successfully!');

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
        if (memItems.length === 0) { alert('Please add at least one membership plan'); return; }

        setMemSubmitting(true);
        try {
            const now = new Date();
            const hours = now.getHours();
            const mins = now.getMinutes();
            const period = hours >= 12 ? 'pm' : 'am';
            const h12 = hours % 12 || 12;
            const startTime12h = `${h12}:${mins.toString().padStart(2, '0')} ${period}`;
            const todayStr = getLocalDateString();

            // Create all subscriptions sequentially (one per item × quantity)
            for (const mi of memItems) {
                const plan = membershipPlans.find(p => p.id === mi.planId);
                if (!plan) continue;
                const itemTotal = plan.price * mi.quantity;
                const amountPerUnit = memItems.length === 1
                    ? memTotalAmount / mi.quantity
                    : itemTotal / mi.quantity;

                const isDayPass = plan.plan_type === 'day_pass';

                for (let q = 0; q < mi.quantity; q++) {
                    const expiryDate = new Date(now);
                    expiryDate.setDate(expiryDate.getDate() + (plan.validity_days || 30));

                    // Create subscription — day passes auto-start the timer
                    const subRes = await fetch('/api/owner/subscriptions', {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            cafe_id: cafeId,
                            customer_name: customerName.trim(),
                            customer_phone: customerPhone.trim(),
                            membership_plan_id: plan.id,
                            hours_purchased: plan.hours || 24,
                            hours_remaining: plan.hours || 24,
                            amount_paid: amountPerUnit,
                            payment_mode: memPaymentMode,
                            purchase_date: now.toISOString(),
                            expiry_date: expiryDate.toISOString(),
                            status: 'active',
                            timer_active: isDayPass,
                            timer_start_time: isDayPass ? now.toISOString() : null,
                        }),
                    });
                    const subResult = await subRes.json();
                    if (!subRes.ok) throw new Error(subResult.error || 'Failed to create subscription');

                    // Create companion booking record so it shows in the Bookings tab
                    const duration = isDayPass ? 1440 : (plan.hours || 1) * 60;
                    const bookingRes = await fetch('/api/owner/billing', {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            booking: {
                                cafe_id: cafeId,
                                customer_name: customerName.trim(),
                                customer_phone: customerPhone.trim() || null,
                                booking_date: todayStr,
                                start_time: startTime12h,
                                duration,
                                total_amount: amountPerUnit,
                                status: isDayPass ? 'in-progress' : 'completed',
                                source: 'membership',
                                payment_mode: memPaymentMode,
                            },
                            items: [{
                                id: Math.random().toString(36).substr(2, 9),
                                console: plan.console_type || 'pc',
                                quantity: 1,
                                duration,
                                price: amountPerUnit,
                                title: String(duration),
                            }],
                        }),
                    });
                    if (!bookingRes.ok) {
                        const bookingErr = await bookingRes.json().catch(() => ({}));
                        throw new Error(bookingErr.error || 'Failed to create membership booking record');
                    }
                }
            }

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

            {mode === 'gaming' ? (
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
                                                    options={[{ value: '', label: 'Any' }, ...stationOptions(item.console).map(s => ({ value: s, label: s.toUpperCase() }))]}
                                                    onChange={(val) => updateItem(item.id, 'station', val)}
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
                                                    const val = parseInt(e.target.value) || 0;
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
                                                const val = parseInt(e.target.value) || 0;
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
