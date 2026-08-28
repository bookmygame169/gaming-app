'use client';

import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { Toast } from '../hooks/useToast';

const ICONS = {
  success: <CheckCircle size={16} className="text-[#d8ff3c] shrink-0" />,
  error: <AlertCircle size={16} className="text-[#ff5c2b] shrink-0" />,
  warning: <AlertTriangle size={16} className="text-[#ff5c2b] shrink-0" />,
  info: <Info size={16} className="text-[#d8ff3c] shrink-0" />,
};

const STYLES = {
  success: 'border-[#d8ff3c]/30 bg-[#d8ff3c]/80',
  error: 'border-[#ff5c2b]/30 bg-[#ff5c2b]/80',
  warning: 'border-[#ff5c2b]/30 bg-[#ff5c2b]/80',
  info: 'border-[#d8ff3c]/30 bg-[#111113]/90',
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
          className={`flex items-start gap-3 px-4 py-3  border backdrop-blur-sm pointer-events-auto animate-in slide-in-from-bottom-2 duration-200 ${STYLES[t.type]}`}
        >
          {ICONS[t.type]}
          <p className="text-sm text-[#f2f0ea] flex-1 leading-snug">{t.message}</p>
          <button
            onClick={() => onRemove(t.id)}
            className="text-[#f2f0ea]/40 hover:text-[#f2f0ea]/70 transition-colors shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
