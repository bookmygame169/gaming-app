'use client';

import { ReactNode, useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { Sidebar, MobileMenuButton } from './Sidebar';

const SIDEBAR_COLLAPSED_KEY = 'owner-sidebar-collapsed';

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

const TAB_TITLES: Record<string, string> = {
    dashboard: 'Dashboard',
    'live-status': 'Live Status',
    billing: 'New Booking',
    bookings: 'Bookings',
    customers: 'Customers',
    stations: 'Stations',
    memberships: 'Memberships',
    coupons: 'Coupons',
    reports: 'Reports',
    settings: 'Settings',
    inventory: 'Inventory',
    subscriptions: 'Tournament',
};

export function DashboardLayout({
    children,
    activeTab,
    onTabChange,
    cafeName,
    isMobile,
    mobileMenuOpen,
    setMobileMenuOpen,
    title,
    onRefresh,
}: DashboardLayoutProps) {
    const [collapsed, setCollapsed] = useState(false);
    const [spinning, setSpinning] = useState(false);

    // Load persisted sidebar state
    useEffect(() => {
        try {
            const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
            if (saved !== null) setCollapsed(saved === 'true');
        } catch {}
    }, []);

    const handleToggleCollapsed = () => {
        setCollapsed(prev => {
            const next = !prev;
            try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next)); } catch {}
            return next;
        });
    };

    const handleRefresh = () => {
        if (!onRefresh || spinning) return;
        setSpinning(true);
        onRefresh();
        setTimeout(() => setSpinning(false), 800);
    };

    const todayLabel = new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    }).format(new Date());

    const handleLogout = async () => {
        if (confirm('Are you sure you want to logout?')) {
            try {
                await fetch('/api/owner/login', {
                    method: 'DELETE',
                    credentials: 'include',
                });
            } catch (error) {
                console.error('Logout failed:', error);
            }
            window.location.href = '/owner/login';
        }
    };

    const sidebarWidth = !isMobile && collapsed ? 'ml-16' : !isMobile ? 'ml-64' : '';

    return (
        <div className="min-h-screen owner-bg flex">
            <Sidebar
                activeTab={activeTab}
                onTabChange={(tab) => onTabChange(tab)}
                cafeName={cafeName}
                isMobile={isMobile}
                isOpen={mobileMenuOpen}
                onClose={() => setMobileMenuOpen(false)}
                onLogout={handleLogout}
                collapsed={collapsed}
                onToggleCollapsed={handleToggleCollapsed}
            />

            {/* Main Content */}
            <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${sidebarWidth}`}>

                {/* Top Header */}
                <header className="sticky top-0 z-30 h-14 flex items-center justify-between px-5 md:px-8 bg-[#0a0a0f]/80 backdrop-blur-xl border-b border-white/[0.06]" style={{ boxShadow: 'inset 0 -1px 0 rgba(255,255,255,0.04), 0 4px 24px -4px rgba(0,0,0,0.4)' }}>
                    <div className="flex items-center gap-3">
                        {isMobile && (
                            <MobileMenuButton onClick={() => setMobileMenuOpen(true)} />
                        )}
                        <h1 className="text-base font-semibold text-white">
                            {TAB_TITLES[activeTab] || title}
                        </h1>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[11px] font-medium text-slate-500">
                            {todayLabel}
                        </span>
                        {onRefresh && (
                            <button
                                onClick={handleRefresh}
                                title="Refresh"
                                className="flex items-center justify-center w-8 h-8 rounded-lg border border-white/[0.06] bg-white/[0.04] text-slate-500 hover:text-white hover:border-white/20 transition-colors"
                            >
                                <RefreshCw size={13} className={spinning ? 'animate-spin' : ''} />
                            </button>
                        )}
                    </div>
                </header>

                {/* Page Content */}
                <main className="flex-1 overflow-y-auto p-5 md:p-8">
                    {children}
                </main>
            </div>
        </div>
    );
}
