'use client';

import { ReactNode, useEffect, useState } from 'react';
import {
    RefreshCw,
    Bell,
    LayoutDashboard,
    CreditCard,
    CalendarCheck,
    Users,
    Menu as MenuIcon,
} from 'lucide-react';
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
    /** Work waiting inside a tab, keyed by tab id. Passed through to the sidebar. */
    navBadges?: Partial<Record<string, number>>;
    /** Records a counter sale. The design keeps this next to New Booking. */
    onNewSnackSale?: () => void;
    /**
     * Whether the rail starts collapsed, read from a cookie on the server.
     *
     * It has to arrive as a prop rather than be read here. Each tab is its own
     * route, so this component remounts on every click and any state it kept
     * would reset - and reading the value in an effect instead would render
     * the rail open, then snap it shut in front of whoever is working.
     */
    initialCollapsed?: boolean;
}

const MOBILE_PRIMARY_TABS = [
    { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
    { id: 'billing', label: 'Billing', icon: CreditCard },
    { id: 'bookings', label: 'Bookings', icon: CalendarCheck },
    { id: 'customers', label: 'Customers', icon: Users },
] as const;

const TAB_TITLES: Record<string, string> = {
    dashboard: 'Dashboard',
    billing: 'Billing',
    bookings: 'Bookings',
    reports: 'Reports',
    inventory: 'Inventory',
    memberships: 'Memberships',
    coupons: 'Coupons',
    customers: 'Customers',
    stations: 'Stations',
    tournaments: 'Tournaments',
    loyalty: 'Loyalty',
    reviews: 'Reviews',
    payments: 'Payments',
    wallet: 'Wallet',
    settings: 'Settings',
    'cafe-details': 'Café details',
};

/**
 * The console's frame, in the BookMyGame Owner Console design.
 *
 * The rail is the change. It existed already but was built as a mobile drawer
 * only — on desktop, where the counter actually runs, the fifteen tabs were a
 * horizontal strip of eight plus a "More" dropdown holding the other seven.
 * The design puts all fifteen down the left permanently, so the strip, the
 * dropdown and the portal that positioned it are gone, and the header above
 * the page is left saying what page this is and offering the two things worth
 * reaching from anywhere.
 *
 * Collapsing the rail is remembered for the session. Someone working the
 * counter on a 1366px laptop wants the room back and should not have to ask
 * for it on every tab.
 */
export function DashboardLayout({
    children,
    activeTab,
    onTabChange,
    cafeName,
    isMobile,
    mobileMenuOpen,
    setMobileMenuOpen,
    onRefresh,
    navBadges,
    onNewSnackSale,
    initialCollapsed = false,
}: DashboardLayoutProps) {
    const [spinning, setSpinning] = useState(false);
    const [collapsed, setCollapsed] = useState(initialCollapsed);

    const isMobileMoreActive = !MOBILE_PRIMARY_TABS.some((tab) => tab.id === activeTab);
    const pageTitle = TAB_TITLES[activeTab] ?? 'Owner Console';

    // Rendered on the client only: the server's clock is not the café's, and
    // a time baked into the HTML would mismatch on hydration and then sit stale.
    const [stamp, setStamp] = useState('');
    useEffect(() => {
        const write = () => {
            const now = new Date();
            const day = now.toLocaleDateString('en-IN', {
                weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
            }).replace(/,/g, '');
            const time = now.toLocaleTimeString('en-IN', {
                hour: 'numeric', minute: '2-digit', hour12: true,
            });
            setStamp(`${day} · ${time}`);
        };
        write();
        const tick = setInterval(write, 30_000);
        return () => clearInterval(tick);
    }, []);

    const toggleCollapsed = () => {
        setCollapsed((wasCollapsed) => {
            const next = !wasCollapsed;
            // A cookie rather than localStorage, because the server renders
            // this frame and has to know the width before the first paint.
            document.cookie = `bmg_owner_rail=${next ? '1' : '0'}; path=/; max-age=31536000; SameSite=Lax`;
            return next;
        });
    };

    useEffect(() => {
        if (!isMobile) return;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = mobileMenuOpen ? 'hidden' : previousOverflow || '';

        return () => {
            document.body.style.overflow = previousOverflow || '';
        };
    }, [isMobile, mobileMenuOpen]);

    const handleRefresh = () => {
        if (!onRefresh) return;
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

    return (
        <div className="owner-bg min-h-screen">
            {/* The rail, on anything wide enough to hold it. */}
            <div className="hidden lg:block">
                <Sidebar
                    activeTab={activeTab}
                    onTabChange={(tab) => onTabChange(tab)}
                    cafeName={cafeName}
                    isMobile={false}
                    isOpen
                    onClose={() => {}}
                    onLogout={handleLogout}
                    collapsed={collapsed}
                    onToggleCollapsed={toggleCollapsed}
                    badges={navBadges}
                />
            </div>

            {/* The same rail as a drawer, on a phone. */}
            <div className="lg:hidden">
                <Sidebar
                    activeTab={activeTab}
                    onTabChange={(tab) => onTabChange(tab)}
                    cafeName={cafeName}
                    isMobile
                    isOpen={mobileMenuOpen}
                    onClose={() => setMobileMenuOpen(false)}
                    onLogout={handleLogout}
                    collapsed={false}
                    onToggleCollapsed={() => {}}
                    badges={navBadges}
                />
            </div>

            <div
                className="flex min-h-screen flex-col transition-[padding] duration-200"
                style={{ paddingLeft: 'var(--owner-rail, 0px)' }}
            >
                {/* Set here rather than in a class so the two widths stay next
                    to the rail's own, and so it only applies from lg up. */}
                <style>{`@media (min-width: 1024px) { .owner-bg { --owner-rail: ${collapsed ? '76px' : '248px'}; } }`}</style>

                <header className="sticky top-0 z-40 hidden h-[66px] items-center gap-4 border-b border-[#f2f0ea]/10 bg-[#0b0b0c]/[0.92] px-[clamp(18px,2.4vw,32px)] backdrop-blur-[14px] lg:flex">
                    <div className="flex min-w-0 flex-col gap-[3px]">
                        <span className="text-base font-extrabold leading-none tracking-[-0.01em] text-[#f2f0ea]">
                            {pageTitle}
                        </span>
                        <span className="truncate font-mono text-[10.5px] tracking-[0.1em] text-[#f2f0ea]/[0.42]">
                            {[stamp, cafeName].filter(Boolean).join(' · ').toUpperCase()}
                        </span>
                    </div>

                    <span className="flex-1" />

                    <div className="flex items-center gap-2.5">
                        {onRefresh && (
                            <button
                                onClick={handleRefresh}
                                title="Refresh"
                                className="flex h-[38px] w-[38px] items-center justify-center border border-[#f2f0ea]/[0.14] text-[#f2f0ea]/50 transition-colors hover:border-[#f2f0ea]/35 hover:text-[#f2f0ea]"
                            >
                                <RefreshCw size={16} className={spinning ? 'animate-spin' : ''} />
                            </button>
                        )}

                        <button
                            onClick={() => onTabChange('payments')}
                            title="Payments waiting"
                            className="relative flex h-[38px] w-[38px] items-center justify-center border border-[#f2f0ea]/[0.14] text-[#f2f0ea]/50 transition-colors hover:border-[#f2f0ea]/35 hover:text-[#f2f0ea]"
                        >
                            <Bell size={17} />
                            {(navBadges?.payments ?? 0) > 0 && (
                                <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center bg-[#ff5c2b] px-1 font-mono text-[9.5px] font-semibold text-[#0b0b0c]">
                                    {navBadges?.payments}
                                </span>
                            )}
                        </button>

                        {onNewSnackSale && (
                            <button
                                onClick={onNewSnackSale}
                                className="h-[38px] shrink-0 whitespace-nowrap border border-[#f2f0ea]/[0.18] px-[15px] font-mono text-[11.5px] font-semibold tracking-[0.14em] text-[#f2f0ea]/[0.72] transition-colors hover:border-[#f2f0ea] hover:text-[#f2f0ea]"
                            >
                                + SNACK SALE
                            </button>
                        )}

                        <button
                            onClick={() => onTabChange('billing')}
                            className="h-[38px] shrink-0 whitespace-nowrap bg-[#d8ff3c] px-[17px] font-mono text-[11.5px] font-semibold tracking-[0.14em] text-[#0b0b0c] transition-transform hover:-translate-y-px"
                        >
                            ▶ START SESSION
                        </button>
                    </div>
                </header>

                {/* ── MOBILE HEADER ── */}
                <header className="sticky top-0 z-40 border-b border-[#f2f0ea]/10 bg-[#0b0b0c]/[0.92] backdrop-blur-[14px] lg:hidden">
                    <div className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                            <MobileMenuButton onClick={() => setMobileMenuOpen(true)} />
                            <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-[#f2f0ea]">{pageTitle}</p>
                                <p className="truncate font-mono text-[10px] text-[#f2f0ea]/[0.42]">
                                    {cafeName}
                                </p>
                            </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                            {onRefresh && (
                                <button
                                    onClick={handleRefresh}
                                    className="flex h-9 w-9 items-center justify-center border border-[#f2f0ea]/10 text-[#f2f0ea]/50 transition-colors hover:text-[#f2f0ea]"
                                >
                                    <RefreshCw size={14} className={spinning ? 'animate-spin' : ''} />
                                </button>
                            )}
                            <span className="flex h-8 w-8 items-center justify-center bg-[#d8ff3c] text-[11px] font-black text-[#0b0b0c]">
                                {initials || 'O'}
                            </span>
                        </div>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto pb-24 lg:pb-0">{children}</main>
            </div>

            {/* Mobile bottom navigation */}
            {activeTab !== 'billing' && (
                <nav
                    className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#f2f0ea]/10 bg-[#0b0b0c]/[0.96] backdrop-blur-xl lg:hidden"
                    style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.4rem)' }}
                >
                    <div className="grid grid-cols-5 gap-1 px-2 pt-2">
                        {MOBILE_PRIMARY_TABS.map((tab) => {
                            const Icon = tab.icon;
                            const active = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => onTabChange(tab.id)}
                                    className={`flex flex-col items-center justify-center gap-1 px-1 py-2.5 transition-colors ${
                                        active
                                            ? 'bg-[#d8ff3c]/[0.12] text-[#d8ff3c]'
                                            : 'text-[#f2f0ea]/45 hover:bg-[#f2f0ea]/[0.04] hover:text-[#f2f0ea]'
                                    }`}
                                >
                                    <Icon size={18} />
                                    <span className="text-[10px] font-semibold leading-none">{tab.label}</span>
                                </button>
                            );
                        })}
                        <button
                            onClick={() => setMobileMenuOpen(true)}
                            className={`flex flex-col items-center justify-center gap-1 px-1 py-2.5 transition-colors ${
                                isMobileMoreActive
                                    ? 'bg-[#d8ff3c]/[0.12] text-[#d8ff3c]'
                                    : 'text-[#f2f0ea]/45 hover:bg-[#f2f0ea]/[0.04] hover:text-[#f2f0ea]'
                            }`}
                        >
                            <MenuIcon size={18} />
                            <span className="text-[10px] font-semibold leading-none">More</span>
                        </button>
                    </div>
                </nav>
            )}
        </div>
    );
}
