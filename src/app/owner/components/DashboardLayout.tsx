'use client';

import { ReactNode, useState } from 'react';
import { RefreshCw, Bell, LayoutDashboard, CreditCard, CalendarCheck, Users, BarChart3, Package, Ticket, Settings, Gamepad2, Trophy, ChevronDown } from 'lucide-react';
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
    { id: 'reports',     label: 'Reports',      icon: BarChart3 },
    { id: 'inventory',   label: 'Inventory',    icon: Package },
    { id: 'memberships', label: 'Memberships',  icon: Ticket },
    { id: 'coupons',     label: 'Coupons',      icon: Ticket },
    { id: 'customers',   label: 'Customers',    icon: Users },
];

const DESKTOP_MORE_TABS = [
    { id: 'stations',      label: 'Stations',    icon: Gamepad2 },
    { id: 'subscriptions', label: 'Tournament',  icon: Trophy },
    { id: 'settings',      label: 'Settings',    icon: Settings },
];

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
            try {
                await fetch('/api/owner/login', { method: 'DELETE', credentials: 'include' });
            } catch {}
            window.location.href = '/owner/login';
        }
    };

    // Initials from cafe name
    const initials = cafeName
        .split(' ')
        .slice(0, 2)
        .map(w => w[0]?.toUpperCase() || '')
        .join('');

    const isMoreActive = DESKTOP_MORE_TABS.some(t => t.id === activeTab);

    return (
        <div className="min-h-screen owner-bg flex flex-col">

            {/* ── DESKTOP HEADER ── */}
            <header className="hidden lg:flex sticky top-0 z-40 items-center justify-between h-14 px-6 border-b border-white/[0.06] backdrop-blur-xl"
                style={{ background: 'rgba(10,10,15,0.85)', boxShadow: 'inset 0 -1px 0 rgba(255,255,255,0.04), 0 4px 24px -4px rgba(0,0,0,0.5)' }}>

                {/* Left: Logo */}
                <div className="flex items-center gap-3 shrink-0 mr-8">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(6,182,212,0.15)' }}>
                        <Gamepad2 size={16} className="text-cyan-400" />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-white leading-none">BookMyGame.</p>
                        <p className="text-[9px] text-slate-500 uppercase tracking-widest mt-0.5">Owner Console · {cafeName}</p>
                    </div>
                </div>

                {/* Center: Tab navigation */}
                <nav className="flex items-end gap-0.5 flex-1 overflow-x-auto no-scrollbar h-full">
                    {DESKTOP_PRIMARY_TABS.map(tab => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => onTabChange(tab.id)}
                                className={`relative flex items-center gap-1.5 px-3 h-full text-[12px] font-medium whitespace-nowrap transition-colors border-b-2
                                    ${isActive
                                        ? 'text-white border-cyan-400'
                                        : 'text-slate-500 border-transparent hover:text-slate-200 hover:border-white/20'
                                    }`}
                            >
                                <Icon size={13} />
                                {tab.label}
                            </button>
                        );
                    })}

                    {/* More dropdown */}
                    <div className="relative h-full">
                        <button
                            onClick={() => setMoreOpen(p => !p)}
                            className={`relative flex items-center gap-1 px-3 h-full text-[12px] font-medium whitespace-nowrap transition-colors border-b-2
                                ${isMoreActive ? 'text-white border-cyan-400' : 'text-slate-500 border-transparent hover:text-slate-200 hover:border-white/20'}`}
                        >
                            More <ChevronDown size={11} className={`transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {moreOpen && (
                            <div className="absolute top-full left-0 mt-1 w-40 glass rounded-xl overflow-hidden py-1 z-50" onClick={() => setMoreOpen(false)}>
                                {DESKTOP_MORE_TABS.map(tab => {
                                    const Icon = tab.icon;
                                    return (
                                        <button key={tab.id} onClick={() => onTabChange(tab.id)}
                                            className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-[12px] transition-colors
                                                ${activeTab === tab.id ? 'text-cyan-400 bg-cyan-500/10' : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'}`}>
                                            <Icon size={13} /> {tab.label}
                                        </button>
                                    );
                                })}
                                <div className="border-t border-white/[0.06] mt-1 pt-1">
                                    <button onClick={handleLogout}
                                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[12px] text-red-400 hover:bg-red-500/10 transition-colors">
                                        <Settings size={13} /> Logout
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </nav>

                {/* Right: Actions + avatar */}
                <div className="flex items-center gap-2 ml-4 shrink-0">
                    {onRefresh && (
                        <button onClick={handleRefresh} title="Refresh"
                            className="w-8 h-8 rounded-lg border border-white/[0.06] bg-white/[0.04] flex items-center justify-center text-slate-500 hover:text-white hover:border-white/20 transition-colors">
                            <RefreshCw size={13} className={spinning ? 'animate-spin' : ''} />
                        </button>
                    )}
                    <button className="w-8 h-8 rounded-lg border border-white/[0.06] bg-white/[0.04] flex items-center justify-center text-slate-500 hover:text-white transition-colors">
                        <Bell size={13} />
                    </button>
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.07] transition-colors"
                        title="Logout"
                    >
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: 'rgba(6,182,212,0.25)', color: '#22d3ee' }}>
                            {initials || 'O'}
                        </div>
                        <span className="text-[11px] font-medium text-slate-300 max-w-[80px] truncate">{cafeName}</span>
                    </button>
                </div>
            </header>

            {/* ── MOBILE HEADER ── */}
            <header className="lg:hidden sticky top-0 z-40 h-14 flex items-center justify-between px-4 border-b border-white/[0.06] backdrop-blur-xl"
                style={{ background: 'rgba(10,10,15,0.85)' }}>
                <div className="flex items-center gap-3">
                    <MobileMenuButton onClick={() => setMobileMenuOpen(true)} />
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(6,182,212,0.15)' }}>
                            <Gamepad2 size={14} className="text-cyan-400" />
                        </div>
                        <p className="text-sm font-bold text-white">BookMyGame.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {onRefresh && (
                        <button onClick={handleRefresh}
                            className="w-8 h-8 rounded-lg border border-white/[0.06] bg-white/[0.04] flex items-center justify-center text-slate-500 hover:text-white transition-colors">
                            <RefreshCw size={13} className={spinning ? 'animate-spin' : ''} />
                        </button>
                    )}
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: 'rgba(6,182,212,0.25)', color: '#22d3ee' }}>
                        {initials || 'O'}
                    </div>
                </div>
            </header>

            {/* Mobile sidebar drawer */}
            <Sidebar
                activeTab={activeTab}
                onTabChange={(tab) => onTabChange(tab)}
                cafeName={cafeName}
                isMobile={true}
                isOpen={mobileMenuOpen}
                onClose={() => setMobileMenuOpen(false)}
                onLogout={handleLogout}
                collapsed={false}
                onToggleCollapsed={() => {}}
            />

            {/* Page Content — full width on desktop */}
            <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
                {children}
            </main>
        </div>
    );
}
