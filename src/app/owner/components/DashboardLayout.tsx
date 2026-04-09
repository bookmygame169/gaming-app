'use client';

import { ReactNode, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Sidebar, MobileMenuButton } from './Sidebar';

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

// Map tab IDs to display titles
const TAB_TITLES: Record<string, string> = {
    dashboard: 'Dashboard',
    'live-status': 'Live Console Status',
    billing: 'Billing',
    bookings: 'Bookings',
    customers: 'Customers',
    stations: 'Stations',
    memberships: 'Memberships',
    coupons: 'Coupons',
    reports: 'Reports',
    settings: 'Settings',
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
    const [spinning, setSpinning] = useState(false);

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

    return (
        <div className="min-h-screen bg-slate-950 flex">
            {/* Sidebar */}
            <Sidebar
                activeTab={activeTab}
                onTabChange={(tab) => onTabChange(tab)}
                cafeName={cafeName}
                isMobile={isMobile}
                isOpen={mobileMenuOpen}
                onClose={() => setMobileMenuOpen(false)}
                onLogout={handleLogout}
            />

            {/* Main Content Area */}
            <div
                className={`
          flex-1 flex flex-col min-w-0
          ${!isMobile ? 'ml-72' : ''}
        `}
            >
                {/* Header */}
                <header className="sticky top-0 z-30 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/50">
                    <div className="flex items-center justify-between px-4 py-4 md:px-8">
                        <div className="flex items-center gap-4">
                            {isMobile && (
                                <MobileMenuButton onClick={() => setMobileMenuOpen(true)} />
                            )}
                            <h1 className="text-xl font-bold text-white md:text-2xl">
                                {TAB_TITLES[activeTab] || title}
                            </h1>
                        </div>

                        <div className="flex items-center gap-2">
                            {/* Date chip */}
                            <span className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50 text-xs font-medium text-slate-400">
                                {todayLabel}
                            </span>

                            {/* Refresh */}
                            {onRefresh && (
                                <button
                                    onClick={handleRefresh}
                                    title="Refresh data"
                                    className="flex items-center justify-center w-8 h-8 rounded-lg border border-slate-700/50 bg-slate-800/60 text-slate-400 hover:text-white hover:border-slate-600 transition-colors"
                                >
                                    <RefreshCw size={14} className={spinning ? 'animate-spin' : ''} />
                                </button>
                            )}
                        </div>
                    </div>
                </header>

                {/* Page Content */}
                <main className="flex-1 overflow-y-auto p-4 md:p-8">
                    {children}
                </main>
            </div>
        </div>
    );
}
