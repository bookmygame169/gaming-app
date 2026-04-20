'use client';

import { ReactNode } from 'react';

// ─── StatusBadge ────────────────────────────────────────────────────────────

interface StatusBadgeProps { status: string; }

const STATUS_MAP: Record<string, { bg: string; text: string; dot: string }> = {
    'confirmed':   { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' },
    'in-progress': { bg: 'bg-blue-500/10',    text: 'text-blue-400',    dot: 'bg-blue-400'    },
    'completed':   { bg: 'bg-slate-500/10',   text: 'text-slate-400',   dot: 'bg-slate-500'   },
    'cancelled':   { bg: 'bg-red-500/10',     text: 'text-red-400',     dot: 'bg-red-400'     },
    'active':      { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' },
    'expired':     { bg: 'bg-slate-500/10',   text: 'text-slate-400',   dot: 'bg-slate-500'   },
    'pending':     { bg: 'bg-amber-500/10',   text: 'text-amber-400',   dot: 'bg-amber-400'   },
};

export function StatusBadge({ status }: StatusBadgeProps) {
    const key = status.toLowerCase();
    const style = STATUS_MAP[key] ?? { bg: 'bg-slate-500/10', text: 'text-slate-400', dot: 'bg-slate-500' };
    return (
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold ${style.bg} ${style.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${style.dot} shrink-0`} />
            {status}
        </span>
    );
}

// ─── Card ────────────────────────────────────────────────────────────────────

interface CardProps {
    children: ReactNode;
    className?: string;
    padding?: 'none' | 'sm' | 'md' | 'lg';
}

export function Card({ children, className = '', padding = 'md' }: CardProps) {
    const p = { none: '', sm: 'p-3 md:p-4', md: 'p-4 md:p-5', lg: 'p-5 md:p-6' };
    return (
        <div className={`glass rounded-2xl ${p[padding]} ${className}`}>
            {children}
        </div>
    );
}

// ─── Button ──────────────────────────────────────────────────────────────────

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    children: ReactNode;
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    loading?: boolean;
}

export function Button({
    children, onClick, variant = 'primary', size = 'md',
    disabled = false, loading = false, className = '', type = 'button', ...props
}: ButtonProps) {
    const variants = {
        primary:   'bg-cyan-500/15 hover:bg-cyan-500/22 text-cyan-100 border border-cyan-400/25 shadow-[0_0_24px_-10px_rgba(34,211,238,0.75)]',
        secondary: 'glass-2 hover:border-white/15 text-white border border-white/[0.08]',
        danger:    'bg-red-500/10 hover:bg-red-500/18 text-red-300 border border-red-500/20',
        ghost:     'hover:bg-white/[0.05] text-slate-400 hover:text-white',
    };
    const sizes = {
        sm: 'px-3 py-1.5 text-xs rounded-lg',
        md: 'px-4 py-2.5 text-sm rounded-xl',
        lg: 'px-5 py-3 text-sm rounded-xl',
    };
    return (
        <button
            type={type}
            onClick={onClick}
            disabled={disabled || loading}
            {...props}
            className={`
                inline-flex items-center justify-center gap-1.5 rounded-lg font-medium
                transition-all duration-150
                disabled:opacity-40 disabled:cursor-not-allowed
                ${variants[variant]} ${sizes[size]} ${className}
            `}
        >
            {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent shrink-0" />}
            {children}
        </button>
    );
}

// ─── Input ───────────────────────────────────────────────────────────────────

interface InputProps {
    id?: string;
    label?: string;
    placeholder?: string;
    value: string;
    onChange: (value: string) => void;
    type?: 'text' | 'email' | 'password' | 'number' | 'tel';
    disabled?: boolean;
    className?: string;
    maxLength?: number;
}

export function Input({ id, label, placeholder, value, onChange, type = 'text', disabled = false, className = '', maxLength }: InputProps) {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
    return (
        <div className={className}>
            {label && (
                <label htmlFor={inputId} className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--dim)]">
                    {label}
                </label>
            )}
            <div className="glass-2 focus-ring rounded-xl border border-white/[0.07] transition">
                <input
                    id={inputId}
                    name={inputId}
                    type={type}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    disabled={disabled}
                    maxLength={maxLength}
                    className="w-full rounded-xl bg-transparent px-3.5 py-2.5 text-sm text-white placeholder:text-[#4b5060] focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
                />
            </div>
        </div>
    );
}

// ─── Select ──────────────────────────────────────────────────────────────────

interface SelectProps {
    id?: string;
    label?: string;
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
    disabled?: boolean;
    className?: string;
}

export function Select({ id, label, value, onChange, options, disabled = false, className = '' }: SelectProps) {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
    return (
        <div className={className}>
            {label && (
                <label htmlFor={selectId} className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--dim)]">
                    {label}
                </label>
            )}
            <div className="glass-2 focus-ring rounded-xl border border-white/[0.07] transition">
                <select
                    id={selectId}
                    name={selectId}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    disabled={disabled}
                    className="w-full cursor-pointer appearance-none rounded-xl bg-transparent px-3.5 py-2.5 text-sm text-white focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
                >
                    {options.map((o) => (
                        <option key={o.value} value={o.value} className="bg-[#11111a] text-white">{o.label}</option>
                    ))}
                </select>
            </div>
        </div>
    );
}

// ─── EmptyState ──────────────────────────────────────────────────────────────

interface EmptyStateProps {
    icon?: ReactNode;
    title: string;
    description?: string;
    action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            {icon && (
                <div className="glass-2 mb-1 flex h-12 w-12 items-center justify-center rounded-2xl text-slate-500">
                    {icon}
                </div>
            )}
            <p className="text-sm font-semibold text-slate-200">{title}</p>
            {description && <p className="max-w-xs text-xs text-slate-500">{description}</p>}
            {action && <div className="mt-2">{action}</div>}
        </div>
    );
}

// ─── LoadingSpinner ──────────────────────────────────────────────────────────

export function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
    const sizes = { sm: 'h-4 w-4', md: 'h-7 w-7', lg: 'h-10 w-10' };
    return (
        <div className="flex items-center justify-center p-8">
            <div className={`${sizes[size]} animate-spin rounded-full border-2 border-white/[0.08] border-t-blue-500`} />
        </div>
    );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

export function Skeleton({ className = '' }: { className?: string }) {
    return <div className={`animate-pulse rounded-lg bg-white/[0.06] ${className}`} />;
}

export function SkeletonCard({ rows = 2 }: { rows?: number }) {
    return (
        <div className="glass rounded-2xl p-4 space-y-3">
            <Skeleton className="h-3 w-1/3" />
            {Array.from({ length: rows }).map((_, i) => (
                <Skeleton key={i} className={`h-3 ${i % 2 === 0 ? 'w-full' : 'w-2/3'}`} />
            ))}
        </div>
    );
}

export function TabSkeleton({ cards = 4, tableRows = 6 }: { cards?: number; tableRows?: number }) {
    return (
        <div className="space-y-6 animate-pulse">
            <div className={`grid grid-cols-2 md:grid-cols-${Math.min(cards, 4)} gap-3`}>
                {Array.from({ length: cards }).map((_, i) => <SkeletonCard key={i} rows={2} />)}
            </div>
            <div className="glass rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-white/[0.06]">
                    <Skeleton className="h-4 w-40" />
                </div>
                <div className="divide-y divide-white/[0.05]">
                    {Array.from({ length: tableRows }).map((_, i) => (
                        <div key={i} className="flex items-center gap-4 px-4 py-3">
                            <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
                            <div className="flex-1 space-y-2">
                                <Skeleton className="h-3 w-1/3" />
                                <Skeleton className="h-2.5 w-1/2" />
                            </div>
                            <Skeleton className="h-5 w-16 rounded-full" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ─── StatCard (legacy compat — kept for Reports.tsx) ────────────────────────

interface StatCardProps {
    title: string;
    value: string | number;
    subtitle?: string;
    icon?: string;
    gradient?: string;
    color?: string;
    isMobile?: boolean;
}

export function StatCard({ title, value, subtitle }: StatCardProps) {
    return (
        <div className="glass relative flex flex-col gap-2 overflow-hidden rounded-2xl px-4 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{title}</p>
            <p className="text-2xl font-bold text-white leading-none">{value}</p>
            {subtitle && <p className="text-[11px] text-slate-500">{subtitle}</p>}
        </div>
    );
}
