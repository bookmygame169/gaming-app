'use client';

import Link from 'next/link';
import { LucideIcon } from 'lucide-react';
import { ownerPathForTab } from '../navigation';
import {
    LayoutDashboard,
    CreditCard,
    CalendarCheck,
    Users,
    Gamepad2,
    Ticket,
    BarChart3,
    Settings,
    LogOut,
    Menu,
    Package,
    Trophy,
    Sparkles,
    Star,
    IndianRupee,
    Wallet,
    PanelLeftClose,
    PanelLeftOpen,
    ScanLine,
} from 'lucide-react';

/**
 * The owner console's rail, in the BookMyGame Owner Console design.
 *
 * One flat list of fifteen, which is the design's own arrangement and a
 * correction: ten of these used to sit inside a collapsed "Manage" group, so
 * Payments and Reviews — the two that carry work waiting — were behind a click
 * exactly when they had something to say. The group is gone; the badges are
 * visible from anywhere.
 *
 * Rounded corners here, unlike the customer site's square edges. That is the
 * design's distinction, not an oversight: this is a tool somebody uses all day
 * rather than a page they visit.
 */
const NAV = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'billing', label: 'New Booking', icon: CreditCard },
    { id: 'bookings', label: 'Bookings', icon: CalendarCheck },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'inventory', label: 'Inventory', icon: Package },
    { id: 'memberships', label: 'Memberships', icon: Ticket },
    { id: 'coupons', label: 'Coupons', icon: Ticket },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'stations', label: 'Stations', icon: Gamepad2 },
    { id: 'tournaments', label: 'Tournaments', icon: Trophy },
    { id: 'loyalty', label: 'Loyalty Points', icon: Sparkles },
    { id: 'reviews', label: 'Reviews', icon: Star },
    { id: 'payments', label: 'Payments', icon: IndianRupee },
    { id: 'wallet', label: 'Wallet', icon: Wallet },
    { id: 'settings', label: 'Settings', icon: Settings },
] as const;

type NavTabId = typeof NAV[number]['id'];

interface SidebarProps {
    activeTab: string;
    onTabChange: (tab: NavTabId) => void;
    cafeName: string;
    isMobile: boolean;
    isOpen: boolean;
    onClose: () => void;
    onLogout: () => void;
    collapsed: boolean;
    onToggleCollapsed: () => void;
    /**
     * Counts of work waiting inside a tab, keyed by tab id. Shown as a badge so
     * a payment to check or a review to answer is visible from wherever the
     * owner happens to be, instead of only after clicking in.
     */
    badges?: Partial<Record<string, number>>;
}

function NavItem({
    item,
    isActive,
    collapsed,
    badge = 0,
    href,
    onNavigate,
}: {
    item: { id: string; label: string; icon: LucideIcon };
    isActive: boolean;
    collapsed: boolean;
    badge?: number;
    href: string;
    onNavigate?: () => void;
}) {
    const Icon = item.icon;

    return (
        <Link
            href={href}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
            className={`relative my-px flex items-center gap-3.5 rounded-xl transition-colors ${
                collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
            } ${
                isActive
                    ? 'bg-[#d8ff3c]/[0.10] text-[#f2f0ea]'
                    : 'text-[#f2f0ea]/55 hover:bg-[#f2f0ea]/[0.05] hover:text-[#f2f0ea]'
            }`}
        >
            {isActive && (
                <span className="absolute -left-3 bottom-2 top-2 w-[3px] rounded-r-[3px] bg-[#d8ff3c]" />
            )}

            <Icon
                size={21}
                strokeWidth={1.7}
                className={`shrink-0 ${isActive ? 'text-[#d8ff3c]' : ''}`}
            />

            {!collapsed && (
                <span className="truncate text-[15px] font-semibold tracking-[-0.01em]">
                    {item.label}
                </span>
            )}

            {badge > 0 &&
                // Collapsed shows a dot rather than a number: there is no room
                // for a count, but "something is waiting" still fits.
                (collapsed ? (
                    <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[#ff5c2b]" />
                ) : (
                    <span className="ml-auto shrink-0 font-mono text-[10px] tracking-[0.06em] text-[#ff5c2b]">
                        {badge > 99 ? '99+' : badge}
                    </span>
                ))}
        </Link>
    );
}

export function Sidebar({
    activeTab,
    onTabChange,
    cafeName,
    isMobile,
    isOpen,
    onClose,
    onLogout,
    collapsed,
    onToggleCollapsed,
    badges = {},
}: SidebarProps) {
    const handleNav = (id: NavTabId) => {
        onTabChange(id);
        if (isMobile) onClose();
    };

    const isCollapsed = collapsed && !isMobile;
    const sidebarWidth = isMobile ? 'w-[86vw] max-w-[320px]' : isCollapsed ? 'w-[76px]' : 'w-[248px]';

    const initials = cafeName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((word) => word[0])
        .join('')
        .toUpperCase() || 'BG';

    return (
        <>
            {isMobile && isOpen && (
                <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" onClick={onClose} />
            )}

            <aside
                className={`fixed left-0 top-0 z-50 flex h-screen flex-col overflow-hidden border-r border-[#f2f0ea]/10 bg-[#0e0e10] transition-all duration-200 ${sidebarWidth} ${
                    isMobile ? (isOpen ? 'translate-x-0' : '-translate-x-full') : 'translate-x-0'
                }`}
            >
                <div
                    className={`flex shrink-0 flex-nowrap items-center gap-[11px] px-3.5 pb-3.5 pt-5 ${
                        isCollapsed ? 'flex-col gap-3' : ''
                    }`}
                >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-[#d8ff3c] text-sm font-black text-[#0b0b0c]">
                        BG
                    </span>

                    {!isCollapsed && (
                        <div className="flex min-w-0 flex-col gap-px overflow-hidden">
                            <span className="whitespace-nowrap text-base font-extrabold leading-[1.15] tracking-[-0.02em] text-[#f2f0ea]">
                                BookMyGame
                            </span>
                            <span className="whitespace-nowrap text-xs text-[#f2f0ea]/[0.42]">
                                Owner Console
                            </span>
                        </div>
                    )}

                    {!isCollapsed && <span className="flex-1" />}

                    {!isMobile && (
                        <button
                            type="button"
                            onClick={onToggleCollapsed}
                            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[#f2f0ea]/[0.42] transition-colors hover:bg-[#f2f0ea]/[0.07] hover:text-[#f2f0ea]"
                        >
                            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
                        </button>
                    )}
                </div>

                <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-2 pt-1">
                    {!isCollapsed && (
                        <span className="px-2.5 pb-2.5 pt-1.5 font-mono text-[10px] tracking-[0.24em] text-[#f2f0ea]/[0.32]">
                            MENU
                        </span>
                    )}

                    {NAV.map((item) => (
                        <NavItem
                            key={item.id}
                            item={item}
                            isActive={activeTab === item.id}
                            collapsed={isCollapsed}
                            badge={badges[item.id] ?? 0}
                            href={ownerPathForTab(item.id)}
                            onNavigate={() => handleNav(item.id)}
                        />
                    ))}
                </nav>

                <div className="flex shrink-0 flex-col gap-2.5 px-3 pb-4 pt-2.5">
                    <button
                        type="button"
                        onClick={onLogout}
                        title={isCollapsed ? 'Sign out' : undefined}
                        className={`flex items-center gap-3.5 rounded-xl px-3 py-2.5 text-[#ff5c2b] transition-colors hover:bg-[#ff5c2b]/[0.09] ${
                            isCollapsed ? 'justify-center px-0' : ''
                        }`}
                    >
                        <LogOut size={21} strokeWidth={1.7} className="shrink-0" />
                        {!isCollapsed && (
                            <span className="whitespace-nowrap text-[15px] font-semibold tracking-[-0.01em]">
                                Sign out
                            </span>
                        )}
                    </button>

                    {/* The scanner reads the code on a locked PC, which is the
                        one thing here that gets used standing up, away from the
                        desk. It is a real page, not the design's placeholder. */}
                    <Link
                        href="/scan"
                        title={isCollapsed ? 'Scan QR ticket' : undefined}
                        className={`flex items-center gap-3 rounded-xl border border-[#f2f0ea]/10 bg-[#17171a] px-3.5 py-3 transition-colors hover:border-[#d8ff3c] hover:bg-[#d8ff3c]/[0.08] ${
                            isCollapsed ? 'justify-center px-0' : ''
                        }`}
                    >
                        <ScanLine size={19} strokeWidth={1.7} className="shrink-0 text-[#d8ff3c]" />
                        {!isCollapsed && (
                            <span className="whitespace-nowrap text-sm font-bold tracking-[-0.01em] text-[#f2f0ea]">
                                Scan QR Ticket
                            </span>
                        )}
                    </Link>

                    <Link
                        href="/"
                        title={isCollapsed ? cafeName : undefined}
                        className={`flex items-center gap-3 rounded-[14px] bg-[#141417] px-3 py-2.5 transition-colors hover:bg-[#1c1c20] ${
                            isCollapsed ? 'justify-center px-0' : ''
                        }`}
                    >
                        <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-[#d8ff3c] text-[12.5px] font-black text-[#0b0b0c]">
                            {initials}
                        </span>
                        {!isCollapsed && (
                            <div className="flex min-w-0 flex-col gap-0.5">
                                <span className="truncate text-[13.5px] font-bold tracking-[-0.01em] text-[#f2f0ea]">
                                    {cafeName}
                                </span>
                                <span className="truncate text-[11.5px] text-[#f2f0ea]/40">
                                    Go to the customer site
                                </span>
                            </div>
                        )}
                    </Link>
                </div>
            </aside>
        </>
    );
}

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#f2f0ea]/10 bg-[#f2f0ea]/5 text-[#f2f0ea] transition-colors hover:bg-[#f2f0ea]/10"
        >
            <Menu size={18} />
        </button>
    );
}
