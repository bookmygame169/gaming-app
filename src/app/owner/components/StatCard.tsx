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
        <div className="relative flex min-h-[110px] flex-col justify-between overflow-hidden border border-[#f2f0ea]/10 bg-[#111113] p-5 md:p-6">
            <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#f2f0ea]/[0.42]">
                {title}
            </p>
            <p className="mono my-1 text-3xl font-black leading-none tracking-[-0.03em] text-[#f2f0ea] md:text-4xl">
                {value}
            </p>
            <p className="mt-2 font-mono text-[11px] text-[#f2f0ea]/45">{subtitle}</p>
        </div>
    );
}
