// src/components/ScreenTitle.tsx
"use client";

import type { ReactNode } from "react";

/**
 * The title row the design puts at the top of every screen: the name in heavy
 * uppercase, a hairline that eats the empty middle, and a mono note on the
 * right saying what the screen is for.
 *
 * The note is the part worth being careful with. It reads like a caption on an
 * instrument, so it must state something true about this screen rather than
 * decorate it — on the wallet that means where the money can be spent, not a
 * list of card brands the app has never accepted.
 */
export default function ScreenTitle({ title, meta }: { title: string; meta?: ReactNode }) {
  return (
    <div className="flex items-baseline gap-[18px] px-5 pb-7 pt-10 sm:px-8 sm:pt-[52px] lg:px-12">
      <h1 className="m-0 font-display text-[clamp(30px,6vw,44px)] font-black uppercase leading-none tracking-[-0.03em] text-[#f2f0ea]">
        {title}
      </h1>
      <span className="h-px flex-1 bg-[#f2f0ea]/[0.14]" />
      {meta && (
        <span className="hidden whitespace-nowrap font-mono text-[13px] tracking-[0.2em] text-[#f2f0ea]/40 md:block">
          {meta}
        </span>
      )}
    </div>
  );
}
