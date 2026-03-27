'use client';

import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { Toast } from '../hooks/useToast';

const ICONS = {
  success: <CheckCircle size={16} className="text-emerald-400 shrink-0" />,
  error: <AlertCircle size={16} className="text-red-400 shrink-0" />,
  warning: <AlertTriangle size={16} className="text-amber-400 shrink-0" />,
  info: <Info size={16} className="text-blue-400 shrink-0" />,
};

const STYLES = {
  success: 'border-emerald-500/30 bg-emerald-950/80',
  error: 'border-red-500/30 bg-red-950/80',
  warning: 'border-amber-500/30 bg-amber-950/80',
  info: 'border-blue-500/30 bg-slate-900/90',
};

interface ToastContainerProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`flex items-start gap-3 px-4 py-3 rounded-xl border backdrop-blur-sm shadow-xl pointer-events-auto animate-in slide-in-from-bottom-2 duration-200 ${STYLES[t.type]}`}
        >
          {ICONS[t.type]}
          <p className="text-sm text-slate-200 flex-1 leading-snug">{t.message}</p>
          <button
            onClick={() => onRemove(t.id)}
            className="text-slate-500 hover:text-slate-300 transition-colors shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
