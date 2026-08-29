'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, Button } from './ui';
import {
    Chips,
    EmptyRow,
    Field,
    Kpis,
    Panel,
    PrimaryButton,
    TableHead,
    TableRow,
    Tag,
} from './consoleUi';
import {
    Edit2, Trash2, Copy, Check,
    Ticket, Clock, Calendar, Users,
    AlertCircle, ChevronLeft, Send,
    Info, UserCheck, Filter
} from 'lucide-react';

import { getLocalDateString } from '../utils';

interface Coupon {
    id: string;
    cafe_id: string;
    code: string;
    discount_type: 'percentage' | 'flat';
    discount_value: number;
    max_discount_amount: number | null;
    bonus_minutes: number;
    min_order_amount: number;
    new_customer_only: boolean;
    min_visits: number;
    inactive_days_required: number;
    max_uses: number | null;
    uses_count: number;
    single_use_per_customer: boolean;
    valid_from: string;
    valid_until: string | null;
    is_active: boolean;
    created_at: string;
}

interface Customer {
    id: string;
    name: string;
    phone: string;
    visits: number;
    total_spent: number;
    last_visit: string;
    coupon_sent: boolean;
}

type UsageRow = {
    coupon_id: string;
    discount_applied: number | string | null;
    bookings?: { total_amount: number | string | null } | { total_amount: number | string | null }[] | null;
};

interface CouponUsage {
    id: string;
    used_at: string;
    user_phone: string;
    discount_applied: number;
}

interface CouponsProps {
    isMobile: boolean;
    cafeId: string;
    onRefresh: () => void;
}

export function Coupons({ cafeId }: CouponsProps) {
    const [coupons, setCoupons] = useState<Coupon[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [typeFilter, setTypeFilter] = useState('all');
    const [copiedCode, setCopiedCode] = useState<string | null>(null);

    // View State
    const [view, setView] = useState<'list' | 'details' | 'create'>('list');
    const [selectedCoupon, setSelectedCoupon] = useState<Coupon | null>(null);
    const [activeTab, setActiveTab] = useState<'details' | 'eligible'>('details');

    // Eligible customers
    const [eligibleCustomers, setEligibleCustomers] = useState<Customer[]>([]);
    const [usageHistory, setUsageHistory] = useState<CouponUsage[]>([]);
    // What every code gave away and what came back with it, keyed by coupon.
    const [economics, setEconomics] = useState<Record<string, { given: number; earned: number }>>({});
    const [loadingCustomers, setLoadingCustomers] = useState(false);

    // Create/Edit State
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    // Form States
    const [formData, setFormData] = useState({
        code: '',
        discountType: 'percentage' as 'percentage' | 'minutes',
        discountValue: '',
        maxDiscountAmount: '',
        bonusMinutes: '',
        minOrderAmount: '',
        maxUses: '',
        singleUsePerCustomer: false,
        newCustomerOnly: false,
        minVisits: '',
        validFrom: '',
        validUntil: '',
        isActive: true
    });

    const fetchCoupons = useCallback(async () => {
        if (!cafeId) return;
        setLoading(true);

        const res = await fetch(`/api/owner/coupons?cafeId=${cafeId}`);
        const data = await res.json();
        if (res.ok && Array.isArray(data)) setCoupons(data);
        setLoading(false);
    }, [cafeId]);

    // Fetch coupons
    useEffect(() => {
        fetchCoupons();
    }, [fetchCoupons]);

    // A coupon is worth judging on money, not on how often it was typed. Quiet
    // on failure: the columns fall back to a dash rather than taking the page
    // down over a figure that decorates it.
    useEffect(() => {
        if (!cafeId) return;
        let cancelled = false;
        fetch(`/api/owner/coupons/usage?cafeId=${cafeId}`, { credentials: 'include' })
            .then((res) => (res.ok ? res.json() : []))
            .then((rows: UsageRow[]) => {
                if (cancelled || !Array.isArray(rows)) return;
                const tally: Record<string, { given: number; earned: number }> = {};
                for (const row of rows) {
                    if (!row?.coupon_id) continue;
                    const bucket = tally[row.coupon_id] || (tally[row.coupon_id] = { given: 0, earned: 0 });
                    bucket.given += Number(row.discount_applied) || 0;
                    const booking = Array.isArray(row.bookings) ? row.bookings[0] : row.bookings;
                    bucket.earned += Number(booking?.total_amount) || 0;
                }
                setEconomics(tally);
            })
            .catch(() => { /* the columns show a dash */ });
        return () => { cancelled = true; };
    }, [cafeId]);


    // Fetch all customers (from bookings, same as Customers tab)
    const fetchEligibleCustomers = async (coupon: Coupon) => {
        setLoadingCustomers(true);

        try {
            const res = await fetch(`/api/owner/coupons/customers?cafeId=${cafeId}`);
            const customers = await res.json();
            setEligibleCustomers(Array.isArray(customers) ? customers : []);
        } catch (err) {
            console.error('[Coupons] Error in fetchEligibleCustomers:', err);
        }

        // Fetch usage history
        try {
            const res = await fetch(`/api/owner/coupons/usage?couponId=${coupon.id}`);
            const usage = await res.json();
            if (Array.isArray(usage)) setUsageHistory(usage);
        } catch (err) {
            console.error('[Coupons] Error fetching usage:', err);
        }

        setLoadingCustomers(false);
    };

    // Send coupon via WhatsApp
    const sendCouponWhatsApp = (customer: Customer, coupon: Coupon) => {
        const phone = customer.phone.replace(/\D/g, ''); // Remove non-digits
        const phoneWithCountry = phone.startsWith('91') ? phone : `91${phone}`;

        // Create coupon message
        let discountText = '';
        if (coupon.discount_type === 'percentage' && coupon.discount_value > 0) {
            discountText = `${coupon.discount_value}% OFF`;
            if (coupon.bonus_minutes > 0) {
                discountText += ` + ${coupon.bonus_minutes} mins FREE`;
            }
        } else if (coupon.bonus_minutes > 0) {
            discountText = `${coupon.bonus_minutes} mins FREE gaming time`;
        }

        const validUntil = coupon.valid_until
            ? new Date(coupon.valid_until).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
            : 'No expiry';

        const message = `🎮 *Special Offer for You!*

Hi ${customer.name}! 👋

We have an exclusive coupon just for you:

🎟️ *Code:* ${coupon.code}
💰 *Discount:* ${discountText}
📅 *Valid Until:* ${validUntil}

Book your next gaming session now and use this code at checkout!

See you soon! 🎯`;

        const encodedMessage = encodeURIComponent(message);
        const whatsappUrl = `https://wa.me/${phoneWithCountry}?text=${encodedMessage}`;

        window.open(whatsappUrl, '_blank');

        // Mark as sent (update local state)
        setEligibleCustomers(prev =>
            prev.map(c => c.id === customer.id ? { ...c, coupon_sent: true } : c)
        );
    };

    // Copy code
    const copyCode = async (codeText: string, e?: React.MouseEvent) => {
        e?.stopPropagation();
        await navigator.clipboard.writeText(codeText);
        setCopiedCode(codeText);
        setTimeout(() => setCopiedCode(null), 2000);
    };

    // Reset form
    const resetForm = () => {
        setFormData({
            code: '',
            discountType: 'percentage',
            discountValue: '',
            maxDiscountAmount: '',
            bonusMinutes: '',
            minOrderAmount: '',
            maxUses: '',
            singleUsePerCustomer: false,
            newCustomerOnly: false,
            minVisits: '',
            validFrom: getLocalDateString(),
            validUntil: '',
            isActive: true
        });
        setError('');
    };

    // Handle Save
    const handleSave = async () => {
        setError('');

        const codeToSubmit = formData.code || Math.random().toString(36).substring(2, 10).toUpperCase();

        const discountValue = parseFloat(formData.discountValue);
        const bonusMinutes = parseInt(formData.bonusMinutes) || 0;

        if (formData.discountType === 'percentage' && (!Number.isFinite(discountValue) || discountValue <= 0 || discountValue > 100)) {
            setError('Percentage discount must be between 1 and 100');
            return;
        }

        if (formData.discountType === 'minutes' && bonusMinutes <= 0) {
            setError('Please enter the free minutes amount');
            return;
        }

        setSaving(true);
        try {
            const isPercentage = formData.discountType === 'percentage';

            const payload = {
                cafe_id: cafeId,
                code: codeToSubmit.toUpperCase().trim(),
                discount_type: isPercentage ? 'percentage' : 'flat',
                discount_value: isPercentage ? discountValue : 0,
                max_discount_amount: isPercentage && formData.maxDiscountAmount ? parseFloat(formData.maxDiscountAmount) : null,
                bonus_minutes: bonusMinutes,
                min_order_amount: parseFloat(formData.minOrderAmount) || 0,
                max_uses: formData.maxUses ? parseInt(formData.maxUses) : null,
                single_use_per_customer: formData.singleUsePerCustomer,
                new_customer_only: formData.newCustomerOnly,
                min_visits: parseInt(formData.minVisits) || 0,
                inactive_days_required: 0,
                valid_from: formData.validFrom ? new Date(formData.validFrom).toISOString() : new Date().toISOString(),
                valid_until: formData.validUntil ? new Date(formData.validUntil).toISOString() : null,
                is_active: formData.isActive,
            };

            const res = await fetch('/api/owner/coupons', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(selectedCoupon ? { id: selectedCoupon.id, ...payload } : payload),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Failed to save coupon');

            fetchCoupons();
            setView('list');
            setSelectedCoupon(null);
            resetForm();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save coupon');
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (coupon: Coupon, e?: React.MouseEvent) => {
        e?.stopPropagation();
        setSelectedCoupon(coupon);

        const isMinutesType = coupon.discount_type === 'flat' && coupon.discount_value === 0 && coupon.bonus_minutes > 0;

        setFormData({
            code: coupon.code,
            discountType: isMinutesType ? 'minutes' : 'percentage',
            discountValue: coupon.discount_value > 0 ? coupon.discount_value.toString() : '',
            maxDiscountAmount: coupon.max_discount_amount?.toString() || '',
            bonusMinutes: coupon.bonus_minutes > 0 ? coupon.bonus_minutes.toString() : '',
            minOrderAmount: coupon.min_order_amount > 0 ? coupon.min_order_amount.toString() : '',
            maxUses: coupon.max_uses?.toString() || '',
            singleUsePerCustomer: coupon.single_use_per_customer,
            newCustomerOnly: coupon.new_customer_only,
            minVisits: coupon.min_visits > 0 ? coupon.min_visits.toString() : '',
            validFrom: coupon.valid_from ? coupon.valid_from.split('T')[0] : '',
            validUntil: coupon.valid_until ? coupon.valid_until.split('T')[0] : '',
            isActive: coupon.is_active
        });
        setView('create');
    };

    const handleDelete = async (id: string, e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (!confirm("Are you sure you want to delete this coupon?")) return;
        await fetch(`/api/owner/coupons?id=${id}`, { method: 'DELETE' });
        fetchCoupons();
        if (selectedCoupon?.id === id) setView('list');
    };

    const handleDeactivate = async (coupon: Coupon) => {
        await fetch('/api/owner/coupons', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: coupon.id, is_active: !coupon.is_active }),
        });
        fetchCoupons();
        if (selectedCoupon?.id === coupon.id) {
            setSelectedCoupon({ ...coupon, is_active: !coupon.is_active });
        }
    };

    const viewCouponDetails = (coupon: Coupon) => {
        setSelectedCoupon(coupon);
        setActiveTab('details');
        fetchEligibleCustomers(coupon);
        setView('details');
    };

    const getCouponStatus = (coupon: Coupon) => {
        if (!coupon.is_active) return 'inactive';
        if (coupon.valid_until && new Date(coupon.valid_until) < new Date()) return 'expired';
        return 'active';
    };

    const formatDate = (date: string) => {
        return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    };


    // Filter coupons
    const filteredCoupons = coupons.filter(coupon => {
        const matchesSearch = coupon.code.toLowerCase().includes(search.toLowerCase());
        const status = getCouponStatus(coupon);
        const matchesStatus = statusFilter === 'all' || status === statusFilter;
        const matchesType = typeFilter === 'all' ||
            (typeFilter === 'percentage' && coupon.discount_type === 'percentage') ||
            (typeFilter === 'freetime' && coupon.bonus_minutes > 0);
        return matchesSearch && matchesStatus && matchesType;
    });

    // --- Create/Edit View ---
    if (view === 'create') {
        const previewDiscountDisplay = formData.discountType === 'percentage'
            ? `${formData.discountValue || '0'}% OFF`
            : `${formData.bonusMinutes || '0'} MINS FREE`;

        return (
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => { setView('list'); setSelectedCoupon(null); resetForm(); }}
                            className="p-2 hover:bg-[#f2f0ea]/5 transition-colors border border-transparent hover:border-[#f2f0ea]/10"
                        >
                            <ChevronLeft className="w-5 h-5 text-[#f2f0ea]/50" />
                        </button>
                        <div>
                            <h1 className="text-2xl font-bold text-[#f2f0ea] tracking-tight">
                                {selectedCoupon ? 'Edit Coupon' : 'Create New Coupon'}
                            </h1>
                            <p className="text-sm text-[#f2f0ea]/50">
                                {selectedCoupon ? 'Update campaign details' : 'Configure a new discount campaign'}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                    {/* Left Column: Form */}
                    <div className="lg:col-span-2 space-y-6">
                        <Card padding="lg" className="space-y-8 bg-[#111113] border-[#f2f0ea]/10">
                            {/* Coupon Code Section */}
                            <div>
                                <h3 className="text-lg font-medium text-[#f2f0ea] mb-4 flex items-center gap-2">
                                    <Ticket size={18} className="text-[#d8ff3c]" />
                                    Campaign Details
                                </h3>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-[#f2f0ea]/70 mb-2">Coupon Code</label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                placeholder="e.g., SUMMER50 (auto-gen if empty)"
                                                value={formData.code}
                                                onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                                                className="w-full pl-4 pr-28 py-3 bg-[#09090e] border border-[#f2f0ea]/10 text-[#f2f0ea] font-mono text-lg tracking-wider placeholder-[#f2f0ea]/30 focus:border-[#d8ff3c] focus:ring-1 focus:ring-[#d8ff3c] transition-all"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setFormData({ ...formData, code: Math.random().toString(36).substring(2, 8).toUpperCase() })}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-[#d8ff3c]/20 hover:bg-[#d8ff3c]/30 text-[#d8ff3c] text-xs font-semibold border border-[#d8ff3c]/30 transition-colors"
                                            >
                                                Generate
                                            </button>
                                        </div>
                                    </div>

                                    {/* Discount Selector */}
                                    <div>
                                        <label className="block text-sm font-medium text-[#f2f0ea]/70 mb-3">Discount Type</label>
                                        <div className="grid grid-cols-2 gap-4">
                                            <button
                                                type="button"
                                                onClick={() => setFormData({ ...formData, discountType: 'percentage' })}
                                                className={`group relative p-4  border-2 text-left transition-all ${formData.discountType === 'percentage'
                                                        ? 'border-[#d8ff3c] bg-[#d8ff3c]/5'
                                                        : 'border-[#f2f0ea]/10 hover:border-[#f2f0ea]/10 bg-[#111113]'
                                                    }`}
                                            >
                                                <div className={`p-2 w-fit  mb-3 ${formData.discountType === 'percentage' ? 'bg-[#d8ff3c] text-[#0b0b0c]' : 'bg-[#f2f0ea]/[0.06] text-[#f2f0ea]/50 group-hover:bg-[#f2f0ea]/[0.08]'}`}>
                                                    <div className="text-xl font-bold">%</div>
                                                </div>
                                                <div className="text-sm font-medium text-[#f2f0ea] mb-0.5">Percentage Off</div>
                                                <div className="text-xs text-[#f2f0ea]/50">Reduce price by %</div>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => setFormData({ ...formData, discountType: 'minutes' })}
                                                className={`group relative p-4  border-2 text-left transition-all ${formData.discountType === 'minutes'
                                                        ? 'border-[#d8ff3c] bg-[#d8ff3c]/5'
                                                        : 'border-[#f2f0ea]/10 hover:border-[#f2f0ea]/10 bg-[#111113]'
                                                    }`}
                                            >
                                                <div className={`p-2 w-fit  mb-3 ${formData.discountType === 'minutes' ? 'bg-[#d8ff3c] text-[#0b0b0c]' : 'bg-[#f2f0ea]/[0.06] text-[#f2f0ea]/50 group-hover:bg-[#f2f0ea]/[0.08]'}`}>
                                                    <Clock size={20} />
                                                </div>
                                                <div className="text-sm font-medium text-[#f2f0ea] mb-0.5">Free Game Time</div>
                                                <div className="text-xs text-[#f2f0ea]/50">Add free minutes</div>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Value Inputs */}
                                    <div className="p-5 bg-[#09090e] border border-[#f2f0ea]/10">
                                        {formData.discountType === 'percentage' ? (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                                <div>
                                                    <label className="block text-xs uppercase tracking-wide text-[#f2f0ea]/40 font-semibold mb-2">Discount Percentage</label>
                                                    <div className="relative">
                                                        <input
                                                            type="number"
                                                            value={formData.discountValue}
                                                            onChange={e => setFormData({ ...formData, discountValue: e.target.value })}
                                                            className="w-full px-4 py-3 bg-[#111113] border border-[#f2f0ea]/10 text-[#f2f0ea] text-xl font-semibold pr-10 focus:border-[#d8ff3c] focus:outline-none transition-colors"
                                                            placeholder="0"
                                                            max="100"
                                                        />
                                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#f2f0ea]/40 font-bold">%</span>
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-xs uppercase tracking-wide text-[#f2f0ea]/40 font-semibold mb-2">Bonus Free Time (Opt)</label>
                                                    <div className="relative">
                                                        <input
                                                            type="number"
                                                            value={formData.bonusMinutes}
                                                            onChange={e => setFormData({ ...formData, bonusMinutes: e.target.value })}
                                                            className="w-full px-4 py-3 bg-[#111113] border border-[#f2f0ea]/10 text-[#f2f0ea] text-xl font-semibold pr-16 focus:border-[#d8ff3c] focus:outline-none transition-colors"
                                                            placeholder="0"
                                                        />
                                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#f2f0ea]/40 text-sm">mins</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div>
                                                <label className="block text-xs uppercase tracking-wide text-[#f2f0ea]/40 font-semibold mb-2">Free Minutes Amount</label>
                                                <div className="relative">
                                                    <input
                                                        type="number"
                                                        value={formData.bonusMinutes}
                                                        onChange={e => setFormData({ ...formData, bonusMinutes: e.target.value })}
                                                        className="w-full px-4 py-3 bg-[#111113] border border-[#f2f0ea]/10 text-[#f2f0ea] text-xl font-semibold pr-16 focus:border-[#d8ff3c] focus:outline-none transition-colors"
                                                        placeholder="30"
                                                    />
                                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#f2f0ea]/40 text-sm">mins</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Rules & Limits */}
                            <div className="pt-6 border-t border-[#f2f0ea]/10">
                                <h3 className="text-lg font-medium text-[#f2f0ea] mb-4 flex items-center gap-2">
                                    <Filter size={18} className="text-[#d8ff3c]" />
                                    Rules & Validity
                                </h3>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm text-[#f2f0ea]/50 mb-1.5">Valid From</label>
                                            <input
                                                type="date"
                                                value={formData.validFrom}
                                                onChange={e => setFormData({ ...formData, validFrom: e.target.value })}
                                                className="w-full px-3 py-2 bg-[#09090e] border border-[#f2f0ea]/10 text-[#f2f0ea] focus:border-[#d8ff3c] focus:outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-[#f2f0ea]/50 mb-1.5">Valid Until</label>
                                            <input
                                                type="date"
                                                value={formData.validUntil}
                                                onChange={e => setFormData({ ...formData, validUntil: e.target.value })}
                                                className="w-full px-3 py-2 bg-[#09090e] border border-[#f2f0ea]/10 text-[#f2f0ea] focus:border-[#d8ff3c] focus:outline-none"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm text-[#f2f0ea]/50 mb-1.5">Min Order Value (₹)</label>
                                            <input
                                                type="number"
                                                value={formData.minOrderAmount}
                                                onChange={e => setFormData({ ...formData, minOrderAmount: e.target.value })}
                                                className="w-full px-3 py-2 bg-[#09090e] border border-[#f2f0ea]/10 text-[#f2f0ea] focus:border-[#d8ff3c] focus:outline-none"
                                                placeholder="0"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-[#f2f0ea]/50 mb-1.5">Max Uses (Total)</label>
                                            <input
                                                type="number"
                                                value={formData.maxUses}
                                                onChange={e => setFormData({ ...formData, maxUses: e.target.value })}
                                                className="w-full px-3 py-2 bg-[#09090e] border border-[#f2f0ea]/10 text-[#f2f0ea] focus:border-[#d8ff3c] focus:outline-none"
                                                placeholder="Unlimited"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-6 flex flex-wrap gap-3">
                                    <label className={`flex items-center gap-2 px-4 py-2  border cursor-pointer transition-all ${formData.newCustomerOnly
                                            ? 'bg-[#d8ff3c]/10 border-[#d8ff3c] text-[#d8ff3c]'
                                            : 'bg-[#111113] border-[#f2f0ea]/10 text-[#f2f0ea]/50 hover:border-[#f2f0ea]/30'
                                        }`}>
                                        <input
                                            type="checkbox"
                                            className="hidden"
                                            checked={formData.newCustomerOnly}
                                            onChange={e => setFormData({ ...formData, newCustomerOnly: e.target.checked })}
                                        />
                                        <UserCheck size={16} />
                                        <span className="text-sm font-medium">New Customers Only</span>
                                    </label>

                                    <label className={`flex items-center gap-2 px-4 py-2  border cursor-pointer transition-all ${formData.isActive
                                            ? 'bg-[#d8ff3c]/10 border-[#d8ff3c] text-[#d8ff3c]'
                                            : 'bg-[#111113] border-[#f2f0ea]/10 text-[#f2f0ea]/50 hover:border-[#f2f0ea]/30'
                                        }`}>
                                        <input
                                            type="checkbox"
                                            className="hidden"
                                            checked={formData.isActive}
                                            onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                                        />
                                        <Check size={16} />
                                        <span className="text-sm font-medium">Active Status</span>
                                    </label>
                                </div>
                            </div>

                            {/* Error & Actions */}
                            {error && (
                                <div className="p-4 bg-[#ff5c2b]/10 border border-[#ff5c2b]/20 text-[#ff5c2b] text-sm flex items-center gap-3">
                                    <AlertCircle size={20} className="shrink-0" /> {error}
                                </div>
                            )}

                            <div className="flex gap-4 pt-4">
                                <Button
                                    variant="ghost"
                                    className="flex-1 h-12 text-[#f2f0ea]/50"
                                    onClick={() => { setView('list'); setSelectedCoupon(null); resetForm(); }}
                                >
                                    Discard Changes
                                </Button>
                                <Button variant="primary" className="flex-1 h-12 text-lg/20" onClick={handleSave} disabled={saving}>
                                    {saving ? 'Saving...' : selectedCoupon ? 'Update Campaign' : 'Launch Campaign'}
                                </Button>
                            </div>
                        </Card>
                    </div>

                    {/* Right Column: Preview */}
                    <div className="lg:col-span-1 lg:sticky lg:top-8">
                        <div className="space-y-4">
                            <h3 className="text-sm font-medium text-[#f2f0ea]/50 uppercase tracking-widest pl-1">Live Preview</h3>

                            <div className="relative bg-[#111113] border border-[#f2f0ea]/10 p-6 shadow-black/50 overflow-hidden">
                                <div className="absolute top-0 right-0 p-4 opacity-50">
                                    <div className="w-20 h-20 bg-[#d8ff3c]/10 rounded-full blur-2xl"></div>
                                </div>

                                <div className="flex justify-between items-start mb-6">
                                    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${formData.isActive
                                            ? 'bg-[#d8ff3c]/10 text-[#d8ff3c] border-[#d8ff3c]/20'
                                            : 'bg-[#f2f0ea]/[0.04] text-[#f2f0ea]/50 border-[#f2f0ea]/10'
                                        }`}>
                                        {formData.isActive ? 'Active' : 'Inactive'}
                                    </span>
                                </div>

                                <div className="mb-8 text-center">
                                    <div className="font-mono text-2xl font-bold text-[#f2f0ea] tracking-widest mb-2">
                                        {formData.code || 'CODE'}
                                    </div>
                                    <div className="text-3xl font-bold bg-[#111113] bg-clip-text text-transparent">
                                        {previewDiscountDisplay}
                                    </div>
                                    {formData.discountType === 'percentage' && formData.bonusMinutes && (
                                        <div className="text-sm text-[#d8ff3c] font-medium mt-2">
                                            + {formData.bonusMinutes} mins bonus
                                        </div>
                                    )}
                                </div>

                                {/* Placeholder Progress */}
                                <div className="mb-6">
                                    <div className="flex justify-between text-xs text-[#f2f0ea]/50 mb-2">
                                        <span>Redemptions</span>
                                        <span>0 / {formData.maxUses || '∞'}</span>
                                    </div>
                                    <div className="h-1.5 bg-[#f2f0ea]/[0.06] rounded-full overflow-hidden">
                                        <div className="h-full bg-[#d8ff3c] rounded-full w-0" />
                                    </div>
                                </div>

                                <div className="space-y-3 pt-6 border-t border-[#f2f0ea]/[0.07]">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-[#f2f0ea]/40 flex items-center gap-2"><Calendar size={14} /> Valid Until</span>
                                        <span className="text-[#f2f0ea]/70">{formData.validUntil ? formatDate(formData.validUntil) : 'Forever'}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-[#f2f0ea]/40 flex items-center gap-2"><Users size={14} /> Audience</span>
                                        <span className="text-[#f2f0ea]/70">{formData.newCustomerOnly ? 'New Customers' : 'Everyone'}</span>
                                    </div>
                                </div>
                            </div>

                            <p className="text-xs text-[#f2f0ea]/40 text-center px-4">
                                This is how the coupon card will appear in your dashboard.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // --- Details View ---
    if (view === 'details' && selectedCoupon) {
        const status = getCouponStatus(selectedCoupon);
        const eligibleCount = eligibleCustomers.length;
        const sentCount = eligibleCustomers.filter(c => c.coupon_sent).length;
        const pendingCount = eligibleCount - sentCount;

        return (
            <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setView('list')}
                            className="p-2 hover:bg-[#f2f0ea]/5 transition-colors"
                        >
                            <ChevronLeft className="w-5 h-5 text-[#f2f0ea]/50" />
                        </button>
                        <div>
                            <h1 className="text-xl font-bold text-[#f2f0ea]">Coupon Details</h1>
                            <p className="text-sm text-[#f2f0ea]/50">General coupon</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="secondary" size="sm" onClick={() => handleEdit(selectedCoupon)}>
                            <Edit2 className="w-4 h-4 mr-1" /> Edit
                        </Button>
                        <Button
                            variant={selectedCoupon.is_active ? "ghost" : "secondary"}
                            size="sm"
                            onClick={() => handleDeactivate(selectedCoupon)}
                        >
                            {selectedCoupon.is_active ? 'Deactivate' : 'Activate'}
                        </Button>
                    </div>
                </div>

                {/* Coupon Header Card */}
                <Card padding="lg" className="relative overflow-hidden">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <h2 className="text-2xl font-bold font-mono tracking-wider text-[#f2f0ea]">
                                    {selectedCoupon.code}
                                </h2>
                                <button
                                    onClick={(e) => copyCode(selectedCoupon.code, e)}
                                    className="p-1.5 hover:bg-white/10 transition-colors"
                                >
                                    {copiedCode === selectedCoupon.code
                                        ? <Check size={16} className="text-[#d8ff3c]" />
                                        : <Copy size={16} className="text-[#f2f0ea]/50" />
                                    }
                                </button>
                            </div>
                            <span className={`inline-block text-xs px-2 py-1 rounded-full ${status === 'active' ? 'bg-[#d8ff3c]/10 text-[#d8ff3c] border border-[#d8ff3c]/20' :
                                status === 'expired' ? 'bg-[#ff5c2b]/10 text-[#ff5c2b] border border-[#ff5c2b]/20' :
                                    'bg-[#f2f0ea]/[0.04] text-[#f2f0ea]/50 border border-[#f2f0ea]/10'
                                }`}>
                                {status.charAt(0).toUpperCase() + status.slice(1)}
                            </span>
                        </div>
                        <div className="text-right">
                            <div className="text-3xl font-bold text-[#d8ff3c]">
                                {selectedCoupon.discount_type === 'percentage' && selectedCoupon.discount_value > 0
                                    ? `${selectedCoupon.discount_value}% off`
                                    : selectedCoupon.bonus_minutes > 0
                                        ? `${selectedCoupon.bonus_minutes}m free`
                                        : '-'
                                }
                            </div>
                            {selectedCoupon.discount_type === 'percentage' && selectedCoupon.bonus_minutes > 0 && (
                                <div className="text-sm text-[#d8ff3c]">+ +{selectedCoupon.bonus_minutes}m free free</div>
                            )}
                        </div>
                    </div>

                    {/* Stats Row */}
                    <div className="grid grid-cols-4 gap-4 mt-6 pt-6 border-t border-[#f2f0ea]/10">
                        <div>
                            <div className="text-xs text-[#f2f0ea]/40 mb-1">Usage</div>
                            <div className="text-lg font-semibold text-[#f2f0ea]">
                                {selectedCoupon.uses_count}/{selectedCoupon.max_uses || '∞'} used
                            </div>
                        </div>
                        <div>
                            <div className="text-xs text-[#f2f0ea]/40 mb-1">Eligible</div>
                            <div className="text-lg font-semibold text-[#f2f0ea]">{eligibleCount} customers</div>
                        </div>
                        <div>
                            <div className="text-xs text-[#f2f0ea]/40 mb-1">Validity</div>
                            <div className="text-lg font-semibold text-[#f2f0ea]">
                                {formatDate(selectedCoupon.valid_from)} - {selectedCoupon.valid_until ? formatDate(selectedCoupon.valid_until) : 'No end'}
                            </div>
                        </div>
                        <div>
                            <div className="text-xs text-[#f2f0ea]/40 mb-1">Created</div>
                            <div className="text-lg font-semibold text-[#f2f0ea]">
                                {formatDate(selectedCoupon.created_at)}
                            </div>
                        </div>
                    </div>
                </Card>

                {/* Tabs */}
                <div className="flex border-b border-[#f2f0ea]/10">
                    <button
                        onClick={() => setActiveTab('details')}
                        className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${activeTab === 'details'
                            ? 'border-[#d8ff3c] text-[#f2f0ea]'
                            : 'border-transparent text-[#f2f0ea]/50 hover:text-[#f2f0ea]'
                            }`}
                    >
                        <Info size={16} /> Details
                    </button>
                    <button
                        onClick={() => setActiveTab('eligible')}
                        className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${activeTab === 'eligible'
                            ? 'border-[#d8ff3c] text-[#f2f0ea]'
                            : 'border-transparent text-[#f2f0ea]/50 hover:text-[#f2f0ea]'
                            }`}
                    >
                        <UserCheck size={16} /> Eligible Customers
                        <span className="ml-1 px-2 py-0.5 text-xs bg-[#f2f0ea]/[0.06] rounded-full">{eligibleCount}</span>
                    </button>
                </div>

                {/* Tab Content */}
                {activeTab === 'details' ? (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Main Details */}
                        <div className="lg:col-span-2 space-y-6">
                            <Card padding="lg">
                                <h3 className="font-semibold text-[#f2f0ea] mb-4">Discount Details</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <div>
                                        <div className="text-xs text-[#f2f0ea]/40 uppercase mb-1">Discount Type</div>
                                        <div className="text-[#f2f0ea]">
                                            {selectedCoupon.discount_type === 'percentage' ? 'Percentage' : 'Free Game Time'}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-[#f2f0ea]/40 uppercase mb-1">Discount Value</div>
                                        <div className="text-[#f2f0ea] font-semibold">
                                            {selectedCoupon.discount_type === 'percentage'
                                                ? `${selectedCoupon.discount_value}% off`
                                                : `${selectedCoupon.bonus_minutes}m free`
                                            }
                                        </div>
                                    </div>
                                    {selectedCoupon.bonus_minutes > 0 && selectedCoupon.discount_type === 'percentage' && (
                                        <div className="col-span-2 p-3 bg-[#d8ff3c]/10 border border-[#d8ff3c]/20">
                                            <div className="text-xs text-[#d8ff3c] uppercase mb-1">Free Minutes</div>
                                            <div className="text-[#d8ff3c] font-semibold">+{selectedCoupon.bonus_minutes}m free</div>
                                        </div>
                                    )}
                                </div>
                            </Card>

                            <Card padding="lg">
                                <h3 className="font-semibold text-[#f2f0ea] mb-4">Conditions</h3>
                                <div className="space-y-3">
                                    <div className="flex justify-between py-2 border-b border-[#f2f0ea]/10">
                                        <span className="text-[#f2f0ea]/50">Minimum Spent</span>
                                        <span className="text-[#f2f0ea]">₹{selectedCoupon.min_order_amount}</span>
                                    </div>
                                    <div className="flex justify-between py-2 border-b border-[#f2f0ea]/10">
                                        <span className="text-[#f2f0ea]/50">Minimum Visits</span>
                                        <span className="text-[#f2f0ea]">{selectedCoupon.min_visits || 'None'}</span>
                                    </div>
                                    <div className="flex justify-between py-2 border-b border-[#f2f0ea]/10">
                                        <span className="text-[#f2f0ea]/50">Inactive Days Required</span>
                                        <span className="text-[#f2f0ea]">{selectedCoupon.inactive_days_required || 'None'}</span>
                                    </div>
                                    <div className="flex justify-between py-2 border-b border-[#f2f0ea]/10">
                                        <span className="text-[#f2f0ea]/50">For New Customers Only</span>
                                        <span className="text-[#f2f0ea]">{selectedCoupon.new_customer_only ? 'Yes' : 'No'}</span>
                                    </div>
                                    <div className="flex justify-between py-2">
                                        <span className="text-[#f2f0ea]/50">Maximum Uses</span>
                                        <span className="text-[#f2f0ea]">{selectedCoupon.max_uses || 'Unlimited'}</span>
                                    </div>
                                </div>
                            </Card>

                            <Card padding="lg">
                                <h3 className="font-semibold text-[#f2f0ea] mb-4">Usage History</h3>
                                {usageHistory.length === 0 ? (
                                    <div className="text-center py-8 text-[#f2f0ea]/40">
                                        <Ticket className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                        <p>This coupon has not been used yet</p>
                                    </div>
                                ) : (
                                    <table className="w-full">
                                        <thead>
                                            <tr className="text-xs text-[#f2f0ea]/40 uppercase border-b border-[#f2f0ea]/10">
                                                <th className="text-left py-2">Date</th>
                                                <th className="text-left py-2">Customer</th>
                                                <th className="text-right py-2">Discount Applied</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {usageHistory.map(usage => (
                                                <tr key={usage.id} className="border-b border-[#f2f0ea]/[0.07]">
                                                    <td className="py-3 text-[#f2f0ea]/70">{formatDate(usage.used_at)}</td>
                                                    <td className="py-3 text-[#f2f0ea]">{usage.user_phone}</td>
                                                    <td className="py-3 text-right text-[#d8ff3c]">₹{usage.discount_applied}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </Card>
                        </div>

                        {/* Sidebar */}
                        <div className="space-y-6">
                            <Card padding="md">
                                <h3 className="font-semibold text-[#f2f0ea] mb-4">Actions</h3>
                                <div className="space-y-2">
                                    <Button variant="secondary" className="w-full justify-start" onClick={() => handleEdit(selectedCoupon)}>
                                        <Edit2 size={16} className="mr-2" /> Edit Coupon
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        className="w-full justify-start"
                                        onClick={() => handleDeactivate(selectedCoupon)}
                                    >
                                        {selectedCoupon.is_active ? 'Deactivate' : 'Activate'}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        className="w-full justify-start text-[#ff5c2b] hover:text-[#ff5c2b] hover:bg-[#ff5c2b]/10"
                                        onClick={(e) => handleDelete(selectedCoupon.id, e)}
                                    >
                                        <Trash2 size={16} className="mr-2" /> Delete Coupon
                                    </Button>
                                </div>
                            </Card>

                            <Card padding="md">
                                <h3 className="font-semibold text-[#f2f0ea] mb-4">Validity Period</h3>
                                <div className="space-y-3">
                                    <div className="flex justify-between">
                                        <span className="text-[#f2f0ea]/50">From</span>
                                        <span className="text-[#f2f0ea]">{formatDate(selectedCoupon.valid_from)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-[#f2f0ea]/50">Until</span>
                                        <span className="text-[#f2f0ea]">
                                            {selectedCoupon.valid_until ? formatDate(selectedCoupon.valid_until) : 'No expiry'}
                                        </span>
                                    </div>
                                </div>
                            </Card>
                        </div>
                    </div>
                ) : (
                    /* Eligible Customers Tab */
                    <div className="space-y-6">
                        {/* Stats Cards */}
                        <div className="grid grid-cols-3 gap-4">
                            <Card padding="md" className="bg-[#d8ff3c]/5 border-[#d8ff3c]/20">
                                <div className="text-center">
                                    <div className="text-3xl font-bold text-[#d8ff3c]">{eligibleCount}</div>
                                    <div className="text-sm text-[#f2f0ea]/50">Eligible</div>
                                </div>
                            </Card>
                            <Card padding="md" className="bg-[#d8ff3c]/5 border-[#d8ff3c]/20">
                                <div className="text-center">
                                    <div className="text-3xl font-bold text-[#d8ff3c]">{sentCount}</div>
                                    <div className="text-sm text-[#f2f0ea]/50">Sent</div>
                                </div>
                            </Card>
                            <Card padding="md" className="bg-[#ff5c2b]/5 border-[#ff5c2b]/20">
                                <div className="text-center">
                                    <div className="text-3xl font-bold text-[#ff5c2b]">{pendingCount}</div>
                                    <div className="text-sm text-[#f2f0ea]/50">Pending</div>
                                </div>
                            </Card>
                        </div>

                        {/* Eligibility Criteria */}
                        <div className="flex items-center gap-2 text-sm text-[#f2f0ea]/50">
                            <Filter size={14} />
                            <span>Eligibility:</span>
                            <span className="text-[#f2f0ea]">All customers from your database are eligible to receive this coupon</span>
                        </div>

                        {/* Customers Table */}
                        <Card padding="none">
                            {loadingCustomers ? (
                                <div className="p-8 text-center text-[#f2f0ea]/40">Loading customers...</div>
                            ) : eligibleCustomers.length === 0 ? (
                                <div className="p-8 text-center text-[#f2f0ea]/40">
                                    <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                    <p>No eligible customers found</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="text-xs text-[#f2f0ea]/40 uppercase border-b border-[#f2f0ea]/10 bg-[#111113]">
                                            <th className="text-left p-4">Customer</th>
                                            <th className="text-center p-4">Visits</th>
                                            <th className="text-center p-4">Total Spent</th>
                                            <th className="text-center p-4">Last Visit</th>
                                            <th className="text-center p-4">Status</th>
                                            <th className="text-right p-4">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/[0.08]/50">
                                        {eligibleCustomers.map(customer => (
                                            <tr key={customer.id} className="hover:bg-[#f2f0ea]/5">
                                                <td className="p-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-9 h-9 rounded-full bg-[#f2f0ea]/[0.08] flex items-center justify-center text-[#f2f0ea] font-medium">
                                                            {customer.name.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div className="font-medium text-[#f2f0ea]">{customer.name}</div>
                                                            <div className="text-sm text-[#f2f0ea]/40">{customer.phone}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-4 text-center text-[#f2f0ea]">{customer.visits}</td>
                                                <td className="p-4 text-center text-[#f2f0ea]">₹{customer.total_spent.toLocaleString()}</td>
                                                <td className="p-4 text-center text-[#f2f0ea]/50">{formatDate(customer.last_visit)}</td>
                                                <td className="p-4 text-center">
                                                    <span className={`text-xs px-2 py-1 rounded-full ${customer.coupon_sent
                                                        ? 'bg-[#d8ff3c]/10 text-[#d8ff3c]'
                                                        : 'bg-[#ff5c2b]/10 text-[#ff5c2b]'
                                                        }`}>
                                                        {customer.coupon_sent ? 'Sent' : 'Not Sent'}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-right">
                                                    <Button
                                                        variant="primary"
                                                        size="sm"
                                                        onClick={() => sendCouponWhatsApp(customer, selectedCoupon)}
                                                        className={customer.coupon_sent ? 'bg-[#d8ff3c]' : 'bg-[#d8ff3c] hover:bg-[#d8ff3c]'}
                                                    >
                                                        {customer.coupon_sent ? (
                                                            <><Check size={14} className="mr-1" /> Sent</>
                                                        ) : (
                                                            <><Send size={14} className="mr-1" /> Send</>
                                                        )}
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                </div>
                            )}
                        </Card>
                    </div>
                )}
            </div>
        );
    }

    // --- List View ---
    const activeCount = coupons.filter(c => getCouponStatus(c) === 'active').length;
    const totalRedemptions = coupons.reduce((sum, c) => sum + (c.uses_count || 0), 0);
    const expiringSoonCount = coupons.filter(c => {
        if (!c.valid_until || !c.is_active) return false;
        const daysUntil = Math.ceil((new Date(c.valid_until).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
        return daysUntil > 0 && daysUntil <= 7;
    }).length;

    const totalGiven = Object.values(economics).reduce((sum, e) => sum + e.given, 0);
    const totalEarned = Object.values(economics).reduce((sum, e) => sum + e.earned, 0);

    /** Codes that actually ran, ordered by what each rupee of discount returned. */
    const roiRanking = coupons
        .map((c) => ({ id: c.id, code: c.code, ...(economics[c.id] || { given: 0, earned: 0 }) }))
        .filter((r) => r.given > 0)
        .map((r) => ({ ...r, roi: r.earned / r.given }))
        .sort((a, b) => b.roi - a.roi)
        .slice(0, 6);
    const bestRoi = Math.max(1, ...roiRanking.map((r) => r.roi));

    const exportCouponsCsv = () => {
        const header = ['Code', 'Discount', 'Status', 'Used', 'Limit', 'Given', 'Earned', 'Return', 'Valid until'];
        const rows = filteredCoupons.map((c) => {
            const money = economics[c.id];
            return [
                c.code,
                c.discount_type === 'percentage' ? `${c.discount_value}%` : `${c.bonus_minutes} mins`,
                getCouponStatus(c),
                String(c.uses_count),
                c.max_uses ? String(c.max_uses) : '',
                money ? String(Math.round(money.given)) : '',
                money ? String(Math.round(money.earned)) : '',
                money && money.given > 0 ? (money.earned / money.given).toFixed(2) : '',
                c.valid_until || '',
            ];
        });
        const escape = (cell: string) => `"${String(cell).replace(/"/g, '""')}"`;
        const csv = [header, ...rows].map((cols) => cols.map(escape).join(',')).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `coupons-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const COLUMNS = 'minmax(150px,1.25fr) minmax(0,1fr) 132px 110px 70px 86px 112px';

    return (
        <div className="flex flex-col gap-[18px]">
            <Kpis
                items={[
                    { label: 'RUNNING', value: String(activeCount), tone: 'lime', sub: `${coupons.length} made in total` },
                    { label: 'REDEEMED', value: String(totalRedemptions), sub: 'times a code has been used' },
                    {
                        label: 'ENDING THIS WEEK',
                        value: String(expiringSoonCount),
                        tone: expiringSoonCount > 0 ? 'orange' : 'ink',
                        sub: expiringSoonCount > 0 ? 'about to stop working' : 'none about to lapse',
                    },
                    {
                        label: 'USED UP',
                        value: String(
                            coupons.filter((c) => c.max_uses && c.uses_count >= c.max_uses).length
                        ),
                        sub: 'hit their usage cap',
                    },
                ]}
            />

            <div className="flex flex-wrap items-center gap-[9px]">
                <Chips
                    items={['all', 'active', 'inactive', 'expired'].map((status) => ({
                        id: status,
                        label: status.toUpperCase(),
                        count:
                            status === 'all'
                                ? coupons.length
                                : coupons.filter((c) => getCouponStatus(c) === status).length,
                    }))}
                    active={statusFilter}
                    onPick={setStatusFilter}
                />
                {/* Percentage off and free minutes are different offers and
                    an owner usually wants one or the other; the filter existed
                    before and would have been lost with the old toolbar. */}
                <Chips
                    items={[
                        { id: 'all', label: 'ANY TYPE' },
                        { id: 'percentage', label: '% OFF' },
                        { id: 'freetime', label: 'FREE MINS' },
                    ]}
                    active={typeFilter}
                    onPick={setTypeFilter}
                />
                <span className="h-px min-w-[20px] flex-1 bg-[#f2f0ea]/10" />
                <Field value={search} onChange={setSearch} placeholder="FIND A CODE" className="w-[200px]" />
                <PrimaryButton onClick={() => setView('create')}>+ NEW COUPON</PrimaryButton>
            </div>

            <Panel>
                <TableHead columns={COLUMNS}>
                    <span>CODE</span>
                    <span>DISCOUNT</span>
                    <span>REDEEMED</span>
                    <span className="text-right">GIVEN / EARNED</span>
                    <span className="text-right">RETURN</span>
                    <span className="text-right">WINDOW</span>
                    <span className="text-right">ACTIONS</span>
                </TableHead>

                {loading ? (
                    <EmptyRow>Loading…</EmptyRow>
                ) : filteredCoupons.length === 0 ? (
                    <EmptyRow>
                        {search || statusFilter !== 'all'
                            ? 'No code matches that filter.'
                            : 'No coupons yet. Make one and customers can type it at checkout.'}
                    </EmptyRow>
                ) : (
                    filteredCoupons.map((coupon) => {
                        const status = getCouponStatus(coupon);
                        const usedUp = coupon.max_uses ? coupon.uses_count >= coupon.max_uses : false;
                        const pct = coupon.max_uses
                            ? Math.min(100, (coupon.uses_count / coupon.max_uses) * 100)
                            : 0;
                        const edge =
                            usedUp || status === 'expired' ? 'rgba(242,240,234,.2)'
                            : status === 'active' ? '#d8ff3c'
                            : 'transparent';
                        const money = economics[coupon.id];
                        // Return per rupee discounted. No usage means no answer,
                        // which is a dash rather than a zero — they read differently.
                        const roi = money && money.given > 0 ? money.earned / money.given : null;

                        return (
                            <TableRow
                                key={coupon.id}
                                columns={COLUMNS}
                                edge={edge}
                                onClick={() => viewCouponDetails(coupon)}
                            >
                                <div className="flex min-w-0 flex-col gap-[3px]">
                                    <span className="truncate font-mono text-[13px] font-semibold tracking-[0.08em] text-[#f2f0ea]">
                                        {coupon.code}
                                    </span>
                                    <Tag tone={status === 'active' ? 'lime' : 'muted'}>{status.toUpperCase()}</Tag>
                                </div>

                                <div className="flex min-w-0 flex-col gap-[3px]">
                                    <span className="truncate text-[13.5px] font-bold text-[#f2f0ea]">
                                        {coupon.discount_type === 'percentage'
                                            ? `${coupon.discount_value}% off`
                                            : `${coupon.bonus_minutes} mins free`}
                                    </span>
                                    {coupon.discount_type === 'percentage' && coupon.bonus_minutes > 0 && (
                                        <span className="truncate font-mono text-[10px] text-[#d8ff3c]">
                                            + {coupon.bonus_minutes} MINS BONUS
                                        </span>
                                    )}
                                </div>

                                <div className="flex min-w-0 flex-col gap-1.5">
                                    <span
                                        className="whitespace-nowrap font-mono text-[11.5px]"
                                        style={{ color: usedUp ? '#ff5c2b' : '#f2f0ea' }}
                                    >
                                        {coupon.uses_count}
                                        {coupon.max_uses ? ` / ${coupon.max_uses}` : ' · no cap'}
                                    </span>
                                    {coupon.max_uses ? (
                                        <div className="h-[5px] bg-[#f2f0ea]/[0.08]">
                                            <div
                                                className="h-[5px]"
                                                style={{ width: `${pct}%`, background: usedUp ? '#ff5c2b' : '#d8ff3c' }}
                                            />
                                        </div>
                                    ) : null}
                                </div>

                                {/* What it cost against what it brought back. A code
                                    used forty times is not automatically a good one. */}
                                <div className="flex min-w-0 flex-col items-end gap-[3px]">
                                    {money ? (
                                        <>
                                            <span className="whitespace-nowrap font-mono text-[11.5px] text-[#ff5c2b]">
                                                −₹{Math.round(money.given).toLocaleString('en-IN')}
                                            </span>
                                            <span className="whitespace-nowrap font-mono text-[11.5px] text-[#d8ff3c]">
                                                +₹{Math.round(money.earned).toLocaleString('en-IN')}
                                            </span>
                                        </>
                                    ) : (
                                        <span className="font-mono text-[11.5px] text-[#f2f0ea]/25">—</span>
                                    )}
                                </div>

                                <span
                                    className="whitespace-nowrap text-right font-mono text-[12px]"
                                    style={{
                                        color: roi === null ? 'rgba(242,240,234,.25)'
                                            : roi >= 3 ? '#d8ff3c'
                                            : roi >= 1 ? 'rgba(242,240,234,.7)'
                                            : '#ff5c2b',
                                    }}
                                >
                                    {roi === null ? '—' : `${roi.toFixed(1)}×`}
                                </span>

                                <span className="whitespace-nowrap text-right font-mono text-[10.5px] text-[#f2f0ea]/60">
                                    {coupon.valid_until
                                        ? `TILL ${new Date(coupon.valid_until)
                                              .toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
                                              .toUpperCase()}`
                                        : 'NO END DATE'}
                                </span>

                                <div className="flex justify-end gap-[5px]">
                                    <button
                                        type="button"
                                        title="Copy the code"
                                        onClick={(e) => copyCode(coupon.code, e)}
                                        className="flex h-[26px] items-center border border-[#f2f0ea]/[0.14] px-[9px] font-mono text-[9.5px] tracking-[0.1em] text-[#f2f0ea]/55 transition-colors hover:border-[#d8ff3c] hover:text-[#d8ff3c]"
                                    >
                                        {copiedCode === coupon.code ? 'COPIED' : 'COPY'}
                                    </button>
                                    <a
                                        href={`https://wa.me/?text=${encodeURIComponent(
                                            `🎮 Use code *${coupon.code}* for ${
                                                coupon.discount_type === 'percentage'
                                                    ? coupon.discount_value + '% OFF'
                                                    : coupon.bonus_minutes + ' mins FREE'
                                            } on your next gaming session! Book now 🎯`
                                        )}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        title="Share on WhatsApp"
                                        className="flex h-[26px] items-center border border-[#f2f0ea]/[0.14] px-[9px] font-mono text-[9.5px] tracking-[0.1em] text-[#f2f0ea]/55 transition-colors hover:border-[#d8ff3c] hover:text-[#d8ff3c]"
                                    >
                                        SHARE
                                    </a>
                                    <button
                                        type="button"
                                        title="Edit this coupon"
                                        onClick={(e) => handleEdit(coupon, e)}
                                        className="flex h-[26px] items-center border border-[#f2f0ea]/[0.14] px-[9px] font-mono text-[9.5px] tracking-[0.1em] text-[#f2f0ea]/55 transition-colors hover:border-[#f2f0ea] hover:text-[#f2f0ea]"
                                    >
                                        EDIT
                                    </button>
                                    <button
                                        type="button"
                                        title="Delete this coupon"
                                        onClick={(e) => handleDelete(coupon.id, e)}
                                        className="flex h-[26px] items-center border border-[#f2f0ea]/[0.14] px-[9px] font-mono text-[9.5px] tracking-[0.1em] text-[#f2f0ea]/55 transition-colors hover:border-[#ff5c2b] hover:text-[#ff5c2b]"
                                    >
                                        ✕
                                    </button>
                                </div>
                            </TableRow>
                        );
                    })
                )}

                <div className="flex items-center gap-3.5 border-t border-[#f2f0ea]/10 px-4 py-3 font-mono text-[10.5px] text-[#f2f0ea]/40">
                    <span className="truncate">
                        {filteredCoupons.length} of {coupons.length} coupons · a row opens its full report
                    </span>
                    <span className="flex-1" />
                    <button
                        type="button"
                        onClick={exportCouponsCsv}
                        className="whitespace-nowrap tracking-[0.14em] transition-colors hover:text-[#d8ff3c]"
                    >
                        EXPORT CSV →
                    </button>
                </div>
            </Panel>

            {/* The design ranks codes by what a rupee of discount brought back,
                which is the only ordering that says which to run again. */}
            {roiRanking.length > 0 && (
                <section>
                    <div className="mb-3 flex items-center gap-3">
                        <span className="whitespace-nowrap font-mono text-[10px] tracking-[0.2em] text-[#f2f0ea]/50">
                            RETURN PER ₹1 DISCOUNTED
                        </span>
                        <span className="h-px flex-1 bg-[#f2f0ea]/10" />
                        <span className="whitespace-nowrap font-mono text-[10px] text-[#f2f0ea]/40">
                            ₹{Math.round(totalGiven).toLocaleString('en-IN')} given · ₹{Math.round(totalEarned).toLocaleString('en-IN')} back
                        </span>
                    </div>
                    <div className="flex flex-col gap-px border border-[#f2f0ea]/10 bg-[#f2f0ea]/10">
                        {roiRanking.map((row) => {
                            const tone = row.roi >= 3 ? '#d8ff3c' : row.roi >= 1 ? 'rgba(242,240,234,.7)' : '#ff5c2b';
                            return (
                                <div
                                    key={row.id}
                                    className="grid items-center gap-3 bg-[#111113] px-4 py-3"
                                    style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,100px) 96px' }}
                                >
                                    <div className="flex min-w-0 flex-col gap-[3px]">
                                        <span className="truncate font-mono text-[12px] font-semibold tracking-[0.06em] text-[#f2f0ea]">
                                            {row.code}
                                        </span>
                                        <span className="truncate font-mono text-[10px] text-[#f2f0ea]/35">
                                            ₹{Math.round(row.given).toLocaleString('en-IN')} given · ₹{Math.round(row.earned).toLocaleString('en-IN')} earned
                                        </span>
                                    </div>
                                    <div className="h-1.5 bg-[#f2f0ea]/[0.08]">
                                        <div
                                            className="h-1.5"
                                            style={{ width: `${Math.min(100, (row.roi / bestRoi) * 100)}%`, background: tone }}
                                        />
                                    </div>
                                    <span className="whitespace-nowrap text-right font-mono text-[12px]" style={{ color: tone }}>
                                        {row.roi.toFixed(1)}×
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}
        </div>
    );
}
