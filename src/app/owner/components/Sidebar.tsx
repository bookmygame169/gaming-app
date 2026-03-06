'use client';

import { LucideIcon } from 'lucide-react';
import {
    LayoutDashboard,
    MonitorPlay,
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
} from 'lucide-react';

// Nav items configuration
const NAV_ITEMS = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'live-status', label: 'Live Status', icon: MonitorPlay },
    { id: 'billing', label: 'Billing', icon: CreditCard },
    { id: 'bookings', label: 'Bookings', icon: CalendarCheck },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'stations', label: 'Stations', icon: Gamepad2 },
    { id: 'inventory', label: 'Inventory', icon: Package },
    { id: 'memberships', label: 'Memberships', icon: Ticket },
    { id: 'coupons', label: 'Coupons', icon: Ticket },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: Settings },
] as const;

type NavTabId = typeof NAV_ITEMS[number]['id'];

interface SidebarProps {
    activeTab: string;
    onTabChange: (tab: NavTabId) => void;
    cafeName: string;
    isMobile: boolean;
    isOpen: boolean;
    onClose: () => void;
    onLogout: () => void;
}

export function Sidebar({
    activeTab,
    onTabChange,
    cafeName,
    isMobile,
    isOpen,
    onClose,
    onLogout,
}: SidebarProps) {
    return (
        <>
            {/* Mobile Overlay */}
            {isMobile && isOpen && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
                    onClick={onClose}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`
          fixed top-0 left-0 z-50 h-screen w-72 
          bg-gradient-to-b from-slate-900 to-slate-950
          border-r border-slate-800/50
          flex flex-col
          transition-transform duration-300 ease-out
          ${isMobile ? (isOpen ? 'translate-x-0' : '-translate-x-full') : 'translate-x-0'}
        `}
            >
                {/* Header */}
                <div className="p-6 border-b border-slate-800/50">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-xl font-bold text-white truncate max-w-[180px]">
                                {cafeName}
                            </h1>
                            <div className="text-[10px] tracking-[2px] font-semibold text-slate-500 mt-1 uppercase">
                                <span className="text-red-500">BOOK</span>MYGAME
                            </div>
                        </div>
                        {isMobile && (
                            <button
                                onClick={onClose}
                                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                            >
                                <X size={20} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                    {NAV_ITEMS.map((item) => {
                        const isActive = activeTab === item.id;
                        const Icon = item.icon;

                        return (
                            <button
                                key={item.id}
                                onClick={() => {
                                    onTabChange(item.id);
                                    if (isMobile) onClose();
                                }}
                                className={`
                  w-full flex items-center gap-3 px-4 py-3 rounded-xl
                  transition-all duration-200 group relative
                  ${isActive
                                        ? 'bg-gradient-to-r from-blue-500/15 to-blue-600/15 text-blue-400'
                                        : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                                    }
                `}
                            >
                                {isActive && (
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-blue-500 rounded-r-full" />
                                )}
                                <Icon
                                    size={20}
                                    className={isActive ? 'text-blue-400' : 'group-hover:text-white'}
                                />
                                <span className="font-medium text-sm">{item.label}</span>
                            </button>
                        );
                    })}
                </nav>

                {/* Footer */}
                <div className="p-4 border-t border-slate-800/50 space-y-2">
                    <button
                        onClick={() => (window.location.href = '/')}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors"
                    >
                        <Users size={20} />
                        <span className="font-medium text-sm">User Dashboard</span>
                    </button>
                    <button
                        onClick={onLogout}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                        <LogOut size={20} />
                        <span className="font-medium text-sm">Sign Out</span>
                    </button>
                </div>
            </aside>
        </>
    );
}

// Mobile menu button component
interface MobileMenuButtonProps {
    onClick: () => void;
}

export function MobileMenuButton({ onClick }: MobileMenuButtonProps) {
    return (
        <button
            onClick={onClick}
            className="flex items-center justify-center w-10 h-10 rounded-lg border border-slate-700 text-white hover:bg-slate-800 transition-colors"
        >
            <Menu size={20} />
        </button>
    );
}
