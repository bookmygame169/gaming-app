'use client';

import { ReactNode, useState } from 'react';
import { RefreshCw, Bell, LayoutDashboard, CreditCard, CalendarCheck, Users, BarChart3, Package, Ticket, Settings, Gamepad2, Trophy, ChevronDown, Crown, TicketPercent, LineChart } from 'lucide-react';
import { MobileMenuButton, Sidebar } from './Sidebar';

interface DashboardLayoutProps {
    children: ReactNode;
    activeTab: string;
    onTabChange: (tab: string) => void;
    cafeName: string;
    isMobile: boolean;
    mobileMenuOpen: boolean;
    setMobileMenuOpen: (open: boolean) => void;
    title: string;
    onRefresh?: () => void;
}

const DESKTOP_PRIMARY_TABS = [
    { id: 'dashboard',   label: 'Dashboard',   icon: LayoutDashboard },
    { id: 'billing',     label: 'Billing',      icon: CreditCard },
    { id: 'bookings',    label: 'Bookings',     icon: CalendarCheck },
    { id: 'reports',     label: 'Reports',      icon: LineChart },
    { id: 'inventory',   label: 'Inventory',    icon: Package },
    { id: 'memberships', label: 'Memberships',  icon: Crown },
    { id: 'coupons',     label: 'Coupons',      icon: TicketPercent },
    { id: 'customers',   label: 'Customers',    icon: Users },
];

const DESKTOP_MORE_TABS = [
    { id: 'stations',      label: 'Stations',    icon: Gamepad2 },
    { id: 'subscriptions', label: 'Tournament',  icon: Trophy },
    { id: 'settings',      label: 'Settings',    icon: Settings },
];

const TAB_LABELS = Object.fromEntries(
    [...DESKTOP_PRIMARY_TABS, ...DESKTOP_MORE_TABS].map((tab) => [tab.id, tab.label])
);

export function DashboardLayout({
    children,
    activeTab,
    onTabChange,
    cafeName,
    isMobile,
    mobileMenuOpen,
    setMobileMenuOpen,
    onRefresh,
}: DashboardLayoutProps) {
    const [spinning, setSpinning] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);

    const handleRefresh = () => {
        if (!onRefresh || spinning) return;
        setSpinning(true);
        onRefresh();
        setTimeout(() => setSpinning(false), 800);
    };

    const handleLogout = async () => {
        if (confirm('Are you sure you want to logout?')) {
            try { await fetch('/api/owner/login', { method: 'DELETE', credentials: 'include' }); } catch {}
            window.location.href = '/owner/login';
        }
    };

    const initials = cafeName.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');
    const isMoreActive = DESKTOP_MORE_TABS.some(t => t.id === activeTab);
    const activeTabLabel = TAB_LABELS[activeTab] || 'Dashboard';

    return (
        <div className="min-h-screen owner-bg flex flex-col">

            {/* ── DESKTOP HEADER ── */}
            <div className="hidden lg:block sticky top-0 z-40"
                style={{ background: 'rgba(10,10,15,0.92)', backdropFilter: 'blur(24px)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="px-8 pt-5 pb-0">

                    {/* Row 1: Brand + User controls */}
                    <div className="flex items-center justify-between mb-4">
                        {/* Brand */}
                        <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-lg relative overflow-hidden flex items-center justify-center"
                                style={{ background: 'linear-gradient(140deg, #06b6d4 0%, #0891b2 55%, #1e1b4b 100%)' }}>
                                <Gamepad2 size={17} className="text-white relative z-10" />
                                <span className="absolute inset-0 grid-dots opacity-30" />
                            </div>
                            <div>
                                <div className="text-[15px] font-bold tracking-tight leading-none">
                                    BookMyGame<span style={{ color: '#06b6d4' }}>.</span>
                                </div>
                                <div className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5" style={{ fontVariant: 'all-small-caps', letterSpacing: '0.12em', fontWeight: 600 }}>
                                    Owner Console · {cafeName}
                                </div>
                            </div>
                        </div>

                        {/* Right controls */}
                        <div className="flex items-center gap-2">
                            {onRefresh && (
                                <button onClick={handleRefresh} title="Refresh"
                                    className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:text-white hover:border-white/20 transition-colors"
                                    style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
                                    <RefreshCw size={14} className={spinning ? 'animate-spin' : ''} />
                                </button>
                            )}
                            {/* Bell with cyan dot */}
                            <button className="relative w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:border-white/20 transition-colors"
                                style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
                                <Bell size={15} />
                                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full" style={{ background: '#06b6d4' }} />
                            </button>
                            {/* User button */}
                            <button onClick={handleLogout}
                                className="flex items-center gap-2 h-9 pl-1 pr-3 rounded-lg hover:border-white/20 transition-colors"
                                style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
                                <span className="w-7 h-7 rounded-md flex items-center justify-center text-[11px] font-bold text-white"
                                    style={{ background: 'linear-gradient(135deg, #06b6d4, #8b5cf6)' }}>
                                    {initials || 'O'}
                                </span>
                                <span className="text-sm text-slate-200 max-w-[90px] truncate">{cafeName}</span>
                                <ChevronDown size={13} className="text-slate-500" />
                            </button>
                        </div>
                    </div>

                    {/* Row 2: Tab nav */}
                    <nav className="flex items-center gap-1 relative overflow-x-auto no-scrollbar">
                        {DESKTOP_PRIMARY_TABS.map(tab => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;
                            return (
                                <button key={tab.id} onClick={() => onTabChange(tab.id)}
                                    className={`relative flex items-center gap-2 px-3.5 h-10 rounded-xl text-[13px] transition-all whitespace-nowrap
                                        ${isActive ? 'text-white' : 'text-slate-500 hover:text-white'}`}
                                    style={{
                                        background: isActive ? 'rgba(255,255,255,0.04)' : 'transparent',
                                        border: `1px solid ${isActive ? 'rgba(255,255,255,0.12)' : 'transparent'}`,
                                    }}>
                                    <Icon size={14} />
                                    {tab.label}
                                    {isActive && (
                                        <span className="absolute left-3 right-3 h-0.5 rounded-full"
                                            style={{ bottom: -7, background: '#06b6d4' }} />
                                    )}
                                </button>
                            );
                        })}

                        {/* More dropdown */}
                        <div className="relative">
                            <button onClick={() => setMoreOpen(p => !p)}
                                className={`relative flex items-center gap-2 px-3.5 h-10 rounded-xl text-[13px] transition-all whitespace-nowrap
                                    ${isMoreActive ? 'text-white' : 'text-slate-500 hover:text-white'}`}
                                style={{
                                    background: isMoreActive ? 'rgba(255,255,255,0.04)' : 'transparent',
                                    border: `1px solid ${isMoreActive ? 'rgba(255,255,255,0.12)' : 'transparent'}`,
                                }}>
                                More <ChevronDown size={12} className={`transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
                                {isMoreActive && (
                                    <span className="absolute left-3 right-3 h-0.5 rounded-full"
                                        style={{ bottom: -7, background: '#06b6d4' }} />
                                )}
                            </button>
                            {moreOpen && (
                                <div className="absolute top-full left-0 mt-2 w-44 glass rounded-xl overflow-hidden py-1 z-50"
                                    onClick={() => setMoreOpen(false)}>
                                    {DESKTOP_MORE_TABS.map(tab => {
                                        const Icon = tab.icon;
                                        return (
                                            <button key={tab.id} onClick={() => onTabChange(tab.id)}
                                                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] transition-colors
                                                    ${activeTab === tab.id ? 'text-cyan-400 bg-cyan-500/10' : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'}`}>
                                                <Icon size={14} />{tab.label}
                                            </button>
                                        );
                                    })}
                                    <div className="border-t border-white/[0.06] mt-1 pt-1">
                                        <button onClick={handleLogout}
                                            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-red-400 hover:bg-red-500/10 transition-colors">
                                            <Settings size={14} />Logout
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </nav>

                    {/* Hairline below nav */}
                    <div className="h-px mt-[6px]" style={{ background: 'rgba(255,255,255,0.05)' }} />
                </div>
            </div>

            {/* ── MOBILE HEADER ── */}
            <header className="lg:hidden sticky top-0 z-40 min-h-14 flex items-center justify-between gap-3 px-4 py-2 border-b border-white/[0.06]"
                style={{ background: 'rgba(10,10,15,0.92)', backdropFilter: 'blur(24px)' }}>
                <div className="flex min-w-0 items-center gap-3">
                    <MobileMenuButton onClick={() => setMobileMenuOpen(true)} />
                    <div className="flex min-w-0 items-center gap-2">
                        <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center shrink-0"
                            style={{ background: 'linear-gradient(140deg, #06b6d4 0%, #0891b2 55%, #1e1b4b 100%)' }}>
                            <Gamepad2 size={14} className="text-white" />
                        </div>
                        <div className="min-w-0">
                            <p className="truncate text-sm font-bold">BookMyGame<span style={{ color: '#06b6d4' }}>.</span></p>
                            <p className="truncate text-[10px] uppercase tracking-[0.16em] text-slate-500">
                                {activeTabLabel} · {cafeName}
                            </p>
                        </div>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                    {onRefresh && (
                        <button onClick={handleRefresh}
                            className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:text-white transition-colors"
                            style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
                            <RefreshCw size={14} className={spinning ? 'animate-spin' : ''} />
                        </button>
                    )}
                    <button className="relative w-9 h-9 rounded-lg flex items-center justify-center text-slate-400"
                        style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
                        <Bell size={15} />
                        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full" style={{ background: '#06b6d4' }} />
                    </button>
                    <div className="w-7 h-7 rounded-md flex items-center justify-center text-[11px] font-bold text-white"
                        style={{ background: 'linear-gradient(135deg, #06b6d4, #8b5cf6)' }}>
                        {initials || 'O'}
                    </div>
                </div>
            </header>

            {/* Mobile sidebar drawer */}
            <Sidebar activeTab={activeTab} onTabChange={(tab) => onTabChange(tab)} cafeName={cafeName}
                isMobile={true} isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)}
                onLogout={handleLogout} collapsed={false} onToggleCollapsed={() => {}} />

            {/* Page Content */}
            <main className="flex-1 overflow-y-auto">
                {children}
            </main>
        </div>
    );
}
