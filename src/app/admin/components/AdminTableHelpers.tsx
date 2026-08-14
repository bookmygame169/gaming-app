import type { ReactNode } from "react";

export const thCls = "px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest";
export const tdCls = "px-4 py-3.5 text-sm text-slate-300";

export function badge(label: string, color: "green"|"red"|"blue"|"yellow"|"purple"|"slate") {
  const map: Record<string, string> = {
    green: "bg-emerald-500/15 text-emerald-400",
    red: "bg-red-500/15 text-red-400",
    blue: "bg-blue-500/15 text-blue-400",
    yellow: "bg-amber-500/15 text-amber-400",
    purple: "bg-violet-500/15 text-violet-400",
    slate: "bg-white/[0.06] text-slate-400",
  };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${map[color]}`}>{label}</span>;
}

export function Pagination({
  page,
  total,
  setPage,
  itemsPerPage,
}: {
  page: number;
  total: number;
  setPage: (p: number) => void;
  itemsPerPage: number;
}) {
  if (total <= 1) return null;
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.06]">
      <span className="text-xs text-slate-500">{((page-1)*itemsPerPage)+1}–{Math.min(page*itemsPerPage, total*itemsPerPage)} of page {page}/{total}</span>
      <div className="flex gap-1">
        <button onClick={() => setPage(Math.max(1,page-1))} disabled={page===1} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.06] text-slate-300 hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">Prev</button>
        {Array.from({length: Math.min(5,total)}, (_,i) => {
          const n = total<=5?i+1:page<=3?i+1:page>=total-2?total-4+i:page-2+i;
          return <button key={n} onClick={()=>setPage(n)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${page===n?"bg-blue-500 text-white":"bg-white/[0.06] text-slate-300 hover:bg-white/[0.08]"}`}>{n}</button>;
        })}
        <button onClick={() => setPage(Math.min(total,page+1))} disabled={page===total} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.06] text-slate-300 hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">Next</button>
      </div>
    </div>
  );
}
