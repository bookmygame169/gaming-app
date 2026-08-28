'use client';

import { ReactNode } from 'react';

// ─── StatusBadge ────────────────────────────────────────────────────────────

interface StatusBadgeProps { status: string; }

/**
 * Three states, not seven colours.
 *
 * Lime is running or fine, orange is waiting on somebody, and anything
 * finished is a hairline - a completed booking and a cancelled one are both
 * over, and giving them separate colours only competes with the rows that
 * still need something doing.
 */
const STATUS_MAP: Record<string, { bg: string; text: string; dot: string }> = {
    'confirmed':   { bg: 'bg-[#d8ff3c]/[0.12]', text: 'text-[#d8ff3c]',      dot: 'bg-[#d8ff3c]'      },
    'in-progress': { bg: 'bg-[#d8ff3c]/[0.12]', text: 'text-[#d8ff3c]',      dot: 'bg-[#d8ff3c]'      },
    'active':      { bg: 'bg-[#d8ff3c]/[0.12]', text: 'text-[#d8ff3c]',      dot: 'bg-[#d8ff3c]'      },
    'pending':     { bg: 'bg-[#ff5c2b]/[0.12]', text: 'text-[#ff5c2b]',      dot: 'bg-[#ff5c2b]'      },
    'completed':   { bg: 'bg-[#f2f0ea]/[0.07]', text: 'text-[#f2f0ea]/60',   dot: 'bg-[#f2f0ea]/40'   },
    'cancelled':   { bg: 'bg-[#f2f0ea]/[0.07]', text: 'text-[#f2f0ea]/[0.35]', dot: 'bg-[#f2f0ea]/30' },
    'expired':     { bg: 'bg-[#f2f0ea]/[0.07]', text: 'text-[#f2f0ea]/[0.35]', dot: 'bg-[#f2f0ea]/30' },
};

export function StatusBadge({ status }: StatusBadgeProps) {
    const key = status.toLowerCase();
    const style = STATUS_MAP[key] ?? { bg: 'bg-[#f2f0ea]/[0.07]', text: 'text-[#f2f0ea]/50', dot: 'bg-[#f2f0ea]/40' };
    return (
        <span className={`inline-flex items-center gap-1.5 px-2 py-1 font-mono text-[9.5px] uppercase tracking-[0.1em] ${style.bg} ${style.text}`}>
            <span className={`h-1.5 w-1.5 shrink-0 ${style.dot}`} />
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
    const p = { none: '', sm: 'p-2.5 md:p-4', md: 'p-3 md:p-5', lg: 'p-4 md:p-6' };
    return (
        <div className={`border border-[#f2f0ea]/10 bg-[#111113] ${p[padding]} ${className}`}>
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
        primary:   'bg-[#d8ff3c] text-[#0b0b0c] font-semibold hover:brightness-110',
        secondary: 'border border-[#f2f0ea]/[0.18] text-[#f2f0ea]/[0.72] hover:border-[#f2f0ea] hover:text-[#f2f0ea]',
        danger:    'border border-[#ff5c2b]/50 text-[#ff5c2b] hover:bg-[#ff5c2b] hover:text-[#0b0b0c]',
        ghost:     'text-[#f2f0ea]/50 hover:bg-[#f2f0ea]/[0.05] hover:text-[#f2f0ea]',
    };
    const sizes = {
        sm: 'px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] uppercase',
        md: 'px-4 py-2.5 font-mono text-[10.5px] tracking-[0.14em] uppercase',
        lg: 'px-5 py-3 font-mono text-[11.5px] tracking-[0.14em] uppercase',
    };
    return (
        <button
            type={type}
            onClick={onClick}
            disabled={disabled || loading}
            {...props}
            className={`
                inline-flex items-center justify-center gap-1.5
                transition-colors duration-150
                disabled:opacity-40 disabled:cursor-not-allowed
                ${variants[variant]} ${sizes[size]} ${className}
            `}
        >
            {loading && <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />}
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
                <label htmlFor={inputId} className="mb-1.5 block font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#f2f0ea]/[0.42]">
                    {label}
                </label>
            )}
            <div className="border border-[#f2f0ea]/[0.14] transition-colors focus-within:border-[#d8ff3c]">
                <input
                    id={inputId}
                    name={inputId}
                    type={type}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    disabled={disabled}
                    maxLength={maxLength}
                    className="w-full bg-transparent px-3 py-2 text-sm text-[#f2f0ea] placeholder:text-[#f2f0ea]/30 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 md:px-3.5 md:py-2.5"
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
                <label htmlFor={selectId} className="mb-1.5 block font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#f2f0ea]/[0.42]">
                    {label}
                </label>
            )}
            <div className="border border-[#f2f0ea]/[0.14] transition-colors focus-within:border-[#d8ff3c]">
                <select
                    id={selectId}
                    name={selectId}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    disabled={disabled}
                    className="w-full cursor-pointer appearance-none bg-transparent px-3 py-2 text-sm text-[#f2f0ea] focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 md:px-3.5 md:py-2.5"
                >
                    {options.map((o) => (
                        <option key={o.value} value={o.value} className="bg-[#111113] text-[#f2f0ea]">{o.label}</option>
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
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center md:py-16">
            {icon && (
                <div className="mb-1 flex h-12 w-12 items-center justify-center border border-[#f2f0ea]/10 text-[#f2f0ea]/40">
                    {icon}
                </div>
            )}
            <p className="text-sm font-bold text-[#f2f0ea]">{title}</p>
            {description && <p className="max-w-xs font-mono text-[11px] leading-[1.7] text-[#f2f0ea]/40">{description}</p>}
            {action && <div className="mt-2">{action}</div>}
        </div>
    );
}

// ─── LoadingSpinner ──────────────────────────────────────────────────────────

export function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
    const sizes = { sm: 'h-4 w-4', md: 'h-7 w-7', lg: 'h-10 w-10' };
    return (
        <div className="flex items-center justify-center p-8">
            <div className={`${sizes[size]} animate-spin rounded-full border-2 border-[#f2f0ea]/10 border-t-[#d8ff3c]`} />
        </div>
    );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

export function Skeleton({ className = '' }: { className?: string }) {
    return <div className={`animate-pulse bg-[#f2f0ea]/[0.06] ${className}`} />;
}

export function SkeletonCard({ rows = 2 }: { rows?: number }) {
    return (
        <div className="space-y-3 border border-[#f2f0ea]/10 bg-[#111113] p-3 md:p-4">
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
            <div className="overflow-hidden border border-[#f2f0ea]/10 bg-[#111113]">
                <div className="border-b border-[#f2f0ea]/10 p-4">
                    <Skeleton className="h-4 w-40" />
                </div>
                <div className="divide-y divide-[#f2f0ea]/[0.05]">
                    {Array.from({ length: tableRows }).map((_, i) => (
                        <div key={i} className="flex items-center gap-4 px-4 py-3">
                            <Skeleton className="h-8 w-8 shrink-0" />
                            <div className="flex-1 space-y-2">
                                <Skeleton className="h-3 w-1/3" />
                                <Skeleton className="h-2.5 w-1/2" />
                            </div>
                            <Skeleton className="h-5 w-16" />
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
        <div className="relative flex flex-col gap-1.5 overflow-hidden border border-[#f2f0ea]/10 bg-[#111113] px-3 py-3 md:gap-2 md:px-4 md:py-4">
            <p className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-[#f2f0ea]/[0.42]">{title}</p>
            <p className="text-[26px] font-black leading-none tracking-[-0.025em] text-[#f2f0ea]">{value}</p>
            {subtitle && <p className="font-mono text-[10.5px] text-[#f2f0ea]/40">{subtitle}</p>}
        </div>
    );
}
