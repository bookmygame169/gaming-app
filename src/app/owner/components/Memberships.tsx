'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, Button, Input, Select } from './ui';
import {
    Chips,
    WhatToFix,
    type Insight,
    EmptyRow,
    Field,
    Kpis,
    Panel,
    PrimaryButton,
    TableHead,
    TableRow,
    Tag,
} from './consoleUi';
import { XCircle, CheckCircle2, AlertTriangle } from 'lucide-react';
import { buildWhatsAppUrl } from '../utils';

type MembershipPlanType = 'day_pass' | 'hourly_package';
const DAY_PASS_END_LABEL = '10:00 PM';

interface MembershipPlan {
    id: string;
    cafe_id: string;
    name: string;
    description?: string | null;
    price: number;
    hours: number | null;
    is_unlimited?: boolean | null;
    validity_days: number;
    plan_type: MembershipPlanType | 'hourly_bundle';
    console_type: string;
    player_count: 'single' | 'double';
}

interface Subscription {
    id: string;
    cafe_id: string;
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
    is_unlimited?: boolean | null;
    membership_plans: MembershipPlan | null;
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

function normalizePlanType(planType?: string | null): MembershipPlanType {
    return planType === 'day_pass' ? 'day_pass' : 'hourly_package';
}

function isHourlyPlan(planType?: string | null): boolean {
    return normalizePlanType(planType) === 'hourly_package';
}

function isDayPassSubscription(subscription: Subscription): boolean {
    return normalizePlanType(subscription.membership_plans?.plan_type) === 'day_pass';
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
}

export function Memberships({
    cafeId,
    subscriptions,
    membershipPlans,
    activeTimers,
    timerElapsed,
    onStartTimer,
    onStopTimer,
    onRefresh
}: MembershipsProps) {
    const [subTab, setSubTab] = useState<'subscriptions' | 'plans'>('subscriptions');

    // Subscription Filter States
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [planFilter] = useState('all');

    // Plan Management States
    const [showPlanModal, setShowPlanModal] = useState(false);
    const [editingPlan, setEditingPlan] = useState<MembershipPlan | null>(null);
    const [savingPlan, setSavingPlan] = useState(false);

    // Adjust Hours State
    const [editWho, setEditWho] = useState<{ id: string; name: string; phone: string } | null>(null);
    const [editName, setEditName] = useState('');
    const [editPhone, setEditPhone] = useState('');
    const [editSaving, setEditSaving] = useState(false);

    /**
     * Corrects the name and number a membership is held against.
     *
     * The number matters more than it looks. A member scanning the lock screen
     * is found by their phone number and nothing else, so one wrong digit means
     * the plan they paid for cannot be found at the machine - and until now the
     * only way to fix that was to delete the membership and sell it again.
     */
    const handleSaveWho = async () => {
        if (!editWho) return;

        const name = editName.trim();
        const phone = editPhone.replace(/\D/g, '');

        if (name.length < 2) { alert('Enter the customer\'s name.'); return; }
        if (phone.length !== 10) { alert('Enter the 10-digit mobile number their hours are held against.'); return; }

        setEditSaving(true);
        try {
            const res = await fetch('/api/owner/subscriptions', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: editWho.id, updates: { customer_name: name, customer_phone: phone } }),
            });
            if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
            onRefresh();
            setEditWho(null);
        } catch (error: unknown) {
            alert('Could not save those details: ' + getErrorMessage(error));
        } finally {
            setEditSaving(false);
        }
    };

    const [adjustHoursSub, setAdjustHoursSub] = useState<{ id: string; name: string; current: number } | null>(null);
    const [adjustHoursDelta, setAdjustHoursDelta] = useState('');
    const [adjustHoursSaving, setAdjustHoursSaving] = useState(false);

    const handleAdjustHours = async () => {
        if (!adjustHoursSub) return;
        const delta = parseFloat(adjustHoursDelta);
        if (isNaN(delta) || delta === 0) { alert('Enter a non-zero value (e.g. +2 or -1.5)'); return; }
        const newHours = Math.max(0, adjustHoursSub.current + delta);
        setAdjustHoursSaving(true);
        try {
            const res = await fetch('/api/owner/subscriptions', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: adjustHoursSub.id, updates: { hours_remaining: newHours } }),
            });
            if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
            onRefresh();
            setAdjustHoursSub(null);
            setAdjustHoursDelta('');
        } catch (error: unknown) {
            alert('Failed to adjust hours: ' + getErrorMessage(error));
        } finally {
            setAdjustHoursSaving(false);
        }
    };

    // Add Subscription States
    const [showAddSubModal, setShowAddSubModal] = useState(false);
    const [savingSub, setSavingSub] = useState(false);
    const [subCustomerName, setSubCustomerName] = useState('');
    const [subCustomerPhone, setSubCustomerPhone] = useState('');

    // Whether this number reaches a BookMyGame account.
    //
    // A membership is joined to its owner by phone number alone, so one typed
    // against a number nobody has registered goes nowhere - and nothing used to
    // say so. This is the only moment it can still be fixed: the customer is at
    // the counter and can be asked to install the app.
    const [accountState, setAccountState] = useState<'idle' | 'checking' | 'yes' | 'no'>('idle');

    useEffect(() => {
        const digits = subCustomerPhone.replace(/\D/g, '');
        if (digits.length < 10) {
            setAccountState('idle');
            return;
        }

        let cancelled = false;
        setAccountState('checking');

        // Debounced: this fires on every keystroke once ten digits are in, and
        // the owner is often still typing a longer number.
        const timer = setTimeout(async () => {
            try {
                const res = await fetch(`/api/owner/account-check?phone=${encodeURIComponent(digits)}`, {
                    credentials: 'include',
                });
                const data = await res.json().catch(() => ({}));
                if (!cancelled) setAccountState(data?.hasAccount ? 'yes' : 'no');
            } catch {
                // Silent: this sits beside a sale and must never block one.
                if (!cancelled) setAccountState('idle');
            }
        }, 400);

        return () => { cancelled = true; clearTimeout(timer); };
    }, [subCustomerPhone]);
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
    const [newPlanType, setNewPlanType] = useState<MembershipPlanType>('hourly_package');
    const [newPlanUnlimited, setNewPlanUnlimited] = useState(false);
    const [newPlanConsoleType, setNewPlanConsoleType] = useState('PC');
    const [newPlanPlayerCount, setNewPlanPlayerCount] = useState('single');

    const cafeMembershipPlans = useMemo(() => {
        return membershipPlans.filter(plan => !cafeId || plan.cafe_id === cafeId);
    }, [membershipPlans, cafeId]);

    const hourlyMembershipPlans = useMemo(() => {
        return cafeMembershipPlans.filter(plan => isHourlyPlan(plan.plan_type));
    }, [cafeMembershipPlans]);

    const cafeSubscriptions = useMemo(() => {
        return subscriptions.filter(sub => (!cafeId || sub.cafe_id === cafeId) && !isDayPassSubscription(sub));
    }, [subscriptions, cafeId]);

    // Filter Logic
    const MEMBER_COLUMNS = 'minmax(150px,1.4fr) minmax(0,1fr) 158px 96px 200px';
    const PLAN_COLUMNS = 'minmax(160px,1.6fr) 92px 110px 66px 96px 78px 96px';

    /** Everything every plan has taken, which the per-plan bar is a share of. */
    const planRevenueTotal = cafeSubscriptions.reduce(
        (sum, sub) => sum + (Number(sub.amount_paid) || 0), 0
    );


    const downloadCsv = (name: string, header: string[], rows: string[][]) => {
        const escape = (cell: string) => `"${String(cell).replace(/"/g, '""')}"`;
        const csv = [header, ...rows].map((cols) => cols.map(escape).join(',')).join('\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const exportMembersCsv = () => downloadCsv('memberships', 
        ['Member', 'Phone', 'Plan', 'Paid', 'Hours bought', 'Hours left', 'Expires', 'Status'],
        filteredSubscriptions.map((sub) => [
            sub.customer_name || '',
            sub.customer_phone || '',
            sub.membership_plans?.name || '',
            String(sub.amount_paid ?? ''),
            sub.is_unlimited ? 'unlimited' : String(sub.hours_purchased ?? ''),
            sub.is_unlimited ? 'unlimited' : String(sub.hours_remaining ?? ''),
            sub.expiry_date || '',
            sub.status || '',
        ]));

    const exportPlansCsv = () => downloadCsv('membership-plans',
        ['Plan', 'Console', 'Price', 'Hours', 'Validity days', 'Sold', 'Revenue'],
        cafeMembershipPlans.map((plan) => {
            const on = cafeSubscriptions.filter((sub) => sub.membership_plan_id === plan.id);
            return [
                plan.name,
                plan.console_type || '',
                String(plan.price),
                plan.is_unlimited ? 'unlimited' : String(plan.hours ?? ''),
                String(plan.validity_days ?? ''),
                String(on.length),
                String(Math.round(on.reduce((sum, sub) => sum + (Number(sub.amount_paid) || 0), 0))),
            ];
        }));

    /** Passes inside their last week, worth a message before they lapse. */
    const expiringSoon = cafeSubscriptions
        .filter((sub) => {
            if (!sub.expiry_date || sub.status !== 'active') return false;
            const days = Math.ceil((new Date(sub.expiry_date).getTime() - Date.now()) / 86400000);
            return days >= 0 && days <= 7;
        })
        .sort((a, b) => new Date(a.expiry_date || 0).getTime() - new Date(b.expiry_date || 0).getTime());

    /** Which plans are earning, and which passes are about to go quiet. */
    const insights: Insight[] = (() => {
        const out: Insight[] = [];

        const sold = cafeMembershipPlans
            .map((plan) => ({
                plan,
                count: cafeSubscriptions.filter((sub) => sub.membership_plan_id === plan.id).length,
            }));
        const neverSold = sold.filter((p) => p.count === 0);

        // A price list nobody buys from.
        if (cafeMembershipPlans.length > 0 && neverSold.length > 0) {
            out.push({
                id: 'plans-never-sold',
                tone: neverSold.length === cafeMembershipPlans.length ? 'orange' : 'ink',
                title: `${neverSold.length} of ${cafeMembershipPlans.length} plans ${neverSold.length === 1 ? 'has' : 'have'} never sold`,
                detail: `${neverSold.slice(0, 3).map((p) => p.plan.name).join(', ')}${neverSold.length > 3 ? ` and ${neverSold.length - 3} more` : ''}. Either nobody is offered them at the counter, or they are priced beside one that is simply better value.`,
            });
        }

        // Everything riding on a single plan.
        const top = sold.filter((p) => p.count > 0).sort((a, b) => b.count - a.count)[0];
        if (top && cafeSubscriptions.length > 0 && top.count === cafeSubscriptions.length && cafeMembershipPlans.length > 1) {
            out.push({
                id: 'single-plan',
                tone: 'ink',
                title: `Every pass sold is ${top.plan.name}`,
                detail: `₹${Math.round(planRevenueTotal).toLocaleString('en-IN')} of membership revenue from one plan. Worth knowing whether the others are wrong, or just never mentioned.`,
            });
        }

        // Passes running out.
        if (expiringSoon.length > 0) {
            const value = expiringSoon.reduce((sum, sub) => sum + (Number(sub.amount_paid) || 0), 0);
            out.push({
                id: 'expiring',
                tone: 'orange',
                title: `${expiringSoon.length} ${expiringSoon.length === 1 ? 'pass expires' : 'passes expire'} within the week, worth ₹${value.toLocaleString('en-IN')}`,
                detail: 'A membership that lapses quietly is a regular who stops turning up without ever deciding to. The renew row above sends each of them a message.',
            });
        }

        return out;
    })();

    const filteredSubscriptions = useMemo(() => {
        return cafeSubscriptions.filter(sub => {
            const matchesSearch = !search ||
                sub.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
                sub.customer_phone?.includes(search);
            const matchesStatus = statusFilter === 'all' || sub.status === statusFilter;
            const matchesPlan = planFilter === 'all' || sub.membership_plan_id === planFilter;

            return matchesSearch && matchesStatus && matchesPlan;
        });
    }, [cafeSubscriptions, search, statusFilter, planFilter]);

    // Handlers
    const handleSavePlan = async () => {
        if (!newPlanName || !newPlanPrice || !newPlanValidity) {
            alert('Please fill in all required fields');
            return;
        }

        if (isHourlyPlan(newPlanType) && !newPlanUnlimited && !newPlanHours) {
            alert('Please enter hours for an hourly plan');
            return;
        }

        try {
            setSavingPlan(true);
            const planData = {
                name: newPlanName,
                description: newPlanDescription || null,
                price: parseFloat(newPlanPrice),
                hours: isHourlyPlan(newPlanType) && !newPlanUnlimited && newPlanHours ? parseFloat(newPlanHours) : null,
                is_unlimited: isHourlyPlan(newPlanType) && newPlanUnlimited,
                validity_days: newPlanType === 'day_pass' ? 1 : parseInt(newPlanValidity),
                plan_type: normalizePlanType(newPlanType),
                console_type: newPlanConsoleType,
                player_count: newPlanPlayerCount,
            };

            if (!cafeId) throw new Error('No cafe selected');

            const requestBody = editingPlan
                ? { id: editingPlan.id, ...planData }
                : { ...planData, cafe_id: cafeId };

            const res = await fetch('/api/owner/membership-plans', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Failed to save plan');

            setShowPlanModal(false);
            setEditingPlan(null);
            onRefresh();
            resetForm();

        } catch (error: unknown) {
            alert('Error saving plan: ' + getErrorMessage(error));
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
        setNewPlanType('hourly_package');
        setNewPlanUnlimited(false);
        setNewPlanConsoleType('PC');
        setNewPlanPlayerCount('single');
    };

    const handleAddSubscription = async () => {
        if (!subCustomerName.trim()) {
            alert('Customer name is required');
            return;
        }
        if (!subCustomerPhone.trim()) {
            alert('Phone number is required');
            return;
        }
        if (!/^\+?\d[\d\s\-()]{7,14}$/.test(subCustomerPhone.trim())) {
            alert('Invalid phone number (must be 8–15 digits)');
            return;
        }
        if (!subSelectedPlanId) {
            alert('Please select a plan');
            return;
        }

        const selectedPlan = hourlyMembershipPlans.find(p => p.id === subSelectedPlanId);
        if (!selectedPlan) {
            alert('Please select a valid plan');
            return;
        }

        try {
            setSavingSub(true);

            if (!cafeId) throw new Error('No cafe selected');

            const amountPaid = parseFloat(subAmountPaid) || selectedPlan.price;
            const res = await fetch('/api/owner/membership-checkout', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cafe_id: cafeId,
                    customer_name: subCustomerName,
                    customer_phone: subCustomerPhone,
                    items: [{ planId: subSelectedPlanId, quantity: 1 }],
                    final_amount: amountPaid,
                    payment_mode: subPaymentMode,
                }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Failed to create membership booking');

            alert('Membership booking created successfully!');
            setShowAddSubModal(false);
            setSubCustomerName('');
            setSubCustomerPhone('');
            setSubSelectedPlanId('');
            setSubAmountPaid('');
            setSubPaymentMode('cash');
            onRefresh();
        } catch (error: unknown) {
            alert('Error creating membership booking: ' + getErrorMessage(error));
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
        } catch (error: unknown) {
            alert('Error deleting subscription: ' + getErrorMessage(error));
        }
    };

    const openEditModal = (plan: MembershipPlan) => {
        setEditingPlan(plan);
        setNewPlanName(plan.name);
        setNewPlanDescription(plan.description || '');
        setNewPlanPrice(plan.price.toString());
        setNewPlanHours(plan.hours?.toString() || '');
        setNewPlanValidity(plan.validity_days.toString());
        setNewPlanType(normalizePlanType(plan.plan_type));
        setNewPlanUnlimited(plan.is_unlimited === true);
        setNewPlanConsoleType(plan.console_type || 'PC');
        setNewPlanPlayerCount(plan.player_count || 'single');
        setShowPlanModal(true);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-[9px]">
                <Chips
                    items={[
                        { id: 'subscriptions', label: 'MEMBERS', count: cafeSubscriptions.length },
                        { id: 'plans', label: 'PLANS', count: cafeMembershipPlans.length },
                    ]}
                    active={subTab}
                    onPick={(id: string) => setSubTab(id as 'subscriptions' | 'plans')}
                />
                <span className="h-px min-w-[20px] flex-1 bg-[#f2f0ea]/10" />
                <PrimaryButton
                    onClick={() => {
                        if (subTab === 'plans') {
                            resetForm();
                            setEditingPlan(null);
                            setShowPlanModal(true);
                            return;
                        }

                        // Clearing the form and loading the name list are part
                        // of opening this, not extras: without them the modal
                        // carries the last sale's values and the customer
                        // autocomplete never fills.
                        setSubCustomerName('');
                        setSubCustomerPhone('');
                        setSubSelectedPlanId(hourlyMembershipPlans[0]?.id || '');
                        setSubAmountPaid(hourlyMembershipPlans[0]?.price?.toString() || '');
                        setSubPaymentMode('cash');
                        setSuggestions([]);
                        setShowSuggestions(false);
                        if (cafeId && allCustomers.length === 0) {
                            fetch(`/api/owner/coupons/customers?cafeId=${cafeId}`)
                                .then((r) => r.json())
                                .then((data) => { if (Array.isArray(data)) setAllCustomers(data); });
                        }
                        setShowAddSubModal(true);
                    }}
                >
                    {subTab === 'plans' ? '+ NEW PLAN' : '+ SELL A PASS'}
                </PrimaryButton>
            </div>

            {subTab === 'subscriptions' && (
                <div className="flex flex-col gap-[18px]">
                    {(() => {
                        const active = cafeSubscriptions.filter((s) => s.status === 'active');
                        const unlimited = active.filter((s) => s.is_unlimited);
                        const expiringSoon = active.filter((s) => {
                            if (!s.expiry_date) return false;
                            const days = Math.ceil((new Date(s.expiry_date).getTime() - Date.now()) / 86400000);
                            return days >= 0 && days <= 7;
                        });
                        const hoursLeft = active
                            .filter((s) => !s.is_unlimited)
                            .reduce((sum, s) => sum + (s.hours_remaining || 0), 0);

                        return (
                            <Kpis
                                items={[
                                    { label: 'ACTIVE PASSES', value: String(active.length), tone: 'lime', sub: `${cafeSubscriptions.length} sold in total` },
                                    { label: 'HOURS OWED', value: String(Math.round(hoursLeft)), sub: 'paid for, not yet played' },
                                    { label: 'UNLIMITED', value: String(unlimited.length), sub: unlimited.length > 0 ? 'no hours to run down' : 'none on unlimited' },
                                    {
                                        label: 'EXPIRING THIS WEEK',
                                        value: String(expiringSoon.length),
                                        tone: expiringSoon.length > 0 ? 'orange' : 'ink',
                                        sub: expiringSoon.length > 0 ? 'worth a word at the counter' : 'nothing about to lapse',
                                    },
                                ]}
                            />
                        );
                    })()}

                    {/* The passes about to lapse, each one message from renewing.
                        A membership that expires quietly is a customer lost to
                        nothing but forgetting. */}
                    {expiringSoon.length > 0 && (
                        <div className="flex flex-wrap items-center gap-[9px] border border-[#f5c542]/30 bg-[#f5c542]/[0.05] px-[15px] py-[13px]">
                            <span className="whitespace-nowrap font-mono text-[10px] tracking-[0.16em] text-[#f5c542]">
                                RENEW WINDOW · {expiringSoon.length}
                            </span>
                            {expiringSoon.slice(0, 4).map((sub) => {
                                const days = Math.ceil((new Date(sub.expiry_date || 0).getTime() - Date.now()) / 86400000);
                                const phone = sub.customer_phone || '';
                                const message = `Hi ${sub.customer_name || 'there'}, your ${sub.membership_plans?.name || 'pass'} at PlayTime ${days <= 0 ? 'expires today' : `expires in ${days} day${days === 1 ? '' : 's'}`} — want to renew it?`;
                                return (
                                    <a
                                        key={sub.id}
                                        href={phone ? buildWhatsAppUrl(phone, message) : undefined}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 border border-[#f2f0ea]/[0.14] bg-[#111113] px-2.5 py-[7px] transition-colors hover:border-[#d8ff3c]"
                                    >
                                        <span className="whitespace-nowrap text-[12.5px] font-bold text-[#f2f0ea]">
                                            {sub.customer_name || 'Member'}
                                        </span>
                                        <span className="whitespace-nowrap font-mono text-[10px] text-[#f5c542]">
                                            {days <= 0 ? 'today' : `${days}d left`}
                                        </span>
                                        {phone && (
                                            <span className="font-mono text-[9.5px] tracking-[0.1em] text-[#d8ff3c]">RENEW</span>
                                        )}
                                    </a>
                                );
                            })}
                            <span className="min-w-[10px] flex-1" />
                            <span className="whitespace-nowrap font-mono text-[10px] tracking-[0.14em] text-[#f2f0ea]/45">
                                ₹{expiringSoon.reduce((sum, sub) => sum + (Number(sub.amount_paid) || 0), 0).toLocaleString('en-IN')} UP FOR RENEWAL
                            </span>
                        </div>
                    )}

                    <div className="flex flex-wrap items-center gap-[9px]">
                        <Chips
                            items={['all', 'active', 'expired', 'cancelled'].map((status) => ({
                                id: status,
                                label: status.toUpperCase(),
                                count:
                                    status === 'all'
                                        ? cafeSubscriptions.length
                                        : cafeSubscriptions.filter((s) => s.status === status).length,
                            }))}
                            active={statusFilter}
                            onPick={setStatusFilter}
                        />
                        <span className="h-px min-w-[20px] flex-1 bg-[#f2f0ea]/10" />
                        <Field value={search} onChange={setSearch} placeholder="FIND A MEMBER" className="w-[210px]" />
                    </div>

                    <Panel>
                        <TableHead columns={MEMBER_COLUMNS}>
                            <span>MEMBER</span>
                            <span>PLAN</span>
                            <span>HOURS LEFT</span>
                            <span className="text-right">EXPIRES</span>
                            <span className="text-right">ACTIONS</span>
                        </TableHead>

                        {filteredSubscriptions.length === 0 ? (
                            <EmptyRow>
                                {cafeSubscriptions.length === 0
                                    ? 'No passes sold yet. Sell one above and it starts counting here.'
                                    : 'Nobody matches that filter.'}
                            </EmptyRow>
                        ) : (
                            filteredSubscriptions.map((sub) => {
                                const baseHours = sub.hours_remaining || 0;
                                const elapsed = activeTimers.has(sub.id)
                                    ? (timerElapsed.get(sub.id) || 0) / 3600
                                    : 0;
                                const currentRem = Math.max(0, Math.round((baseHours - elapsed) * 10000) / 10000);
                                const percent = (currentRem / (sub.hours_purchased || 1)) * 100;
                                const isRunning = activeTimers.has(sub.id);
                                const isUnlimited = sub.is_unlimited === true;
                                const isDayPass = sub.membership_plans?.plan_type === 'day_pass';
                                const isLowHours = sub.status === 'active' && !isUnlimited && currentRem < 1 && !isDayPass;
                                const daysToExpiry = sub.expiry_date
                                    ? Math.ceil((new Date(sub.expiry_date).getTime() - Date.now()) / 86400000)
                                    : null;
                                const isExpiringSoon =
                                    sub.status === 'active' && daysToExpiry !== null && daysToExpiry >= 0 && daysToExpiry <= 7;

                                const edge = isRunning
                                    ? '#d8ff3c'
                                    : isLowHours || isExpiringSoon
                                        ? '#ff5c2b'
                                        : sub.status !== 'active'
                                            ? 'rgba(242,240,234,.2)'
                                            : 'transparent';

                                return (
                                    <TableRow key={sub.id} columns={MEMBER_COLUMNS} edge={edge}>
                                        <div className="flex min-w-0 flex-col gap-[3px]">
                                            <span className="truncate text-[13.5px] font-bold text-[#f2f0ea]">
                                                {sub.customer_name || 'Customer'}
                                            </span>
                                            <span className="whitespace-nowrap font-mono text-[10px] text-[#f2f0ea]/35">
                                                {sub.customer_phone || '—'}
                                            </span>
                                        </div>

                                        <div className="flex min-w-0 flex-col gap-[3px]">
                                            <span className="truncate font-mono text-[11.5px] text-[#f2f0ea]/75">
                                                {sub.membership_plans?.name || 'Membership'}
                                            </span>
                                            <Tag tone={isRunning ? 'lime' : sub.status === 'active' ? 'muted' : 'muted'}>
                                                {isRunning ? 'PLAYING NOW' : (sub.status || '').toUpperCase()}
                                            </Tag>
                                        </div>

                                        <div className="flex min-w-0 flex-col gap-1.5">
                                            {isUnlimited ? (
                                                <>
                                                    <span className="whitespace-nowrap text-[15px] font-extrabold text-[#d8ff3c]">
                                                        UNLIMITED
                                                    </span>
                                                    <div className="h-[5px] bg-[#d8ff3c]" />
                                                </>
                                            ) : (
                                                <>
                                                    <span
                                                        className="whitespace-nowrap text-[15px] font-extrabold"
                                                        style={{ color: isLowHours ? '#ff5c2b' : '#f2f0ea' }}
                                                    >
                                                        {currentRem.toFixed(1)}
                                                        <span className="font-mono text-[10px] font-medium text-[#f2f0ea]/35">
                                                            {' '}/ {sub.hours_purchased || 0}h
                                                        </span>
                                                    </span>
                                                    <div className="h-[5px] bg-[#f2f0ea]/[0.08]">
                                                        <div
                                                            className="h-[5px]"
                                                            style={{
                                                                width: `${Math.min(100, Math.max(0, percent))}%`,
                                                                background: isLowHours ? '#ff5c2b' : '#d8ff3c',
                                                            }}
                                                        />
                                                    </div>
                                                </>
                                            )}
                                        </div>

                                        <div className="flex flex-col items-end gap-[3px]">
                                            <span
                                                className="whitespace-nowrap font-mono text-[11px]"
                                                style={{ color: isExpiringSoon ? '#ff5c2b' : 'rgba(242,240,234,.7)' }}
                                            >
                                                {sub.expiry_date
                                                    ? new Date(sub.expiry_date)
                                                          .toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
                                                          .toUpperCase()
                                                    : '—'}
                                            </span>
                                            {daysToExpiry !== null && daysToExpiry >= 0 && (
                                                <span className="whitespace-nowrap font-mono text-[10px] text-[#f2f0ea]/35">
                                                    {daysToExpiry}d left
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex flex-wrap justify-end gap-[5px]">
                                            <button
                                                type="button"
                                                onClick={() => (isRunning ? onStopTimer(sub.id) : onStartTimer(sub.id))}
                                                title={isRunning ? 'Stop the clock' : 'Start their session'}
                                                className="flex h-[26px] items-center border px-[9px] font-mono text-[9.5px] tracking-[0.1em] transition-colors"
                                                style={
                                                    isRunning
                                                        ? { borderColor: '#ff5c2b', color: '#ff5c2b' }
                                                        : { borderColor: '#d8ff3c', background: 'rgba(216,255,60,.10)', color: '#d8ff3c' }
                                                }
                                            >
                                                {isRunning ? 'STOP' : 'START'}
                                            </button>
                                            <button
                                                type="button"
                                                title="Correct the name or number"
                                                onClick={() => {
                                                    setEditWho({
                                                        id: sub.id,
                                                        name: sub.customer_name || '',
                                                        phone: sub.customer_phone || '',
                                                    });
                                                    setEditName(sub.customer_name || '');
                                                    setEditPhone(sub.customer_phone || '');
                                                }}
                                                className="flex h-[26px] items-center border border-[#f2f0ea]/[0.14] px-[9px] font-mono text-[9.5px] tracking-[0.1em] text-[#f2f0ea]/55 transition-colors hover:border-[#f2f0ea] hover:text-[#f2f0ea]"
                                            >
                                                EDIT
                                            </button>
                                            {!isUnlimited && (
                                                <button
                                                    type="button"
                                                    title="Adjust hours"
                                                    onClick={() => {
                                                        setAdjustHoursSub({
                                                            id: sub.id,
                                                            name: sub.customer_name || 'Customer',
                                                            current: currentRem,
                                                        });
                                                        setAdjustHoursDelta('');
                                                    }}
                                                    className="flex h-[26px] items-center border border-[#f2f0ea]/[0.14] px-[9px] font-mono text-[9.5px] tracking-[0.1em] text-[#f2f0ea]/55 transition-colors hover:border-[#d8ff3c] hover:text-[#d8ff3c]"
                                                >
                                                    ±H
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                title="Delete this pass"
                                                onClick={() => handleDeleteSubscription(sub.id, sub.customer_name)}
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
                                {filteredSubscriptions.length} of {cafeSubscriptions.length} passes · ₹{Math.round(planRevenueTotal).toLocaleString('en-IN')} taken
                            </span>
                            <span className="flex-1" />
                            <button
                                type="button"
                                onClick={exportMembersCsv}
                                className="whitespace-nowrap tracking-[0.14em] transition-colors hover:text-[#d8ff3c]"
                            >
                                EXPORT CSV →
                            </button>
                        </div>
                    </Panel>
                </div>
            )}

            {subTab === 'plans' && (
                <div className="flex flex-col gap-[18px]">
                    <Panel>
                        <TableHead columns={PLAN_COLUMNS}>
                            <span>PLAN</span>
                            <span className="text-right">PRICE</span>
                            <span className="text-right">INCLUDES</span>
                            <span className="text-right">SOLD</span>
                            <span className="text-right">REVENUE</span>
                            <span className="text-right">EFF ₹/HR</span>
                            <span className="text-right">ACTIONS</span>
                        </TableHead>

                        {cafeMembershipPlans.length === 0 ? (
                            <EmptyRow>
                                No plans yet. Create one and it shows on the customer site straight away.
                            </EmptyRow>
                        ) : (
                            cafeMembershipPlans.map((plan) => {
                                const unlimited = plan.is_unlimited === true;
                                const dayPass = plan.plan_type === 'day_pass';
                                const subsOnPlan = cafeSubscriptions.filter(
                                    (sub) => sub.membership_plan_id === plan.id
                                );
                                const sold = subsOnPlan.length;
                                const revenue = subsOnPlan.reduce(
                                    (sum, sub) => sum + (Number(sub.amount_paid) || 0), 0
                                );
                                // Hours actually taken off an hourly bundle. An
                                // unlimited pass or a day pass has no hour count to
                                // divide by, so it gets a dash rather than a number
                                // that would only look like an answer.
                                const hoursUsed = subsOnPlan.reduce((sum, sub) => {
                                    if (sub.is_unlimited) return sum;
                                    const bought = Number(sub.hours_purchased) || 0;
                                    const left = Number(sub.hours_remaining) || 0;
                                    return sum + Math.max(0, bought - left);
                                }, 0);
                                const effPerHour = !unlimited && !dayPass && hoursUsed > 0
                                    ? revenue / hoursUsed
                                    : null;
                                const revShare = planRevenueTotal > 0 ? (revenue / planRevenueTotal) * 100 : 0;

                                return (
                                    <TableRow
                                        key={plan.id}
                                        columns={PLAN_COLUMNS}
                                        edge={unlimited ? '#d8ff3c' : 'transparent'}
                                    >
                                        <div className="flex min-w-0 flex-col gap-[5px]">
                                            <div className="flex min-w-0 items-center gap-2">
                                                <span className="truncate text-[13.5px] font-bold text-[#f2f0ea]">
                                                    {plan.name}
                                                </span>
                                                <span className="shrink-0 bg-[#f2f0ea]/[0.07] px-1.5 py-0.5 font-mono text-[8.5px] tracking-[0.12em] text-[#f2f0ea]/40">
                                                    {(plan.console_type || 'PC').toUpperCase()}
                                                </span>
                                            </div>
                                            {/* Share of what every plan has taken. */}
                                            <div className="h-1 bg-[#f2f0ea]/[0.08]">
                                                <div
                                                    className="h-1"
                                                    style={{ width: `${revShare}%`, background: unlimited ? '#d8ff3c' : 'rgba(242,240,234,.4)' }}
                                                />
                                            </div>
                                        </div>

                                        <span className="whitespace-nowrap text-right text-[14px] font-extrabold text-[#f2f0ea]">
                                            ₹{plan.price}
                                        </span>

                                        <div className="flex justify-end">
                                            {unlimited ? (
                                                <Tag tone="lime">UNLIMITED</Tag>
                                            ) : dayPass ? (
                                                <Tag>TILL {DAY_PASS_END_LABEL}</Tag>
                                            ) : (
                                                <span className="whitespace-nowrap font-mono text-[11.5px] text-[#f2f0ea]/75">
                                                    {plan.hours}h
                                                </span>
                                            )}
                                        </div>

                                        <span className="whitespace-nowrap text-right font-mono text-[11.5px] text-[#f2f0ea]/70">
                                            {sold}
                                        </span>

                                        <span
                                            className="whitespace-nowrap text-right font-mono text-[11.5px]"
                                            style={{ color: revenue > 0 ? '#f2f0ea' : 'rgba(242,240,234,.3)' }}
                                        >
                                            ₹{Math.round(revenue).toLocaleString('en-IN')}
                                        </span>

                                        <span
                                            className="whitespace-nowrap text-right font-mono text-[11.5px]"
                                            title={effPerHour === null ? 'No hour count to divide by on this kind of plan' : undefined}
                                            style={{ color: effPerHour === null ? 'rgba(242,240,234,.25)' : effPerHour >= 80 ? '#d8ff3c' : effPerHour >= 40 ? 'rgba(242,240,234,.7)' : '#ff5c2b' }}
                                        >
                                            {effPerHour === null ? '—' : `₹${Math.round(effPerHour)}`}
                                        </span>

                                        <div className="flex justify-end gap-[5px]">
                                            <button
                                                type="button"
                                                title="Edit this plan"
                                                onClick={() => openEditModal(plan)}
                                                className="flex h-[26px] items-center border border-[#f2f0ea]/[0.14] px-[9px] font-mono text-[9.5px] tracking-[0.1em] text-[#f2f0ea]/55 transition-colors hover:border-[#d8ff3c] hover:text-[#d8ff3c]"
                                            >
                                                EDIT
                                            </button>
                                            <button
                                                type="button"
                                                title="Delete this plan"
                                                onClick={() => handleDeletePlan(plan.id)}
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
                                {cafeMembershipPlans.length} plan{cafeMembershipPlans.length === 1 ? '' : 's'} · passes are paid for at the counter
                            </span>
                            <span className="flex-1" />
                            <button
                                type="button"
                                onClick={exportPlansCsv}
                                className="whitespace-nowrap tracking-[0.14em] transition-colors hover:text-[#d8ff3c]"
                            >
                                EXPORT CSV →
                            </button>
                        </div>
                    </Panel>
                </div>
            )}

            {/* Add/Edit Plan Modal */}
            {showPlanModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <Card className="w-full max-w-lg bg-[#111113] border-[#f2f0ea]/10" padding="md">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-[#f2f0ea]">
                                {editingPlan ? 'Edit Plan' : 'Create New Plan'}
                            </h3>
                            <button onClick={() => setShowPlanModal(false)} className="text-[#f2f0ea]/50 hover:text-[#f2f0ea]">
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
                                    <label className="block text-xs font-semibold text-[#f2f0ea]/50 mb-1.5 uppercase">Price (₹)</label>
                                    <input
                                        type="number"
                                        className="w-full bg-[#f2f0ea]/[0.06] border-[#f2f0ea]/10 px-3 py-2 text-[#f2f0ea] focus:outline-none focus:border-[#d8ff3c]"
                                        value={newPlanPrice}
                                        onChange={e => setNewPlanPrice(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-[#f2f0ea]/50 mb-1.5 uppercase">Validity (Days)</label>
                                    <input
                                        type="number"
                                        className={`w-full bg-[#f2f0ea]/[0.06] border-[#f2f0ea]/10  px-3 py-2 text-[#f2f0ea] focus:outline-none focus:border-[#d8ff3c] ${newPlanType === 'day_pass' ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        value={newPlanType === 'day_pass' ? '1' : newPlanValidity}
                                        disabled={newPlanType === 'day_pass'}
                                        onChange={e => setNewPlanValidity(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <Select
                                    label="Type"
                                    value={newPlanType}
                                    onChange={(value) => {
                                        const type = normalizePlanType(value);
                                        setNewPlanType(type);
                                        if (type === 'day_pass') setNewPlanValidity('1');
                                    }}
                                    options={[
                                        { value: 'hourly_package', label: 'Hourly Bundle' },
                                        { value: 'day_pass', label: 'Day Pass' }
                                    ]}
                                />
                                {isHourlyPlan(newPlanType) && (
                                    <div>
                                        <label className="block text-xs font-semibold text-[#f2f0ea]/50 mb-1.5 uppercase">Hours</label>
                                        <input
                                            type="number"
                                            disabled={newPlanUnlimited}
                                            placeholder={newPlanUnlimited ? 'No limit' : ''}
                                            className="w-full bg-[#f2f0ea]/[0.06] border-[#f2f0ea]/10 px-3 py-2 text-[#f2f0ea] focus:outline-none focus:border-[#d8ff3c] disabled:opacity-40"
                                            value={newPlanUnlimited ? '' : newPlanHours}
                                            onChange={e => setNewPlanHours(e.target.value)}
                                        />
                                    </div>
                                )}
                            </div>

                            {isHourlyPlan(newPlanType) && (
                                <label className="flex items-start gap-2.5 border border-[#f2f0ea]/10 bg-[#111113] px-3 py-2.5 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={newPlanUnlimited}
                                        onChange={e => setNewPlanUnlimited(e.target.checked)}
                                        className="mt-0.5 accent-[#d8ff3c]"
                                    />
                                    <span>
                                        <span className="block text-sm font-medium text-[#f2f0ea]">Unlimited play</span>
                                        <span className="block text-[11px] text-[#f2f0ea]/50 leading-relaxed">
                                            No hours are deducted and the PC shows no countdown. Members on this
                                            plan play until they end the session themselves.
                                        </span>
                                    </span>
                                </label>
                            )}

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
                                <label className="block text-xs font-semibold text-[#f2f0ea]/50 mb-1.5 uppercase">Description</label>
                                <textarea
                                    className="w-full bg-[#f2f0ea]/[0.06] border-[#f2f0ea]/10 px-3 py-2 text-[#f2f0ea] focus:outline-none focus:border-[#d8ff3c] h-20 text-sm resize-none"
                                    placeholder="Optional details..."
                                    value={newPlanDescription}
                                    onChange={e => setNewPlanDescription(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-8 pt-4 border-t border-[#f2f0ea]/10">
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

            {/* Adjust Hours Modal */}
            {editWho && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <Card className="w-full max-w-sm bg-[#111113] border-[#f2f0ea]/10" padding="md">
                        <h3 className="text-base font-semibold text-[#f2f0ea] mb-1">Correct the details</h3>
                        <p className="text-xs text-[#f2f0ea]/50 mb-4">
                            The number is how a member is found when they scan a PC — a wrong digit and
                            their plan cannot be used at the machine.
                        </p>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-[#f2f0ea]/50 mb-1">Name</label>
                                <input
                                    type="text"
                                    value={editName}
                                    onChange={e => setEditName(e.target.value)}
                                    className="w-full px-3 py-2 bg-[#f2f0ea]/[0.06] border border-[#f2f0ea]/10 text-[#f2f0ea] text-sm focus:outline-none focus:border-[#d8ff3c]"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[#f2f0ea]/50 mb-1">Mobile number</label>
                                <input
                                    type="tel"
                                    inputMode="numeric"
                                    maxLength={10}
                                    value={editPhone}
                                    onChange={e => setEditPhone(e.target.value.replace(/\D/g, ''))}
                                    className="w-full px-3 py-2 bg-[#f2f0ea]/[0.06] border border-[#f2f0ea]/10 text-[#f2f0ea] text-sm font-mono focus:outline-none focus:border-[#d8ff3c]"
                                />
                                {editPhone.length > 0 && editPhone.length !== 10 && (
                                    <p className="text-[11px] text-[#ff5c2b] mt-1">{editPhone.length} of 10 digits</p>
                                )}
                            </div>
                            <div className="flex gap-2 pt-2">
                                <Button variant="secondary" onClick={() => setEditWho(null)} className="flex-1">Cancel</Button>
                                <Button
                                    variant="primary"
                                    onClick={handleSaveWho}
                                    disabled={editSaving || editName.trim().length < 2 || editPhone.length !== 10}
                                    className="flex-1"
                                >
                                    {editSaving ? 'Saving…' : 'Save'}
                                </Button>
                            </div>
                        </div>
                    </Card>
                </div>
            )}

            {adjustHoursSub && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <Card className="w-full max-w-sm bg-[#111113] border-[#f2f0ea]/10" padding="md">
                        <h3 className="text-base font-semibold text-[#f2f0ea] mb-1">Adjust Hours</h3>
                        <p className="text-xs text-[#f2f0ea]/50 mb-4">{adjustHoursSub.name} · Current: <span className="text-[#f2f0ea] font-medium">{adjustHoursSub.current.toFixed(2)}h</span></p>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-[#f2f0ea]/50 mb-1">Add (+) or Remove (−) hours</label>
                                <input
                                    type="number"
                                    step="0.25"
                                    placeholder="e.g. 2 or -1.5"
                                    value={adjustHoursDelta}
                                    onChange={e => setAdjustHoursDelta(e.target.value)}
                                    className="w-full px-3 py-2 bg-[#f2f0ea]/[0.06] border border-[#f2f0ea]/10 text-[#f2f0ea] text-sm focus:outline-none focus:border-[#d8ff3c]"
                                    autoFocus
                                />
                                {adjustHoursDelta && !isNaN(parseFloat(adjustHoursDelta)) && (
                                    <p className="text-xs text-[#f2f0ea]/50 mt-1">
                                        New balance: <span className="text-[#f2f0ea] font-medium">{Math.max(0, adjustHoursSub.current + parseFloat(adjustHoursDelta)).toFixed(2)}h</span>
                                    </p>
                                )}
                            </div>
                            <div className="flex gap-2 pt-2">
                                <Button variant="secondary" onClick={() => setAdjustHoursSub(null)} className="flex-1">Cancel</Button>
                                <Button variant="primary" onClick={handleAdjustHours} disabled={adjustHoursSaving || !adjustHoursDelta} className="flex-1">
                                    {adjustHoursSaving ? 'Saving…' : 'Apply'}
                                </Button>
                            </div>
                        </div>
                    </Card>
                </div>
            )}

            {/* Add Subscription Modal */}
            {showAddSubModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <Card className="w-full max-w-lg bg-[#111113] border-[#f2f0ea]/10" padding="md">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-[#f2f0ea]">Add New Subscription</h3>
                            <button onClick={() => setShowAddSubModal(false)} className="text-[#f2f0ea]/50 hover:text-[#f2f0ea]">
                                <XCircle size={24} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            {/* Customer Name with autocomplete */}
                            <div className="relative">
                                <label className="block text-xs font-semibold text-[#f2f0ea]/50 mb-1.5 uppercase">Customer Name</label>
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
                                    className="w-full px-3 py-2 bg-[#f2f0ea]/[0.06] border border-[#f2f0ea]/10 text-[#f2f0ea] placeholder-[#f2f0ea]/40 focus:outline-none focus:border-[#d8ff3c] text-sm"
                                />
                                {showSuggestions && suggestions.length > 0 && (
                                    <div className="absolute z-50 w-full mt-1 bg-[#f2f0ea]/[0.06] border border-[#f2f0ea]/10 overflow-hidden">
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
                                                className="w-full px-3 py-2.5 text-left hover:bg-[#f2f0ea]/[0.08] flex justify-between items-center"
                                            >
                                                <span className="text-[#f2f0ea] text-sm font-medium">{c.name}</span>
                                                <span className="text-[#f2f0ea]/50 text-xs">{c.phone}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div>
                                <Input
                                    label="Phone Number"
                                    placeholder="Enter phone number (10 digits)"
                                    value={subCustomerPhone}
                                    onChange={v => setSubCustomerPhone(v.replace(/[^\d+\-\s()]/g, '').slice(0, 15))}
                                    type="tel"
                                />

                                {accountState === 'yes' && (
                                    <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-[#d8ff3c]">
                                        <CheckCircle2 size={13} />
                                        Has a BookMyGame account — the hours will show in their app.
                                    </div>
                                )}

                                {accountState === 'no' && (
                                    <div className="mt-1.5 flex items-start gap-1.5 text-[11px] text-[#ff5c2b]/90">
                                        <AlertTriangle size={13} className="mt-0.5 shrink-0 text-[#ff5c2b]" />
                                        <span>
                                            No account on this number yet. The membership still works at the
                                            counter — ask them to sign up with <span className="font-semibold">this same number</span> to
                                            see their hours in the app.
                                        </span>
                                    </div>
                                )}

                                {accountState === 'checking' && (
                                    <div className="mt-1.5 text-[11px] text-[#f2f0ea]/40">Checking…</div>
                                )}
                            </div>

                            <Select
                                label="Membership Plan"
                                value={subSelectedPlanId}
                                onChange={(val) => {
                                    setSubSelectedPlanId(val);
                                    const plan = hourlyMembershipPlans.find(p => p.id === val);
                                    if (plan) setSubAmountPaid(plan.price.toString());
                                }}
                                options={hourlyMembershipPlans.map(p => ({
                                    value: p.id,
                                    label: `${p.name} - ₹${p.price} (${p.hours || 0}h)`
                                }))}
                            />

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-[#f2f0ea]/50 mb-1.5 uppercase">Amount Paid (₹)</label>
                                    <input
                                        type="number"
                                        className="w-full bg-[#f2f0ea]/[0.06] border border-[#f2f0ea]/10 px-3 py-2 text-[#f2f0ea] focus:outline-none focus:border-[#d8ff3c]"
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
                                const plan = hourlyMembershipPlans.find(p => p.id === subSelectedPlanId);
                                if (!plan) return null;
                                return (
                                    <div className="bg-[#f2f0ea]/[0.04] p-3 border border-[#f2f0ea]/[0.07]">
                                        <div className="text-xs text-[#f2f0ea]/50 mb-2 font-semibold uppercase">Plan Summary</div>
                                        <div className="grid grid-cols-3 gap-2 text-sm">
                                            <div>
                                                <span className="text-[#f2f0ea]/40">Hours:</span>{' '}
                                                <span className="text-[#f2f0ea] font-medium">{plan.hours || 'Day Pass'}</span>
                                            </div>
                                            <div>
                                                <span className="text-[#f2f0ea]/40">Valid:</span>{' '}
                                                <span className="text-[#f2f0ea] font-medium">{plan.validity_days} days</span>
                                            </div>
                                            <div>
                                                <span className="text-[#f2f0ea]/40">Console:</span>{' '}
                                                <span className="text-[#f2f0ea] font-medium">{plan.console_type}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>

                        <div className="flex gap-3 mt-8 pt-4 border-t border-[#f2f0ea]/10">
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

            <WhatToFix items={insights} />
        </div>
    );
}
