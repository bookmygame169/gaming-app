import React from 'react';

type StatCardProps = {
    title: string;
    value: string | number;
    subtitle: string;
    icon: string;
    gradient: string;
    color: string;
    isMobile?: boolean;
};

export default function StatCard({
    title,
    value,
    subtitle,
}: StatCardProps) {
    return (
        <div className="relative overflow-hidden rounded-2xl border border-slate-700/50 bg-slate-900/60 p-5 md:p-6 flex flex-col justify-between min-h-[110px]">
            <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-2">
                {title}
            </p>
            <p className="text-3xl md:text-4xl font-bold text-white leading-none my-1">
                {value}
            </p>
            <p className="text-[11px] text-slate-500 mt-2">{subtitle}</p>
        </div>
    );
}
