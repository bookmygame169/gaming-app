'use client';

import { useState } from 'react';
import { LucideIcon } from 'lucide-react';
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
    X,
    Menu,
    Package,
    Trophy,
    Sparkles,
    Star,
    IndianRupee,
    ChevronDown,
    ChevronRight,
    PanelLeftClose,
    PanelLeftOpen,
} from 'lucide-react';

const PRIMARY_NAV = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'billing', label: 'New Booking', icon: CreditCard },
    { id: 'bookings', label: 'Bookings', icon: CalendarCheck },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
] as const;

const MANAGE_NAV = [
    { id: 'stations', label: 'Stations', icon: Gamepad2 },
    { id: 'memberships', label: 'Memberships', icon: Ticket },
    { id: 'tournaments', label: 'Tournaments', icon: Trophy },
    { id: 'loyalty', label: 'Loyalty Points', icon: Sparkles },
    { id: 'reviews', label: 'Reviews', icon: Star },
    { id: 'payments', label: 'Payments', icon: IndianRupee },
    { id: 'inventory', label: 'Inventory', icon: Package },
    { id: 'coupons', label: 'Coupons', icon: Ticket },
    { id: 'settings', label: 'Settings', icon: Settings },
] as const;

type NavTabId = typeof PRIMARY_NAV[number]['id'] | typeof MANAGE_NAV[number]['id'];

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
    isBilling = false,
    badge = 0,
    onClick,
}: {
    item: { id: string; label: string; icon: LucideIcon };
    isActive: boolean;
    collapsed: boolean;
    isBilling?: boolean;
    badge?: number;
    onClick: () => void;
}) {
    const Icon = item.icon;

    return (
        <button
            onClick={onClick}
            title={collapsed ? item.label : undefined}
            className={`
                relative w-full flex items-center gap-3 rounded-xl transition-all duration-200 group
                ${collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'}
                ${isBilling
                    ? isActive
                        ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20'
                        : 'text-cyan-400/70 hover:bg-cyan-500/8 border border-cyan-500/15'
                    : isActive
                        ? 'bg-white/[0.07] text-white'
                        : 'text-slate-500 hover:text-slate-200 hover:bg-white/[0.04]'
                }
            `}
        >
            {isActive && !isBilling && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full" style={{ background: '#06b6d4' }} />
            )}
            <Icon
                size={17}
                className={`shrink-0 ${isActive ? (isBilling ? 'text-cyan-400' : 'text-cyan-300') : isBilling ? 'text-cyan-400/70' : 'text-slate-500 group-hover:text-slate-200'}`}
            />
            {!collapsed && (
                <span className="font-medium text-sm truncate">{item.label}</span>
            )}

            {badge > 0 && (
                // Collapsed shows a dot rather than a number: there is no room
                // for a count, but "something is waiting" still fits.
                collapsed ? (
                    <span
                        className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full"
                        style={{ background: '#fbbf24' }}
                    />
                ) : (
                    <span
                        className="ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold"
                        style={{ background: 'rgba(245,158,11,0.16)', color: '#fbbf24' }}
                    >
                        {badge > 99 ? '99+' : badge}
                    </span>
                )
            )}
        </button>
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
    const isManageActive = MANAGE_NAV.some(item => item.id === activeTab);

    // Reviews and Payments live inside Manage, which is collapsed by default —
    // so their badges would be hidden exactly when they matter. The group
    // header carries the total until it is opened.
    const manageWaiting = MANAGE_NAV.reduce(
        (sum, item) => sum + (badges[item.id] ?? 0),
        0
    );
    // Default collapsed — expands only when a manage tab is active
    const [manageOpen, setManageOpen] = useState<boolean>(isMobile || isManageActive);

    const handleNav = (id: NavTabId) => {
        onTabChange(id);
        if (isMobile) onClose();
    };

    const sidebarWidth = isMobile ? 'w-[86vw] max-w-[320px]' : collapsed ? 'w-16' : 'w-64';

    return (
        <>
            {isMobile && isOpen && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40" onClick={onClose} />
            )}

            <aside className={`
                fixed top-0 left-0 z-50 h-screen
                ${sidebarWidth}
                border-r border-white/[0.06]
                flex flex-col
                transition-all duration-300 ease-out
                ${isMobile ? (isOpen ? 'translate-x-0' : '-translate-x-full') : 'translate-x-0'}
            `} style={{ background: 'linear-gradient(180deg, #0e0e16, #0a0a0f)', boxShadow: '1px 0 0 rgba(255,255,255,0.04)' }}>
                {/* Header */}
                <div className={`shrink-0 h-14 flex items-center border-b border-white/[0.06] ${collapsed && !isMobile ? 'justify-center px-0' : 'px-4 justify-between'}`}>
                    {(!collapsed || isMobile) && (
                        <div className="min-w-0">
                            <h1 className="text-sm font-bold text-white truncate leading-tight">{cafeName}</h1>
                            <div className="text-[9px] tracking-[2px] font-semibold text-slate-600 mt-0.5 uppercase">
                                <span className="text-red-500">BOOK</span>MYGAME
                            </div>
                        </div>
                    )}

                    {collapsed && !isMobile && (
                        <div className="w-7 h-7 rounded-lg bg-red-500/20 flex items-center justify-center">
                            <span className="text-red-400 text-xs font-black">B</span>
                        </div>
                    )}

                    {isMobile && (
                        <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                            <X size={16} />
                        </button>
                    )}
                </div>

                {/* Navigation */}
                <nav className={`flex-1 overflow-y-auto overflow-x-hidden py-3 space-y-0.5 ${collapsed && !isMobile ? 'px-2' : 'px-3'}`}>
                    {isMobile && (
                        <div className="mb-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3 py-3">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Quick access</div>
                            <p className="mt-1 text-sm text-slate-300">Navigate the owner app faster on mobile.</p>
                        </div>
                    )}

                    {(!collapsed || isMobile) && (
                        <div className="px-3 pb-1 text-[9px] font-bold uppercase tracking-widest text-slate-600">Main</div>
                    )}

                    {PRIMARY_NAV.map((item) => (
                        <NavItem
                            key={item.id}
                            item={item}
                            isActive={activeTab === item.id}
                            collapsed={collapsed && !isMobile}
                            isBilling={item.id === 'billing'}
                            badge={badges[item.id] ?? 0}
                            onClick={() => handleNav(item.id)}
                        />
                    ))}

                    {/* Manage group */}
                    <div className="pt-3">
                        {(!collapsed || isMobile) ? (
                            <button
                                onClick={() => setManageOpen(prev => !prev)}
                                className="w-full flex items-center justify-between px-3 py-1.5 text-slate-600 hover:text-slate-400 transition-colors"
                            >
                                <span className="text-[9px] font-bold uppercase tracking-widest">Manage</span>
                                <span className="flex items-center gap-1.5">
                                    {!manageOpen && manageWaiting > 0 && (
                                        <span
                                            className="rounded-md px-1.5 py-0.5 text-[10px] font-bold"
                                            style={{ background: 'rgba(245,158,11,0.16)', color: '#fbbf24' }}
                                        >
                                            {manageWaiting > 99 ? '99+' : manageWaiting}
                                        </span>
                                    )}
                                    {manageOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                                </span>
                            </button>
                        ) : (
                            <div className="flex justify-center py-1">
                                <div className="w-4 h-px bg-white/10" />
                            </div>
                        )}

                        {(manageOpen || (collapsed && !isMobile)) && (
                            <div className="space-y-0.5 mt-1">
                                {MANAGE_NAV.map((item) => (
                                    <NavItem
                                        key={item.id}
                                        item={item}
                                        isActive={activeTab === item.id}
                                        collapsed={collapsed && !isMobile}
                                        badge={badges[item.id] ?? 0}
                                        onClick={() => handleNav(item.id)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </nav>

                {/* Footer */}
                <div className={`shrink-0 border-t border-white/[0.06] py-3 space-y-0.5 ${collapsed && !isMobile ? 'px-2' : 'px-3'}`}>
                    {!isMobile && (
                        <button
                            onClick={onToggleCollapsed}
                            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                            className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-slate-500 hover:text-white hover:bg-white/5 transition-all ${collapsed ? 'justify-center px-0' : ''}`}
                        >
                            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
                            {!collapsed && <span className="text-sm font-medium">Collapse</span>}
                        </button>
                    )}

                    <button
                        onClick={() => (window.location.href = '/')}
                        title={collapsed && !isMobile ? 'User Dashboard' : undefined}
                        className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-slate-500 hover:text-white hover:bg-white/5 transition-colors ${collapsed && !isMobile ? 'justify-center px-0' : ''}`}
                    >
                        <Users size={17} className="shrink-0" />
                        {(!collapsed || isMobile) && <span className="font-medium text-sm">User Dashboard</span>}
                    </button>

                    <button
                        onClick={onLogout}
                        title={collapsed && !isMobile ? 'Sign Out' : undefined}
                        className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-red-500/70 hover:text-red-400 hover:bg-red-500/8 transition-colors ${collapsed && !isMobile ? 'justify-center px-0' : ''}`}
                    >
                        <LogOut size={17} className="shrink-0" />
                        {(!collapsed || isMobile) && <span className="font-medium text-sm">Sign Out</span>}
                    </button>
                </div>
            </aside>
        </>
    );
}

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="flex items-center justify-center w-9 h-9 rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10 transition-colors"
        >
            <Menu size={18} />
        </button>
    );
}
