'use client';

import { useState, useMemo } from 'react';
import { Card, Button, Input, Select } from './ui';
import { Search, Filter, Clock, Calendar, CheckCircle, XCircle, Plus, Edit2, Trash2, Smartphone, Monitor, User, Users } from 'lucide-react';

interface MembershipPlan {
    id: string;
    name: string;
    description?: string;
    price: number;
    hours: number;
    validity_days: number;
    plan_type: 'day_pass' | 'hourly_bundle';
    console_type: string;
    player_count: 'single' | 'double';
}

interface Subscription {
    id: string;
    user_id: string;
    membership_plan_id: string;
    hours_purchased: number;
    hours_remaining: number;
    amount_paid: number;
    purchase_date: string;
    expiry_date: string;
    status: 'active' | 'expired' | 'cancelled';
    payment_mode: string;
    customer_name: string;
    customer_phone: string;
    membership_plans: MembershipPlan;
}

interface MembershipsProps {
    isMobile: boolean;
    cafeId: string;
    cafeOpeningHours?: string;
    subscriptions: Subscription[];
    membershipPlans: MembershipPlan[];
    activeTimers: Map<string, number>;
    timerElapsed: Map<string, number>;
    onStartTimer: (subscriptionId: string) => Promise<void>;
    onStopTimer: (subscriptionId: string) => Promise<void>;
    onRefresh: () => void;
}

// Parse closing time from "Mon-Sun: 10:00 AM - 11:00 PM" format
function parseClosingTime(openingHours: string): string | null {
    const match = openingHours.match(/(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)/i);
    return match ? match[2].trim() : null;
}

export function Memberships({
    isMobile,
    cafeId,
    cafeOpeningHours = '',
    subscriptions,
    membershipPlans,
    activeTimers,
    timerElapsed,
    onStartTimer,
    onStopTimer,
    onRefresh
}: MembershipsProps) {
    const closingTime = cafeOpeningHours ? parseClosingTime(cafeOpeningHours) : null;
    const [subTab, setSubTab] = useState<'subscriptions' | 'plans'>('subscriptions');

    // Subscription Filter States
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [planFilter, setPlanFilter] = useState('all');
    const [viewingSubscription, setViewingSubscription] = useState<Subscription | null>(null);

    // Plan Management States
    const [showPlanModal, setShowPlanModal] = useState(false);
    const [editingPlan, setEditingPlan] = useState<MembershipPlan | null>(null);
    const [savingPlan, setSavingPlan] = useState(false);

    // Add Subscription States
    const [showAddSubModal, setShowAddSubModal] = useState(false);
    const [savingSub, setSavingSub] = useState(false);
    const [subCustomerName, setSubCustomerName] = useState('');
    const [subCustomerPhone, setSubCustomerPhone] = useState('');
    const [subSelectedPlanId, setSubSelectedPlanId] = useState('');
    const [subAmountPaid, setSubAmountPaid] = useState('');
    const [subPaymentMode, setSubPaymentMode] = useState('cash');

    // Customer autocomplete
    const [allCustomers, setAllCustomers] = useState<{ name: string; phone: string }[]>([]);
    const [suggestions, setSuggestions] = useState<{ name: string; phone: string }[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    // New Plan Form States
    const [newPlanName, setNewPlanName] = useState('');
    const [newPlanDescription, setNewPlanDescription] = useState('');
    const [newPlanPrice, setNewPlanPrice] = useState('');
    const [newPlanHours, setNewPlanHours] = useState('');
    const [newPlanValidity, setNewPlanValidity] = useState('30');
    const [newPlanType, setNewPlanType] = useState('hourly_bundle');
    const [newPlanConsoleType, setNewPlanConsoleType] = useState('PC');
    const [newPlanPlayerCount, setNewPlanPlayerCount] = useState('single');

    // Filter Logic
    const filteredSubscriptions = useMemo(() => {
        return subscriptions.filter(sub => {
            const matchesSearch = !search ||
                sub.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
                sub.customer_phone?.includes(search);
            const matchesStatus = statusFilter === 'all' || sub.status === statusFilter;
            const matchesPlan = planFilter === 'all' || sub.membership_plan_id === planFilter;

            return matchesSearch && matchesStatus && matchesPlan;
        });
    }, [subscriptions, search, statusFilter, planFilter]);

    // Handlers
    const handleSavePlan = async () => {
        if (!newPlanName || !newPlanPrice || !newPlanValidity) {
            alert('Please fill in all required fields');
            return;
        }

        try {
            setSavingPlan(true);
            const planData = {
                name: newPlanName,
                description: newPlanDescription,
                price: parseFloat(newPlanPrice),
                hours: newPlanHours ? parseFloat(newPlanHours) : null,
                validity_days: parseInt(newPlanValidity),
                plan_type: newPlanType,
                console_type: newPlanConsoleType,
                player_count: newPlanPlayerCount,
                cafe_id: null // We'll set this below
            };

            if (!cafeId) throw new Error('No cafe selected');

            const upsertData = {
                ...planData,
                cafe_id: cafeId,
            };

            const res = await fetch('/api/owner/membership-plans', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editingPlan ? { id: editingPlan.id, ...planData } : upsertData),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Failed to save plan');

            setShowPlanModal(false);
            setEditingPlan(null);
            onRefresh();
            resetForm();

        } catch (error: any) {
            alert('Error saving plan: ' + error.message);
        } finally {
            setSavingPlan(false);
        }
    };

    const handleDeletePlan = async (planId: string) => {
        if (!confirm('Are you sure? This will hide the plan from new purchases.')) return;

        const res = await fetch(`/api/owner/membership-plans?id=${planId}`, { method: 'DELETE' });
        const result = await res.json();
        if (!res.ok) {
            alert('Error deleting plan: ' + (result.error || 'Unknown error'));
        } else {
            onRefresh();
        }
    };

    const resetForm = () => {
        setNewPlanName('');
        setNewPlanDescription('');
        setNewPlanPrice('');
        setNewPlanHours('');
        setNewPlanValidity('30');
        setNewPlanType('hourly_bundle');
        setNewPlanConsoleType('PC');
        setNewPlanPlayerCount('single');
    };

    const handleAddSubscription = async () => {
        if (!subCustomerName || !subCustomerPhone || !subSelectedPlanId) {
            alert('Please fill in all required fields');
            return;
        }

        const selectedPlan = membershipPlans.find(p => p.id === subSelectedPlanId);
        if (!selectedPlan) {
            alert('Please select a valid plan');
            return;
        }

        try {
            setSavingSub(true);

            if (!cafeId) throw new Error('No cafe selected');

            const now = new Date();
            const expiryDate = new Date(now);
            expiryDate.setDate(expiryDate.getDate() + (selectedPlan.validity_days || 30));

            const res = await fetch('/api/owner/subscriptions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cafe_id: cafeId,
                    customer_name: subCustomerName,
                    customer_phone: subCustomerPhone,
                    membership_plan_id: subSelectedPlanId,
                    hours_purchased: selectedPlan.hours || 24,
                    hours_remaining: selectedPlan.hours || 24,
                    amount_paid: parseFloat(subAmountPaid) || selectedPlan.price,
                    payment_mode: subPaymentMode,
                    purchase_date: now.toISOString(),
                    expiry_date: expiryDate.toISOString(),
                    status: 'active',
                }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Failed to create subscription');

            alert('Subscription created successfully!');
            setShowAddSubModal(false);
            setSubCustomerName('');
            setSubCustomerPhone('');
            setSubSelectedPlanId('');
            setSubAmountPaid('');
            setSubPaymentMode('cash');
            onRefresh();
        } catch (error: any) {
            alert('Error creating subscription: ' + error.message);
        } finally {
            setSavingSub(false);
        }
    };

    const handleDeleteSubscription = async (subId: string, customerName: string) => {
        if (!confirm(`Delete subscription for ${customerName}? This cannot be undone.`)) return;

        try {
            const res = await fetch(`/api/owner/subscriptions?id=${subId}`, { method: 'DELETE' });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Failed to delete subscription');
            onRefresh();
        } catch (error: any) {
            alert('Error deleting subscription: ' + error.message);
        }
    };

    const openEditModal = (plan: MembershipPlan) => {
        setEditingPlan(plan);
        setNewPlanName(plan.name);
        setNewPlanDescription(plan.description || '');
        setNewPlanPrice(plan.price.toString());
        setNewPlanHours(plan.hours?.toString() || '');
        setNewPlanValidity(plan.validity_days.toString());
        setNewPlanType(plan.plan_type);
        setNewPlanConsoleType(plan.console_type || 'PC');
        setNewPlanPlayerCount(plan.player_count as any || 'single');
        setShowPlanModal(true);
    };

    return (
        <div className="space-y-6">
            {/* Tabs */}
            <div className="border-b border-slate-800 flex gap-6">
                <button
                    onClick={() => setSubTab('subscriptions')}
                    className={`pb-3 text-sm font-semibold transition-colors relative ${subTab === 'subscriptions' ? 'text-white' : 'text-slate-500 hover:text-slate-300'
                        }`}
                >
                    Subscriptions
                    {subTab === 'subscriptions' && (
                        <div className="absolute bottom-0 left-0 w-full h-0.5 bg-emerald-500 rounded-t-full" />
                    )}
                </button>
                <button
                    onClick={() => setSubTab('plans')}
                    className={`pb-3 text-sm font-semibold transition-colors flex items-center gap-2 relative ${subTab === 'plans' ? 'text-white' : 'text-slate-500 hover:text-slate-300'
                        }`}
                >
                    Plans
                    <span className="bg-slate-800 text-slate-400 text-[10px] px-1.5 py-0.5 rounded-md">
                        {membershipPlans.length}
                    </span>
                    {subTab === 'plans' && (
                        <div className="absolute bottom-0 left-0 w-full h-0.5 bg-emerald-500 rounded-t-full" />
                    )}
                </button>
            </div>

            {/* Subscriptions Content */}
            {subTab === 'subscriptions' && (
                <div className="space-y-4">
                    {/* Filters */}
                    <Card padding="sm" className="bg-slate-900/40 border-slate-800/60">
                        <div className="flex flex-col md:flex-row gap-4">
                            <div className="flex-1 relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                                <input
                                    type="text"
                                    placeholder="Search customer..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
                                />
                            </div>
                            <div className="flex gap-2 items-center">
                                <Select
                                    value={statusFilter}
                                    onChange={setStatusFilter}
                                    options={[
                                        { value: 'all', label: 'All Status' },
                                        { value: 'active', label: 'Active' },
                                        { value: 'expired', label: 'Expired' },
                                    ]}
                                    className="w-32"
                                />
                                <Select
                                    value={planFilter}
                                    onChange={setPlanFilter}
                                    options={[
                                        { value: 'all', label: 'All Plans' },
                                        ...membershipPlans.map(p => ({ value: p.id, label: p.name }))
                                    ]}
                                    className="w-40"
                                />
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={() => {
                                        setSubCustomerName('');
                                        setSubCustomerPhone('');
                                        setSubSelectedPlanId(membershipPlans[0]?.id || '');
                                        setSubAmountPaid(membershipPlans[0]?.price?.toString() || '');
                                        setSubPaymentMode('cash');
                                        setSuggestions([]);
                                        setShowSuggestions(false);
                                        // Pre-fetch customers for autocomplete
                                        if (cafeId && allCustomers.length === 0) {
                                            fetch(`/api/owner/coupons/customers?cafeId=${cafeId}`)
                                                .then(r => r.json())
                                                .then(data => { if (Array.isArray(data)) setAllCustomers(data); });
                                        }
                                        setShowAddSubModal(true);
                                    }}
                                    className="whitespace-nowrap"
                                >
                                    <Plus size={16} className="mr-1" /> Add Subscription
                                </Button>
                            </div>
                        </div>
                    </Card>

                    {/* List */}
                    <div className="space-y-3">
                        {filteredSubscriptions.length === 0 ? (
                            <div className="text-center py-12 text-slate-500">
                                <Users size={40} className="mx-auto mb-3 opacity-20" />
                                <p>No subscriptions found matching filters</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-3">
                                {filteredSubscriptions.map(sub => {
                                    const baseHours = sub.hours_remaining || 0;
                                    const elapsed = activeTimers.has(sub.id)
                                        ? (timerElapsed.get(sub.id) || 0) / 3600
                                        : 0;
                                    const currentRem = Math.max(0, baseHours - elapsed);
                                    const percent = (currentRem / (sub.hours_purchased || 1)) * 100;
                                    const isRunning = activeTimers.has(sub.id);

                                    return (
                                        <Card key={sub.id} padding="sm" className="hover:border-slate-600 transition-colors">
                                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                                {/* User Info */}
                                                <div className="flex items-center gap-3 md:w-1/4">
                                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-xs font-bold text-white">
                                                        {sub.customer_name?.[0]?.toUpperCase() || 'U'}
                                                    </div>
                                                    <div>
                                                        <div className="font-medium text-white text-sm">{sub.customer_name}</div>
                                                        <div className="text-xs text-slate-500">{sub.customer_phone}</div>
                                                    </div>
                                                </div>

                                                {/* Plan Info */}
                                                <div className="md:w-1/4">
                                                    <div className="text-xs text-slate-400 mb-1">{sub.membership_plans?.name || 'Unknown Plan'}</div>
                                                    <div className="flex items-center gap-2 text-xs">
                                                        <span className={`px-2 py-0.5 rounded-full ${sub.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
                                                            }`}>
                                                            {sub.status}
                                                        </span>
                                                        <span className="text-slate-600">•</span>
                                                        <span className="text-slate-400">Paid ₹{sub.amount_paid}</span>
                                                    </div>
                                                </div>

                                                {/* Progress */}
                                                <div className="flex-1 md:max-w-xs">
                                                    {sub.membership_plans?.plan_type === 'day_pass' ? (
                                                        <div className="flex justify-between text-xs mb-1.5">
                                                            <span className="text-slate-400">Ends at</span>
                                                            <span className={`font-mono font-medium ${isRunning ? 'text-emerald-400' : 'text-slate-200'}`}>
                                                                {closingTime || `${Math.floor(currentRem)}h ${Math.round((currentRem % 1) * 60)}m`}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <div className="flex justify-between text-xs mb-1.5">
                                                            <span className="text-slate-400">Balance</span>
                                                            <span className={`font-mono font-medium ${isRunning ? 'text-emerald-400' : 'text-slate-200'}`}>
                                                                {Math.floor(currentRem)}h {Math.round((currentRem % 1) * 60)}m
                                                            </span>
                                                        </div>
                                                    )}
                                                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full transition-all duration-1000 ${percent < 10 ? 'bg-red-500' : percent < 30 ? 'bg-amber-500' : 'bg-emerald-500'
                                                                }`}
                                                            style={{ width: `${percent}%` }}
                                                        />
                                                    </div>
                                                </div>

                                                {/* Actions */}
                                                <div className="flex items-center gap-2 md:justify-end md:w-auto">
                                                    {isRunning ? (
                                                        <Button
                                                            variant="danger"
                                                            size="sm"
                                                            onClick={() => onStopTimer(sub.id)}
                                                            className="flex-1 md:flex-none"
                                                        >
                                                            Stop
                                                        </Button>
                                                    ) : sub.status === 'active' ? (
                                                        <Button
                                                            variant="primary"
                                                            size="sm"
                                                            onClick={() => onStartTimer(sub.id)}
                                                            className="flex-1 md:flex-none"
                                                        >
                                                            Start
                                                        </Button>
                                                    ) : null}
                                                    <Button
                                                        variant="danger"
                                                        size="sm"
                                                        onClick={() => handleDeleteSubscription(sub.id, sub.customer_name)}
                                                        className="flex-none"
                                                    >
                                                        <Trash2 size={14} />
                                                    </Button>
                                                </div>
                                            </div>
                                        </Card>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Plans Content */}
            {subTab === 'plans' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {membershipPlans.map((plan, i) => {
                            const colors = plan.plan_type === 'day_pass'
                                ? { bg: 'bg-blue-500/5', border: 'border-blue-500/20', text: 'text-blue-400', icon: '☀️' }
                                : i % 3 === 0
                                    ? { bg: 'bg-purple-500/5', border: 'border-purple-500/20', text: 'text-purple-400', icon: '⏱️' }
                                    : i % 3 === 1
                                        ? { bg: 'bg-emerald-500/5', border: 'border-emerald-500/20', text: 'text-emerald-400', icon: '⏳' }
                                        : { bg: 'bg-orange-500/5', border: 'border-orange-500/20', text: 'text-orange-400', icon: '🎯' };

                            return (
                                <Card
                                    key={plan.id}
                                    padding="none"
                                    className={`relative overflow-hidden group hover:border-slate-600 transition-all ${colors.bg} ${colors.border} border`}
                                >
                                    <div className="p-5">
                                        <div className="flex justify-between items-start mb-4">
                                            <div className={`p-2 rounded-lg bg-slate-900/50 ${colors.text}`}>
                                                {plan.console_type === 'PC' ? <Monitor size={20} /> : <Smartphone size={20} />}
                                            </div>
                                            <div className="text-2xl opacity-20 filter grayscale">{colors.icon}</div>
                                        </div>

                                        <h3 className="text-lg font-bold text-white mb-1">{plan.name}</h3>
                                        <p className="text-xs text-slate-400 mb-4 h-8 line-clamp-2">
                                            {plan.description || `${plan.hours} hours valid for ${plan.validity_days} days`}
                                        </p>

                                        <div className="flex items-baseline gap-1 mb-4">
                                            <span className="text-2xl font-bold text-white">₹{plan.price}</span>
                                            {plan.plan_type !== 'day_pass' && (
                                                <span className="text-xs text-slate-500">/ {plan.hours}h</span>
                                            )}
                                        </div>

                                        <div className="flex flex-wrap gap-2 mb-6">
                                            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded bg-slate-900/40 text-slate-400">
                                                {plan.validity_days} Days
                                            </span>
                                            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded bg-slate-900/40 text-slate-400 flex items-center gap-1">
                                                {plan.player_count === 'single' ? <User size={10} /> : <Users size={10} />}
                                                {plan.player_count}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2">
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={() => openEditModal(plan)}
                                                className="w-full"
                                            >
                                                <Edit2 size={14} className="mr-2" /> Edit
                                            </Button>
                                            <Button
                                                variant="danger"
                                                size="sm"
                                                onClick={() => handleDeletePlan(plan.id)}
                                                className="w-full"
                                            >
                                                <Trash2 size={14} className="mr-2" /> Delete
                                            </Button>
                                        </div>
                                    </div>
                                </Card>
                            )
                        })}

                        {/* Add New Plan Card */}
                        <button
                            onClick={() => {
                                resetForm();
                                setEditingPlan(null);
                                setShowPlanModal(true);
                            }}
                            className="group flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-800 rounded-2xl hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all text-slate-500 hover:text-emerald-500"
                        >
                            <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform group-hover:bg-emerald-500/20">
                                <Plus size={24} />
                            </div>
                            <span className="font-semibold text-sm">Create New Plan</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Add/Edit Plan Modal */}
            {showPlanModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <Card className="w-full max-w-lg bg-slate-900 border-slate-700" padding="md">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-white">
                                {editingPlan ? 'Edit Plan' : 'Create New Plan'}
                            </h3>
                            <button onClick={() => setShowPlanModal(false)} className="text-slate-400 hover:text-white">
                                <XCircle size={24} />
                            </button>
                        </div>

                        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                            <Input
                                label="Plan Name"
                                placeholder="e.g. Gold Bundle"
                                value={newPlanName}
                                onChange={setNewPlanName}
                            />

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Price (₹)</label>
                                    <input
                                        type="number"
                                        className="w-full bg-slate-800 border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                                        value={newPlanPrice}
                                        onChange={e => setNewPlanPrice(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Validity (Days)</label>
                                    <input
                                        type="number"
                                        className="w-full bg-slate-800 border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                                        value={newPlanValidity}
                                        onChange={e => setNewPlanValidity(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <Select
                                    label="Type"
                                    value={newPlanType}
                                    onChange={setNewPlanType}
                                    options={[
                                        { value: 'hourly_bundle', label: 'Hourly Bundle' },
                                        { value: 'day_pass', label: 'Day Pass' }
                                    ]}
                                />
                                {newPlanType === 'hourly_bundle' && (
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Hours</label>
                                        <input
                                            type="number"
                                            className="w-full bg-slate-800 border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                                            value={newPlanHours}
                                            onChange={e => setNewPlanHours(e.target.value)}
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <Select
                                    label="Console"
                                    value={newPlanConsoleType}
                                    onChange={setNewPlanConsoleType}
                                    options={[
                                        { value: 'PC', label: 'PC' },
                                        { value: 'PS5', label: 'PS5' },
                                        { value: 'PS4', label: 'PS4' },
                                        { value: 'Xbox', label: 'Xbox' },
                                        { value: 'VR', label: 'VR' },
                                        { value: 'Steering Wheel', label: 'Steering Wheel' },
                                        { value: 'Racing Sim', label: 'Racing Sim' },
                                        { value: 'Pool', label: 'Pool' },
                                        { value: 'Snooker', label: 'Snooker' },
                                        { value: 'Arcade', label: 'Arcade' },
                                    ]}
                                />
                                <Select
                                    label="Players"
                                    value={newPlanPlayerCount}
                                    onChange={setNewPlanPlayerCount}
                                    options={[
                                        { value: 'single', label: 'Single Player' },
                                        { value: 'double', label: 'Double Player' }
                                    ]}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Description</label>
                                <textarea
                                    className="w-full bg-slate-800 border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500 h-20 text-sm resize-none"
                                    placeholder="Optional details..."
                                    value={newPlanDescription}
                                    onChange={e => setNewPlanDescription(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-8 pt-4 border-t border-slate-800">
                            <Button
                                variant="secondary"
                                onClick={() => setShowPlanModal(false)}
                                className="flex-1"
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="primary"
                                onClick={handleSavePlan}
                                disabled={savingPlan}
                                className="flex-1"
                            >
                                {savingPlan ? 'Saving...' : 'Save Plan'}
                            </Button>
                        </div>
                    </Card>
                </div>
            )}

            {/* Add Subscription Modal */}
            {showAddSubModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <Card className="w-full max-w-lg bg-slate-900 border-slate-700" padding="md">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-white">Add New Subscription</h3>
                            <button onClick={() => setShowAddSubModal(false)} className="text-slate-400 hover:text-white">
                                <XCircle size={24} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            {/* Customer Name with autocomplete */}
                            <div className="relative">
                                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Customer Name</label>
                                <input
                                    type="text"
                                    placeholder="Enter customer name"
                                    value={subCustomerName}
                                    autoComplete="off"
                                    onChange={e => {
                                        const val = e.target.value;
                                        setSubCustomerName(val);
                                        if (val.trim().length > 0) {
                                            const filtered = allCustomers.filter(c =>
                                                c.name.toLowerCase().includes(val.toLowerCase())
                                            ).slice(0, 6);
                                            setSuggestions(filtered);
                                            setShowSuggestions(filtered.length > 0);
                                        } else {
                                            setSuggestions([]);
                                            setShowSuggestions(false);
                                        }
                                    }}
                                    onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                                    onFocus={() => {
                                        if (suggestions.length > 0) setShowSuggestions(true);
                                    }}
                                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm"
                                />
                                {showSuggestions && suggestions.length > 0 && (
                                    <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
                                        {suggestions.map((c, i) => (
                                            <button
                                                key={i}
                                                type="button"
                                                onMouseDown={() => {
                                                    setSubCustomerName(c.name);
                                                    setSubCustomerPhone(c.phone);
                                                    setSuggestions([]);
                                                    setShowSuggestions(false);
                                                }}
                                                className="w-full px-3 py-2.5 text-left hover:bg-slate-700 flex justify-between items-center"
                                            >
                                                <span className="text-white text-sm font-medium">{c.name}</span>
                                                <span className="text-slate-400 text-xs">{c.phone}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <Input
                                label="Phone Number"
                                placeholder="Enter phone number"
                                value={subCustomerPhone}
                                onChange={setSubCustomerPhone}
                            />

                            <Select
                                label="Membership Plan"
                                value={subSelectedPlanId}
                                onChange={(val) => {
                                    setSubSelectedPlanId(val);
                                    const plan = membershipPlans.find(p => p.id === val);
                                    if (plan) setSubAmountPaid(plan.price.toString());
                                }}
                                options={membershipPlans.map(p => ({
                                    value: p.id,
                                    label: `${p.name} - ₹${p.price} (${p.hours || 'Day'}${p.hours ? 'h' : ' Pass'})`
                                }))}
                            />

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Amount Paid (₹)</label>
                                    <input
                                        type="number"
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                                        value={subAmountPaid}
                                        onChange={e => setSubAmountPaid(e.target.value)}
                                    />
                                </div>
                                <Select
                                    label="Payment Mode"
                                    value={subPaymentMode}
                                    onChange={setSubPaymentMode}
                                    options={[
                                        { value: 'cash', label: 'Cash' },
                                        { value: 'upi', label: 'UPI' },
                                    ]}
                                />
                            </div>

                            {subSelectedPlanId && (() => {
                                const plan = membershipPlans.find(p => p.id === subSelectedPlanId);
                                if (!plan) return null;
                                return (
                                    <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
                                        <div className="text-xs text-slate-400 mb-2 font-semibold uppercase">Plan Summary</div>
                                        <div className="grid grid-cols-3 gap-2 text-sm">
                                            <div>
                                                <span className="text-slate-500">Hours:</span>{' '}
                                                <span className="text-white font-medium">{plan.hours || 'Day Pass'}</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-500">Valid:</span>{' '}
                                                <span className="text-white font-medium">{plan.validity_days} days</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-500">Console:</span>{' '}
                                                <span className="text-white font-medium">{plan.console_type}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>

                        <div className="flex gap-3 mt-8 pt-4 border-t border-slate-800">
                            <Button
                                variant="secondary"
                                onClick={() => setShowAddSubModal(false)}
                                className="flex-1"
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="primary"
                                onClick={handleAddSubscription}
                                disabled={savingSub}
                                className="flex-1"
                            >
                                {savingSub ? 'Creating...' : 'Create Subscription'}
                            </Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}
