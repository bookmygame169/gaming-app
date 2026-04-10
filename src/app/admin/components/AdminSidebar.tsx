'use client';

import {
  LayoutDashboard,
  Store,
  Users,
  CalendarCheck,
  Ticket,
  TrendingUp,
  Megaphone,
  Shield,
  BarChart3,
  Settings,
  LogOut,
  X,
  Menu,
  LayoutGrid,
  KeyRound,
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'cafes', label: 'Cafés', icon: Store },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'bookings', label: 'Bookings', icon: CalendarCheck },
  { id: 'coupons', label: 'Coupons', icon: Ticket },
  { id: 'revenue', label: 'Revenue', icon: TrendingUp },
  { id: 'announcements', label: 'Announcements', icon: Megaphone },
  { id: 'audit-logs', label: 'Audit Logs', icon: Shield },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'owner-access', label: 'Owner Access', icon: KeyRound },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const;

type AdminNavTab = typeof NAV_ITEMS[number]['id'];

interface AdminSidebarProps {
  activeTab: string;
  onTabChange: (tab: AdminNavTab) => void;
  isMobile: boolean;
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
}

export function AdminSidebar({
  activeTab,
  onTabChange,
  isMobile,
  isOpen,
  onClose,
  onLogout,
}: AdminSidebarProps) {
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
          bg-[#0d0d12]
          border-r border-white/[0.07]
          flex flex-col
          transition-transform duration-300 ease-out
          ${isMobile ? (isOpen ? 'translate-x-0' : '-translate-x-full') : 'translate-x-0'}
        `}
      >
        {/* Header */}
        <div className="p-6 border-b border-white/[0.07]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center">
                <LayoutGrid size={18} className="text-white" />
              </div>
              <div>
                <h1 className="text-base font-bold text-white">Admin Panel</h1>
                <div className="text-[10px] tracking-[2px] font-semibold text-slate-500 mt-0.5 uppercase">
                  <span className="text-red-500">BOOK</span>MYGAME
                </div>
              </div>
            </div>
            {isMobile && (
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-white hover:bg-white/[0.06] rounded-lg transition-colors"
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
                    ? 'bg-violet-500/10 text-violet-400'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'
                  }
                `}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-violet-500 rounded-r-full" />
                )}
                <Icon
                  size={20}
                  className={isActive ? 'text-violet-400' : 'group-hover:text-white'}
                />
                <span className="font-medium text-sm">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-white/[0.07] space-y-2">
          <button
            onClick={() => (window.location.href = '/dashboard')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.05] transition-colors"
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

interface AdminMobileMenuButtonProps {
  onClick: () => void;
}

export function AdminMobileMenuButton({ onClick }: AdminMobileMenuButtonProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center w-10 h-10 rounded-lg border border-white/[0.09] text-white hover:bg-white/[0.06] transition-colors"
    >
      <Menu size={20} />
    </button>
  );
}
