"use client";

import { useState } from "react";
import { Check, Copy, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { UpiAppOption } from "@/lib/upi";

function AppMark({ app }: { app: UpiAppOption }) {
  return (
    <span
      className={`flex h-11 w-11 items-center justify-center rounded-2xl text-[13px] font-black tracking-tight shadow-inner ${app.markClassName}`}
    >
      {app.mark}
    </span>
  );
}

export function UpiAppGrid({
  apps,
  isAndroid,
  onOpen,
}: {
  apps: UpiAppOption[];
  isAndroid: boolean;
  onOpen?: (app: UpiAppOption) => void;
}) {
  const tile =
    "flex flex-col items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-2 py-3.5 transition active:scale-[0.97] hover:border-white/[0.16] hover:bg-white/[0.08]";

  return (
    <div className="grid grid-cols-4 gap-2">
      {apps.map((app) =>
        onOpen ? (
          <button key={app.id} type="button" onClick={() => onOpen(app)} className={tile}>
            <AppMark app={app} />
            <span className="w-full truncate text-center text-[11px] font-semibold text-slate-200">
              {app.label}
            </span>
          </button>
        ) : (
          <a key={app.id} href={isAndroid ? app.androidHref : app.href} className={tile}>
            <AppMark app={app} />
            <span className="w-full truncate text-center text-[11px] font-semibold text-slate-200">
              {app.label}
            </span>
          </a>
        )
      )}
    </div>
  );
}

export function UpiManualPay({
  payeeUpiId,
  amount,
  paymentUrl,
}: {
  payeeUpiId: string;
  amount: number;
  paymentUrl: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);

  const copy = async (value: string, what: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  };

  return (
    <div className="rounded-3xl border border-white/[0.08] bg-black/30 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Other apps
        </p>
        <button
          type="button"
          onClick={() => setShowQr((open) => !open)}
          className="flex items-center gap-1.5 rounded-full border border-white/[0.10] px-3 py-1 text-[11px] font-bold text-slate-300"
        >
          <QrCode className="h-3.5 w-3.5" />
          {showQr ? "Hide QR" : "Show QR"}
        </button>
      </div>

      {showQr && (
        <div className="mt-4 flex justify-center">
          <div className="rounded-2xl bg-white p-3">
            <QRCodeSVG value={paymentUrl} size={168} level="M" includeMargin />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => copy(payeeUpiId, "upi")}
        className="mt-3 flex w-full items-center gap-3 rounded-2xl bg-white/[0.05] px-4 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] uppercase tracking-wide text-slate-500">UPI ID</span>
          <span className="block truncate text-sm font-bold text-white">{payeeUpiId}</span>
        </span>
        <span className="flex items-center gap-1 text-xs font-bold text-cyan-300">
          {copied === "upi" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied === "upi" ? "Copied" : "Copy"}
        </span>
      </button>

      <button
        type="button"
        onClick={() => copy(amount.toFixed(2), "amount")}
        className="mt-2 flex w-full items-center gap-3 rounded-2xl bg-white/[0.05] px-4 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] uppercase tracking-wide text-slate-500">Amount</span>
          <span className="block text-sm font-bold text-white">₹{amount}</span>
        </span>
        <span className="flex items-center gap-1 text-xs font-bold text-cyan-300">
          {copied === "amount" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied === "amount" ? "Copied" : "Copy"}
        </span>
      </button>
    </div>
  );
}
