'use client';

import type { CSSProperties, ReactNode } from 'react';

/**
 * The console's shared parts, taken from the BookMyGame Owner Console design.
 *
 * Deliberately not in ui.tsx. That file is the console's older kit — Card,
 * Button, Input, StatusBadge — which eight components still import and which
 * another workstream is mid-way through converting. These are the design's
 * own shapes, added alongside rather than on top of it.
 *
 * Every tab in that design is built from the same five things: a strip of
 * figures, a row of filter chips, a bar with a heading and a rule, a bordered
 * panel holding a grid table, and small mono tags. Written once here so the
 * fifteen tabs agree with each other — and so a change to the design is one
 * edit rather than fifteen.
 *
 * The palette, in full: #0b0b0c behind everything, #111113 for a panel,
 * hairlines at 10% of #f2f0ea, lime #d8ff3c for good news and the one action
 * worth pressing, orange #ff5c2b for anything costing money or waiting.
 */

export const OWNER = {
    ink: '#f2f0ea',
    panel: '#111113',
    hover: '#17171a',
    line: 'rgba(242,240,234,.1)',
    lime: '#d8ff3c',
    orange: '#ff5c2b',
} as const;

/** A strip of figures across the top of a tab. Two up on a phone, four on a desk. */
export function Kpis({
    items,
}: {
    items: { label: string; value: string; sub?: string; tone?: 'ink' | 'lime' | 'orange' }[];
}) {
    const colour = { ink: OWNER.ink, lime: OWNER.lime, orange: OWNER.orange };

    return (
        <section className="grid grid-cols-2 gap-px border border-[#f2f0ea]/10 bg-[#f2f0ea]/10 xl:grid-cols-4">
            {items.map((item) => (
                <div key={item.label} className="flex flex-col gap-[9px] bg-[#111113] px-[18px] py-4">
                    <span className="truncate font-mono text-[9.5px] tracking-[0.18em] text-[#f2f0ea]/[0.42]">
                        {item.label}
                    </span>
                    <span
                        className="text-[30px] font-black leading-[0.9] tracking-[-0.025em]"
                        style={{ color: colour[item.tone ?? 'ink'] }}
                    >
                        {item.value}
                    </span>
                    {item.sub && (
                        <span className="truncate font-mono text-[10.5px] text-[#f2f0ea]/40">{item.sub}</span>
                    )}
                </div>
            ))}
        </section>
    );
}

/** A heading, a rule that eats the space, and an optional action on the right. */
export function SectionBar({ title, note, action }: { title: string; note?: ReactNode; action?: ReactNode }) {
    return (
        <div className="flex items-center gap-3">
            <span className="whitespace-nowrap font-mono text-[10px] tracking-[0.2em] text-[#f2f0ea]/50">
                {title}
            </span>
            {note}
            <span className="h-px flex-1 bg-[#f2f0ea]/10" />
            {action}
        </div>
    );
}

/** Filter chips with counts — the design's way of slicing any list. */
export function Chips({
    items,
    active,
    onPick,
}: {
    items: { id: string; label: string; count?: number }[];
    active: string;
    onPick: (id: string) => void;
}) {
    return (
        <div className="flex flex-wrap gap-1.5">
            {items.map((item) => {
                const on = item.id === active;
                return (
                    <button
                        key={item.id}
                        type="button"
                        onClick={() => onPick(item.id)}
                        className="flex items-center gap-[7px] border px-3 py-2.5 font-mono text-[10.5px] tracking-[0.1em] transition-colors"
                        style={
                            on
                                ? { borderColor: OWNER.lime, background: 'rgba(216,255,60,.10)', color: OWNER.lime }
                                : { borderColor: 'rgba(242,240,234,.14)', color: 'rgba(242,240,234,.5)' }
                        }
                    >
                        {item.label}
                        {item.count !== undefined && <span className="opacity-50">{item.count}</span>}
                    </button>
                );
            })}
        </div>
    );
}

/** The bordered box every table and form sits in. */
export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
    return <div className={`border border-[#f2f0ea]/10 bg-[#111113] ${className}`}>{children}</div>;
}

/**
 * A table built from CSS grid rather than <table>, because every column width
 * in this design is fixed or fractional and the two have to agree between the
 * head and the rows. `columns` is one grid-template-columns string, used by
 * both, so they cannot drift apart.
 */
export function TableHead({ columns, children }: { columns: string; children: ReactNode }) {
    return (
        <div
            className="hidden gap-2.5 border-b border-[#f2f0ea]/10 px-4 py-2.5 font-mono text-[9px] tracking-[0.14em] text-[#f2f0ea]/35 lg:grid lg:[grid-template-columns:var(--cols)]"
            style={{ '--cols': columns } as CSSProperties}
        >
            {children}
        </div>
    );
}

export function TableRow({
    columns,
    edge,
    onClick,
    children,
}: {
    columns: string;
    /** The 2px left border. Use it for state — orange for unpaid, lime for live. */
    edge?: string;
    onClick?: () => void;
    children: ReactNode;
}) {
    // The template is a CSS variable so the class below can apply it only
    // from lg up; a seven-column grid on a phone is unreadable.
    const style = {
        borderLeft: `2px solid ${edge ?? 'transparent'}`,
        '--cols': columns,
    } as CSSProperties;

    return (
        <div
            onClick={onClick}
            className={`grid grid-cols-1 items-center gap-2.5 border-b border-[#f2f0ea]/[0.05] px-4 py-3 transition-colors hover:bg-[#17171a] lg:[grid-template-columns:var(--cols)] ${
                onClick ? 'cursor-pointer' : ''
            }`}
            style={style}
        >
            {children}
        </div>
    );
}

/** The small mono label the design uses for status everywhere. */
export function Tag({
    children,
    tone = 'muted',
}: {
    children: ReactNode;
    tone?: 'lime' | 'orange' | 'muted';
}) {
    const tones = {
        lime: { background: 'rgba(216,255,60,.12)', color: OWNER.lime },
        orange: { background: 'rgba(255,92,43,.12)', color: OWNER.orange },
        muted: { background: 'rgba(242,240,234,.07)', color: 'rgba(242,240,234,.6)' },
    };

    return (
        <span
            className="justify-self-start whitespace-nowrap px-2 py-1 font-mono text-[9.5px] tracking-[0.1em]"
            style={tones[tone]}
        >
            {children}
        </span>
    );
}

/** The one lime action per screen. */
export function PrimaryButton({
    children,
    onClick,
    disabled,
    type = 'button',
}: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    type?: 'button' | 'submit';
}) {
    return (
        <button
            type={type}
            onClick={onClick}
            disabled={disabled}
            className="h-[38px] whitespace-nowrap bg-[#d8ff3c] px-4 font-mono text-[10.5px] font-semibold tracking-[0.14em] text-[#0b0b0c] transition-transform hover:-translate-y-px disabled:opacity-50"
        >
            {children}
        </button>
    );
}

/** Everything else. */
export function GhostButton({
    children,
    onClick,
    title,
    tone = 'ink',
    disabled,
}: {
    children: ReactNode;
    onClick?: () => void;
    title?: string;
    tone?: 'ink' | 'lime' | 'orange';
    disabled?: boolean;
}) {
    const colour = { ink: 'rgba(242,240,234,.72)', lime: OWNER.lime, orange: OWNER.orange };

    return (
        <button
            type="button"
            title={title}
            onClick={onClick}
            disabled={disabled}
            className="h-[38px] whitespace-nowrap border border-[#f2f0ea]/[0.18] px-4 font-mono text-[10.5px] font-semibold tracking-[0.14em] transition-colors hover:border-[#f2f0ea] disabled:opacity-40"
            style={{ color: colour[tone] }}
        >
            {children}
        </button>
    );
}

/** Search, filters and inputs, in the console's one field style. */
export function Field({
    value,
    onChange,
    placeholder,
    type = 'text',
    className = '',
}: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    type?: string;
    className?: string;
}) {
    return (
        <input
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={`h-[38px] border border-[#f2f0ea]/[0.14] bg-transparent px-3 font-mono text-[10.5px] tracking-[0.1em] text-[#f2f0ea] outline-none transition-colors placeholder:text-[#f2f0ea]/30 focus:border-[#d8ff3c] ${className}`}
        />
    );
}

/** What a table says when it has nothing to show. */
export function EmptyRow({ children }: { children: ReactNode }) {
    return (
        <div className="px-4 py-8 font-mono text-[11.5px] text-[#f2f0ea]/45">{children}</div>
    );
}

/**
 * The shell every dialog in the console sits in.
 *
 * Four modals were each drawing their own backdrop, panel, title bar and
 * close button, at four different corner radii and three different blacks.
 * One shell means a dialog opened from any tab looks like it belongs to the
 * same tool as the page behind it.
 */
export function ModalShell({
    title,
    subtitle,
    onClose,
    width = 'md',
    footer,
    children,
}: {
    title: string;
    subtitle?: string;
    onClose: () => void;
    /** md suits a form; lg suits a form with a list beside it. */
    width?: 'sm' | 'md' | 'lg';
    footer?: ReactNode;
    children: ReactNode;
}) {
    const widths = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl' };

    return (
        <div
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-[#0b0b0c]/90 p-4 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className={`flex max-h-[92vh] w-full flex-col overflow-hidden border border-[#f2f0ea]/[0.14] bg-[#111113] ${widths[width]}`}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[#f2f0ea]/10 px-5 py-4">
                    <div className="min-w-0">
                        <div className="truncate text-base font-extrabold tracking-[-0.01em] text-[#f2f0ea]">
                            {title}
                        </div>
                        {subtitle && (
                            <div className="mt-1 truncate font-mono text-[10.5px] tracking-[0.1em] text-[#f2f0ea]/[0.42]">
                                {subtitle}
                            </div>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="shrink-0 font-mono text-[10px] tracking-[0.14em] text-[#f2f0ea]/40 transition-colors hover:text-[#f2f0ea]"
                    >
                        CLOSE
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

                {footer && (
                    <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[#f2f0ea]/10 px-5 py-4">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}
