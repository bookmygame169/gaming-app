'use client';

import { useState, useEffect } from 'react';
import { Card, Button, Input, Select } from './ui';
import {
    Search, Plus, Edit2, Trash2, Copy, Check,
    Ticket, Clock, Calendar, Users,
    AlertCircle, ChevronLeft, Eye, Send,
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

export function Coupons({ isMobile, cafeId, onRefresh }: CouponsProps) {
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

    // Fetch coupons
    useEffect(() => {
        fetchCoupons();
    }, [cafeId]);

    const fetchCoupons = async () => {
        if (!cafeId) return;
        setLoading(true);

        const res = await fetch(`/api/owner/coupons?cafeId=${cafeId}`);
        const data = await res.json();
        if (res.ok && Array.isArray(data)) setCoupons(data);
        setLoading(false);
    };

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

        if (formData.discountType === 'percentage' && (!formData.discountValue || parseFloat(formData.discountValue) > 100)) {
            setError('Percentage discount must be between 1 and 100');
            return;
        }

        if (formData.discountType === 'minutes' && !formData.bonusMinutes) {
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
                discount_value: isPercentage ? (parseFloat(formData.discountValue) || 0) : 0,
                max_discount_amount: isPercentage && formData.maxDiscountAmount ? parseFloat(formData.maxDiscountAmount) : null,
                bonus_minutes: !isPercentage ? (parseInt(formData.bonusMinutes) || 0) : (parseInt(formData.bonusMinutes) || 0),
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
        } catch (err: any) {
            setError(err.message || 'Failed to save coupon');
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

    const getDiscountDisplay = (coupon: Coupon) => {
        if (coupon.discount_type === 'percentage' && coupon.discount_value > 0) {
            return `${coupon.discount_value}%`;
        }
        if (coupon.bonus_minutes > 0) {
            return `${coupon.bonus_minutes}m`;
        }
        return '-';
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
                            className="p-2 hover:bg-white/5 rounded-lg transition-colors border border-transparent hover:border-white/[0.08]"
                        >
                            <ChevronLeft className="w-5 h-5 text-slate-400" />
                        </button>
                        <div>
                            <h1 className="text-2xl font-bold text-white tracking-tight">
                                {selectedCoupon ? 'Edit Coupon' : 'Create New Coupon'}
                            </h1>
                            <p className="text-sm text-slate-400">
                                {selectedCoupon ? 'Update campaign details' : 'Configure a new discount campaign'}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                    {/* Left Column: Form */}
                    <div className="lg:col-span-2 space-y-6">
                        <Card padding="lg" className="space-y-8 bg-white/[0.03] border-white/[0.08]">
                            {/* Coupon Code Section */}
                            <div>
                                <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                                    <Ticket size={18} className="text-emerald-500" />
                                    Campaign Details
                                </h3>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-2">Coupon Code</label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                placeholder="e.g., SUMMER50 (auto-gen if empty)"
                                                value={formData.code}
                                                onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                                                className="w-full pl-4 pr-28 py-3 bg-[#09090e] border border-white/[0.09] rounded-xl text-white font-mono text-lg tracking-wider placeholder-slate-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setFormData({ ...formData, code: Math.random().toString(36).substring(2, 8).toUpperCase() })}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded-md text-xs font-semibold border border-emerald-500/30 transition-colors"
                                            >
                                                Generate
                                            </button>
                                        </div>
                                    </div>

                                    {/* Discount Selector */}
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-3">Discount Type</label>
                                        <div className="grid grid-cols-2 gap-4">
                                            <button
                                                type="button"
                                                onClick={() => setFormData({ ...formData, discountType: 'percentage' })}
                                                className={`group relative p-4 rounded-xl border-2 text-left transition-all ${formData.discountType === 'percentage'
                                                        ? 'border-emerald-500 bg-emerald-500/5'
                                                        : 'border-white/[0.08] hover:border-white/[0.09] bg-white/[0.03]'
                                                    }`}
                                            >
                                                <div className={`p-2 w-fit rounded-lg mb-3 ${formData.discountType === 'percentage' ? 'bg-emerald-500 text-white' : 'bg-white/[0.06] text-slate-400 group-hover:bg-white/[0.08]'}`}>
                                                    <div className="text-xl font-bold">%</div>
                                                </div>
                                                <div className="text-sm font-medium text-white mb-0.5">Percentage Off</div>
                                                <div className="text-xs text-slate-400">Reduce price by %</div>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => setFormData({ ...formData, discountType: 'minutes' })}
                                                className={`group relative p-4 rounded-xl border-2 text-left transition-all ${formData.discountType === 'minutes'
                                                        ? 'border-blue-500 bg-blue-500/5'
                                                        : 'border-white/[0.08] hover:border-white/[0.09] bg-white/[0.03]'
                                                    }`}
                                            >
                                                <div className={`p-2 w-fit rounded-lg mb-3 ${formData.discountType === 'minutes' ? 'bg-blue-500 text-white' : 'bg-white/[0.06] text-slate-400 group-hover:bg-white/[0.08]'}`}>
                                                    <Clock size={20} />
                                                </div>
                                                <div className="text-sm font-medium text-white mb-0.5">Free Game Time</div>
                                                <div className="text-xs text-slate-400">Add free minutes</div>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Value Inputs */}
                                    <div className="p-5 rounded-xl bg-[#09090e] border border-white/[0.08]">
                                        {formData.discountType === 'percentage' ? (
                                            <div className="grid grid-cols-2 gap-6">
                                                <div>
                                                    <label className="block text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">Discount Percentage</label>
                                                    <div className="relative">
                                                        <input
                                                            type="number"
                                                            value={formData.discountValue}
                                                            onChange={e => setFormData({ ...formData, discountValue: e.target.value })}
                                                            className="w-full px-4 py-3 bg-white/[0.03] border border-white/[0.09] rounded-lg text-white text-xl font-semibold pr-10 focus:border-emerald-500 focus:outline-none transition-colors"
                                                            placeholder="0"
                                                            max="100"
                                                        />
                                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">%</span>
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">Bonus Free Time (Opt)</label>
                                                    <div className="relative">
                                                        <input
                                                            type="number"
                                                            value={formData.bonusMinutes}
                                                            onChange={e => setFormData({ ...formData, bonusMinutes: e.target.value })}
                                                            className="w-full px-4 py-3 bg-white/[0.03] border border-white/[0.09] rounded-lg text-white text-xl font-semibold pr-16 focus:border-emerald-500 focus:outline-none transition-colors"
                                                            placeholder="0"
                                                        />
                                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm">mins</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div>
                                                <label className="block text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">Free Minutes Amount</label>
                                                <div className="relative">
                                                    <input
                                                        type="number"
                                                        value={formData.bonusMinutes}
                                                        onChange={e => setFormData({ ...formData, bonusMinutes: e.target.value })}
                                                        className="w-full px-4 py-3 bg-white/[0.03] border border-white/[0.09] rounded-lg text-white text-xl font-semibold pr-16 focus:border-blue-500 focus:outline-none transition-colors"
                                                        placeholder="30"
                                                    />
                                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm">mins</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Rules & Limits */}
                            <div className="pt-6 border-t border-white/[0.08]">
                                <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                                    <Filter size={18} className="text-blue-500" />
                                    Rules & Validity
                                </h3>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm text-slate-400 mb-1.5">Valid From</label>
                                            <input
                                                type="date"
                                                value={formData.validFrom}
                                                onChange={e => setFormData({ ...formData, validFrom: e.target.value })}
                                                className="w-full px-3 py-2 bg-[#09090e] border border-white/[0.09] rounded-lg text-white focus:border-emerald-500 focus:outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-slate-400 mb-1.5">Valid Until</label>
                                            <input
                                                type="date"
                                                value={formData.validUntil}
                                                onChange={e => setFormData({ ...formData, validUntil: e.target.value })}
                                                className="w-full px-3 py-2 bg-[#09090e] border border-white/[0.09] rounded-lg text-white focus:border-emerald-500 focus:outline-none"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm text-slate-400 mb-1.5">Min Order Value (₹)</label>
                                            <input
                                                type="number"
                                                value={formData.minOrderAmount}
                                                onChange={e => setFormData({ ...formData, minOrderAmount: e.target.value })}
                                                className="w-full px-3 py-2 bg-[#09090e] border border-white/[0.09] rounded-lg text-white focus:border-emerald-500 focus:outline-none"
                                                placeholder="0"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-slate-400 mb-1.5">Max Uses (Total)</label>
                                            <input
                                                type="number"
                                                value={formData.maxUses}
                                                onChange={e => setFormData({ ...formData, maxUses: e.target.value })}
                                                className="w-full px-3 py-2 bg-[#09090e] border border-white/[0.09] rounded-lg text-white focus:border-emerald-500 focus:outline-none"
                                                placeholder="Unlimited"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-6 flex flex-wrap gap-3">
                                    <label className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-all ${formData.newCustomerOnly
                                            ? 'bg-blue-500/10 border-blue-500 text-blue-400'
                                            : 'bg-white/[0.03] border-white/[0.09] text-slate-400 hover:border-slate-600'
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

                                    <label className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-all ${formData.isActive
                                            ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400'
                                            : 'bg-white/[0.03] border-white/[0.09] text-slate-400 hover:border-slate-600'
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
                                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-center gap-3">
                                    <AlertCircle size={20} className="shrink-0" /> {error}
                                </div>
                            )}

                            <div className="flex gap-4 pt-4">
                                <Button
                                    variant="ghost"
                                    className="flex-1 h-12 text-slate-400"
                                    onClick={() => { setView('list'); setSelectedCoupon(null); resetForm(); }}
                                >
                                    Discard Changes
                                </Button>
                                <Button variant="primary" className="flex-1 h-12 text-lg shadow-lg shadow-emerald-500/20" onClick={handleSave} disabled={saving}>
                                    {saving ? 'Saving...' : selectedCoupon ? 'Update Campaign' : 'Launch Campaign'}
                                </Button>
                            </div>
                        </Card>
                    </div>

                    {/* Right Column: Preview */}
                    <div className="lg:col-span-1 lg:sticky lg:top-8">
                        <div className="space-y-4">
                            <h3 className="text-sm font-medium text-slate-400 uppercase tracking-widest pl-1">Live Preview</h3>

                            <div className="relative bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 shadow-2xl shadow-black/50 overflow-hidden">
                                <div className="absolute top-0 right-0 p-4 opacity-50">
                                    <div className="w-20 h-20 bg-emerald-500/10 rounded-full blur-2xl"></div>
                                </div>

                                <div className="flex justify-between items-start mb-6">
                                    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${formData.isActive
                                            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                            : 'bg-white/[0.04] text-slate-400 border-white/[0.09]'
                                        }`}>
                                        {formData.isActive ? 'Active' : 'Inactive'}
                                    </span>
                                </div>

                                <div className="mb-8 text-center">
                                    <div className="font-mono text-2xl font-bold text-white tracking-widest mb-2">
                                        {formData.code || 'CODE'}
                                    </div>
                                    <div className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-emerald-200 bg-clip-text text-transparent">
                                        {previewDiscountDisplay}
                                    </div>
                                    {formData.discountType === 'percentage' && formData.bonusMinutes && (
                                        <div className="text-sm text-emerald-500 font-medium mt-2">
                                            + {formData.bonusMinutes} mins bonus
                                        </div>
                                    )}
                                </div>

                                {/* Placeholder Progress */}
                                <div className="mb-6">
                                    <div className="flex justify-between text-xs text-slate-400 mb-2">
                                        <span>Redemptions</span>
                                        <span>0 / {formData.maxUses || '∞'}</span>
                                    </div>
                                    <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                                        <div className="h-full bg-emerald-500 rounded-full w-0" />
                                    </div>
                                </div>

                                <div className="space-y-3 pt-6 border-t border-white/[0.06]">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-slate-500 flex items-center gap-2"><Calendar size={14} /> Valid Until</span>
                                        <span className="text-slate-300">{formData.validUntil ? formatDate(formData.validUntil) : 'Forever'}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-slate-500 flex items-center gap-2"><Users size={14} /> Audience</span>
                                        <span className="text-slate-300">{formData.newCustomerOnly ? 'New Customers' : 'Everyone'}</span>
                                    </div>
                                </div>
                            </div>

                            <p className="text-xs text-slate-500 text-center px-4">
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
                            className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                        >
                            <ChevronLeft className="w-5 h-5 text-slate-400" />
                        </button>
                        <div>
                            <h1 className="text-xl font-bold text-white">Coupon Details</h1>
                            <p className="text-sm text-slate-400">General coupon</p>
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
                                <h2 className="text-2xl font-bold font-mono tracking-wider text-white">
                                    {selectedCoupon.code}
                                </h2>
                                <button
                                    onClick={(e) => copyCode(selectedCoupon.code, e)}
                                    className="p-1.5 hover:bg-white/10 rounded transition-colors"
                                >
                                    {copiedCode === selectedCoupon.code
                                        ? <Check size={16} className="text-emerald-500" />
                                        : <Copy size={16} className="text-slate-400" />
                                    }
                                </button>
                            </div>
                            <span className={`inline-block text-xs px-2 py-1 rounded-full ${status === 'active' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                                status === 'expired' ? 'bg-red-500/10 text-red-500 border border-red-500/20' :
                                    'bg-white/[0.04] text-slate-400 border border-white/[0.09]'
                                }`}>
                                {status.charAt(0).toUpperCase() + status.slice(1)}
                            </span>
                        </div>
                        <div className="text-right">
                            <div className="text-3xl font-bold text-emerald-500">
                                {selectedCoupon.discount_type === 'percentage' && selectedCoupon.discount_value > 0
                                    ? `${selectedCoupon.discount_value}% off`
                                    : selectedCoupon.bonus_minutes > 0
                                        ? `${selectedCoupon.bonus_minutes}m free`
                                        : '-'
                                }
                            </div>
                            {selectedCoupon.discount_type === 'percentage' && selectedCoupon.bonus_minutes > 0 && (
                                <div className="text-sm text-emerald-400">+ +{selectedCoupon.bonus_minutes}m free free</div>
                            )}
                        </div>
                    </div>

                    {/* Stats Row */}
                    <div className="grid grid-cols-4 gap-4 mt-6 pt-6 border-t border-white/[0.08]">
                        <div>
                            <div className="text-xs text-slate-500 mb-1">Usage</div>
                            <div className="text-lg font-semibold text-white">
                                {selectedCoupon.uses_count}/{selectedCoupon.max_uses || '∞'} used
                            </div>
                        </div>
                        <div>
                            <div className="text-xs text-slate-500 mb-1">Eligible</div>
                            <div className="text-lg font-semibold text-white">{eligibleCount} customers</div>
                        </div>
                        <div>
                            <div className="text-xs text-slate-500 mb-1">Validity</div>
                            <div className="text-lg font-semibold text-white">
                                {formatDate(selectedCoupon.valid_from)} - {selectedCoupon.valid_until ? formatDate(selectedCoupon.valid_until) : 'No end'}
                            </div>
                        </div>
                        <div>
                            <div className="text-xs text-slate-500 mb-1">Created</div>
                            <div className="text-lg font-semibold text-white">
                                {formatDate(selectedCoupon.created_at)}
                            </div>
                        </div>
                    </div>
                </Card>

                {/* Tabs */}
                <div className="flex border-b border-white/[0.08]">
                    <button
                        onClick={() => setActiveTab('details')}
                        className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${activeTab === 'details'
                            ? 'border-emerald-500 text-white'
                            : 'border-transparent text-slate-400 hover:text-white'
                            }`}
                    >
                        <Info size={16} /> Details
                    </button>
                    <button
                        onClick={() => setActiveTab('eligible')}
                        className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${activeTab === 'eligible'
                            ? 'border-emerald-500 text-white'
                            : 'border-transparent text-slate-400 hover:text-white'
                            }`}
                    >
                        <UserCheck size={16} /> Eligible Customers
                        <span className="ml-1 px-2 py-0.5 text-xs bg-white/[0.06] rounded-full">{eligibleCount}</span>
                    </button>
                </div>

                {/* Tab Content */}
                {activeTab === 'details' ? (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Main Details */}
                        <div className="lg:col-span-2 space-y-6">
                            <Card padding="lg">
                                <h3 className="font-semibold text-white mb-4">Discount Details</h3>
                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <div className="text-xs text-slate-500 uppercase mb-1">Discount Type</div>
                                        <div className="text-white">
                                            {selectedCoupon.discount_type === 'percentage' ? 'Percentage' : 'Free Game Time'}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-slate-500 uppercase mb-1">Discount Value</div>
                                        <div className="text-white font-semibold">
                                            {selectedCoupon.discount_type === 'percentage'
                                                ? `${selectedCoupon.discount_value}% off`
                                                : `${selectedCoupon.bonus_minutes}m free`
                                            }
                                        </div>
                                    </div>
                                    {selectedCoupon.bonus_minutes > 0 && selectedCoupon.discount_type === 'percentage' && (
                                        <div className="col-span-2 p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                                            <div className="text-xs text-emerald-400 uppercase mb-1">Free Minutes</div>
                                            <div className="text-emerald-400 font-semibold">+{selectedCoupon.bonus_minutes}m free</div>
                                        </div>
                                    )}
                                </div>
                            </Card>

                            <Card padding="lg">
                                <h3 className="font-semibold text-white mb-4">Conditions</h3>
                                <div className="space-y-3">
                                    <div className="flex justify-between py-2 border-b border-white/[0.08]">
                                        <span className="text-slate-400">Minimum Spent</span>
                                        <span className="text-white">₹{selectedCoupon.min_order_amount}</span>
                                    </div>
                                    <div className="flex justify-between py-2 border-b border-white/[0.08]">
                                        <span className="text-slate-400">Minimum Visits</span>
                                        <span className="text-white">{selectedCoupon.min_visits || 'None'}</span>
                                    </div>
                                    <div className="flex justify-between py-2 border-b border-white/[0.08]">
                                        <span className="text-slate-400">Inactive Days Required</span>
                                        <span className="text-white">{selectedCoupon.inactive_days_required || 'None'}</span>
                                    </div>
                                    <div className="flex justify-between py-2 border-b border-white/[0.08]">
                                        <span className="text-slate-400">For New Customers Only</span>
                                        <span className="text-white">{selectedCoupon.new_customer_only ? 'Yes' : 'No'}</span>
                                    </div>
                                    <div className="flex justify-between py-2">
                                        <span className="text-slate-400">Maximum Uses</span>
                                        <span className="text-white">{selectedCoupon.max_uses || 'Unlimited'}</span>
                                    </div>
                                </div>
                            </Card>

                            <Card padding="lg">
                                <h3 className="font-semibold text-white mb-4">Usage History</h3>
                                {usageHistory.length === 0 ? (
                                    <div className="text-center py-8 text-slate-500">
                                        <Ticket className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                        <p>This coupon hasn't been used yet</p>
                                    </div>
                                ) : (
                                    <table className="w-full">
                                        <thead>
                                            <tr className="text-xs text-slate-500 uppercase border-b border-white/[0.08]">
                                                <th className="text-left py-2">Date</th>
                                                <th className="text-left py-2">Customer</th>
                                                <th className="text-right py-2">Discount Applied</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {usageHistory.map(usage => (
                                                <tr key={usage.id} className="border-b border-white/[0.06]">
                                                    <td className="py-3 text-slate-300">{formatDate(usage.used_at)}</td>
                                                    <td className="py-3 text-white">{usage.user_phone}</td>
                                                    <td className="py-3 text-right text-emerald-400">₹{usage.discount_applied}</td>
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
                                <h3 className="font-semibold text-white mb-4">Actions</h3>
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
                                        className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                        onClick={(e) => handleDelete(selectedCoupon.id, e)}
                                    >
                                        <Trash2 size={16} className="mr-2" /> Delete Coupon
                                    </Button>
                                </div>
                            </Card>

                            <Card padding="md">
                                <h3 className="font-semibold text-white mb-4">Validity Period</h3>
                                <div className="space-y-3">
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">From</span>
                                        <span className="text-white">{formatDate(selectedCoupon.valid_from)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Until</span>
                                        <span className="text-white">
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
                            <Card padding="md" className="bg-emerald-500/5 border-emerald-500/20">
                                <div className="text-center">
                                    <div className="text-3xl font-bold text-emerald-500">{eligibleCount}</div>
                                    <div className="text-sm text-slate-400">Eligible</div>
                                </div>
                            </Card>
                            <Card padding="md" className="bg-blue-500/5 border-blue-500/20">
                                <div className="text-center">
                                    <div className="text-3xl font-bold text-blue-500">{sentCount}</div>
                                    <div className="text-sm text-slate-400">Sent</div>
                                </div>
                            </Card>
                            <Card padding="md" className="bg-amber-500/5 border-amber-500/20">
                                <div className="text-center">
                                    <div className="text-3xl font-bold text-amber-500">{pendingCount}</div>
                                    <div className="text-sm text-slate-400">Pending</div>
                                </div>
                            </Card>
                        </div>

                        {/* Eligibility Criteria */}
                        <div className="flex items-center gap-2 text-sm text-slate-400">
                            <Filter size={14} />
                            <span>Eligibility:</span>
                            <span className="text-white">All customers from your database are eligible to receive this coupon</span>
                        </div>

                        {/* Customers Table */}
                        <Card padding="none">
                            {loadingCustomers ? (
                                <div className="p-8 text-center text-slate-500">Loading customers...</div>
                            ) : eligibleCustomers.length === 0 ? (
                                <div className="p-8 text-center text-slate-500">
                                    <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                    <p>No eligible customers found</p>
                                </div>
                            ) : (
                                <table className="w-full">
                                    <thead>
                                        <tr className="text-xs text-slate-500 uppercase border-b border-white/[0.08] bg-white/[0.03]">
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
                                            <tr key={customer.id} className="hover:bg-white/5">
                                                <td className="p-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-9 h-9 rounded-full bg-white/[0.08] flex items-center justify-center text-white font-medium">
                                                            {customer.name.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div className="font-medium text-white">{customer.name}</div>
                                                            <div className="text-sm text-slate-500">{customer.phone}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-4 text-center text-white">{customer.visits}</td>
                                                <td className="p-4 text-center text-white">₹{customer.total_spent.toLocaleString()}</td>
                                                <td className="p-4 text-center text-slate-400">{formatDate(customer.last_visit)}</td>
                                                <td className="p-4 text-center">
                                                    <span className={`text-xs px-2 py-1 rounded-full ${customer.coupon_sent
                                                        ? 'bg-emerald-500/10 text-emerald-500'
                                                        : 'bg-amber-500/10 text-amber-500'
                                                        }`}>
                                                        {customer.coupon_sent ? 'Sent' : 'Not Sent'}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-right">
                                                    <Button
                                                        variant="primary"
                                                        size="sm"
                                                        onClick={() => sendCouponWhatsApp(customer, selectedCoupon)}
                                                        className={customer.coupon_sent ? 'bg-emerald-600' : 'bg-emerald-500 hover:bg-emerald-600'}
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

    return (
        <div className="space-y-8">
            {/* Header & Stats */}
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-white tracking-tight">Coupons</h1>
                        <p className="text-slate-400 mt-1">Manage your discount campaigns and offers</p>
                    </div>
                    <Button
                        variant="primary"
                        onClick={() => { resetForm(); setView('create'); setSelectedCoupon(null); }}
                        className="shadow-lg shadow-emerald-500/20"
                    >
                        <Plus size={18} className="mr-2" /> Create New Coupon
                    </Button>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card padding="md" className="bg-gradient-to-br from-slate-900 to-slate-900 border-white/[0.08]">
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-500">
                                <Ticket size={24} />
                            </div>
                            <div>
                                <div className="text-3xl font-bold text-white">{activeCount}</div>
                                <div className="text-sm text-slate-400 font-medium">Active Campaigns</div>
                            </div>
                        </div>
                    </Card>
                    <Card padding="md" className="bg-gradient-to-br from-slate-900 to-slate-900 border-white/[0.08]">
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-xl bg-blue-500/10 text-blue-500">
                                <Users size={24} />
                            </div>
                            <div>
                                <div className="text-3xl font-bold text-white">{totalRedemptions}</div>
                                <div className="text-sm text-slate-400 font-medium">Total Redemptions</div>
                            </div>
                        </div>
                    </Card>
                    <Card padding="md" className="bg-gradient-to-br from-slate-900 to-slate-900 border-white/[0.08]">
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-xl bg-amber-500/10 text-amber-500">
                                <Clock size={24} />
                            </div>
                            <div>
                                <div className="text-3xl font-bold text-white">{expiringSoonCount}</div>
                                <div className="text-sm text-slate-400 font-medium">Expiring Soon</div>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4 p-1">
                <div className="relative flex-1">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                        type="text"
                        placeholder="Search coupons..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all shadow-sm"
                    />
                </div>
                <div className="flex gap-1.5 flex-wrap">
                    {([
                        { v: 'all', l: 'All' },
                        { v: 'active', l: '🟢 Active' },
                        { v: 'expired', l: '🔴 Expired' },
                        { v: 'inactive', l: 'Inactive' },
                    ] as const).map(({ v, l }) => (
                        <button key={v} onClick={() => setStatusFilter(v)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${statusFilter === v ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40' : 'bg-white/[0.04] text-slate-400 border-white/[0.08] hover:text-white'}`}>
                            {l}
                        </button>
                    ))}
                </div>
                <div className="flex gap-1.5 flex-wrap">
                    {([
                        { v: 'all', l: 'All Types' },
                        { v: 'percentage', l: '% Discount' },
                        { v: 'freetime', l: '⏱ Free Time' },
                    ] as const).map(({ v, l }) => (
                        <button key={v} onClick={() => setTypeFilter(v)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${typeFilter === v ? 'bg-blue-600/20 text-blue-300 border-blue-500/40' : 'bg-white/[0.04] text-slate-400 border-white/[0.08] hover:text-white'}`}>
                            {l}
                        </button>
                    ))}
                </div>
            </div>

            {/* Grid Content */}
            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-48 rounded-2xl bg-white/[0.03] animate-pulse border border-white/[0.08]" />
                    ))}
                </div>
            ) : filteredCoupons.length === 0 ? (
                <div className="text-center py-20 bg-white/[0.03]/30 rounded-3xl border border-dashed border-white/[0.08]">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/[0.06] flex items-center justify-center">
                        <Ticket className="w-8 h-8 text-slate-600" />
                    </div>
                    <h3 className="text-lg font-medium text-white mb-1">No coupons found</h3>
                    <p className="text-slate-500 max-w-sm mx-auto mb-6">
                        {search || statusFilter !== 'all' ? 'Try adjusting your filters to find what you looking for.' : 'Get started by creating your first discount coupon.'}
                    </p>
                    {(search || statusFilter !== 'all') ? (
                        <Button variant="ghost" onClick={() => { setSearch(''); setStatusFilter('all'); setTypeFilter('all'); }}>
                            Clear Filters
                        </Button>
                    ) : (
                        <Button variant="primary" onClick={() => { resetForm(); setView('create'); setSelectedCoupon(null); }}>
                            Create Coupon
                        </Button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredCoupons.map(coupon => {
                        const status = getCouponStatus(coupon);
                        const isExpired = status === 'expired';

                        return (
                            <div
                                key={coupon.id}
                                onClick={() => viewCouponDetails(coupon)}
                                className="group relative bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5 hover:border-white/[0.09] transition-all cursor-pointer hover:shadow-xl hover:shadow-black/20 hover:-translate-y-1"
                            >
                                <div className="absolute top-5 right-5 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={(e) => copyCode(coupon.code, e)}
                                        className="p-2 bg-white/[0.06] text-slate-300 rounded-lg hover:bg-white/[0.08] hover:text-white"
                                        title="Copy Code"
                                    >
                                        {copiedCode === coupon.code ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                                    </button>
                                    <a
                                        href={`https://wa.me/?text=${encodeURIComponent(`🎮 Use code *${coupon.code}* for ${coupon.discount_type === 'percentage' ? coupon.discount_value + '% OFF' : coupon.bonus_minutes + ' mins FREE'} on your next gaming session! Book now 🎯`)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg hover:bg-emerald-500/20"
                                        title="Share on WhatsApp"
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                    </a>
                                    <button
                                        onClick={(e) => handleEdit(coupon, e)}
                                        className="p-2 bg-white/[0.06] text-slate-300 rounded-lg hover:bg-white/[0.08] hover:text-white"
                                        title="Edit"
                                    >
                                        <Edit2 size={14} />
                                    </button>
                                </div>

                                <div className="flex justify-between items-start mb-4">
                                    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${status === 'active'
                                        ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                        : status === 'expired'
                                            ? 'bg-red-500/10 text-red-500 border-red-500/20'
                                            : 'bg-white/[0.04] text-slate-400 border-white/[0.09]'
                                        }`}>
                                        {status === 'active' ? 'Active' : status === 'expired' ? 'Expired' : 'Inactive'}
                                    </span>
                                </div>

                                <div className="mb-6">
                                    <div className="font-mono text-xl font-bold text-white tracking-wider mb-1 group-hover:text-emerald-400 transition-colors">
                                        {coupon.code}
                                    </div>
                                    <div className="text-2xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                                        {coupon.discount_type === 'percentage'
                                            ? `${coupon.discount_value}% OFF`
                                            : `${coupon.bonus_minutes} MINS FREE`}
                                    </div>
                                    {coupon.discount_type === 'percentage' && coupon.bonus_minutes > 0 && (
                                        <div className="text-sm text-emerald-500 font-medium mt-1">
                                            + {coupon.bonus_minutes} mins bonus
                                        </div>
                                    )}
                                </div>

                                {/* Progress Bar for Usage */}
                                <div className="mb-4">
                                    <div className="flex justify-between text-xs text-slate-400 mb-2">
                                        <span>Redemptions</span>
                                        <span>
                                            <span className="text-white font-medium">{coupon.uses_count}</span>
                                            {coupon.max_uses ? ` / ${coupon.max_uses}` : ''}
                                        </span>
                                    </div>
                                    <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-emerald-500 rounded-full"
                                            style={{
                                                width: coupon.max_uses
                                                    ? `${Math.min((coupon.uses_count / coupon.max_uses) * 100, 100)}%`
                                                    : '5%' // Small indicator for unlimited
                                            }}
                                        />
                                    </div>
                                </div>

                                <div className="flex items-center justify-between text-xs text-slate-500 pt-4 border-t border-white/[0.06]">
                                    <div className="flex items-center gap-1.5">
                                        <Calendar size={12} />
                                        {isExpired
                                            ? <span className="text-red-400">Expired {formatDate(coupon.valid_until!)}</span>
                                            : <span>Valid until {coupon.valid_until ? formatDate(coupon.valid_until) : 'Forever'}</span>
                                        }
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Users size={12} />
                                        {coupon.new_customer_only ? 'New Users' : 'Everyone'}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
