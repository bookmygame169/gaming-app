'use client';

import { useEffect } from 'react';
import { X, Clock, AlertCircle } from 'lucide-react';

interface SessionEndedPopupProps {
  isOpen: boolean;
  onClose: () => void;
  customerName: string;
  stationName: string;
  duration: number;
}

export function SessionEndedPopup({
  isOpen,
  onClose,
  customerName,
  stationName,
  duration,
}: SessionEndedPopupProps) {
  // Auto-close after 10 seconds
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        onClose();
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [isOpen, onClose]);

  // Play notification sound
  useEffect(() => {
    if (isOpen) {
      // Create a simple beep sound
      try {
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const audioContext = new AudioContextClass();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        gainNode.gain.value = 0.3;

        oscillator.start();
        setTimeout(() => {
          oscillator.stop();
        }, 200);
      } catch {
        // Audio context not available
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const hours = Math.floor(duration / 60);
  const minutes = duration % 60;
  const durationText = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-20 pointer-events-none">
      <div
        className="pointer-events-auto bg-[#13131f] border-2 border-red-500/50 rounded-2xl shadow-2xl shadow-red-500/20 w-full max-w-md mx-4 animate-in slide-in-from-top-4 fade-in duration-300"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/20 rounded-xl">
              <AlertCircle className="w-6 h-6 text-red-500" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Session Ended</h3>
              <p className="text-xs text-slate-400">Time&apos;s up!</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/[0.06] rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5">
          <div className="bg-white/[0.06]/50 rounded-xl p-4 mb-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="text-3xl">🎮</div>
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">
                  {stationName}
                </p>
                <p className="text-lg font-bold text-white">{customerName}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <Clock className="w-4 h-4" />
              <span className="text-sm">Session duration: <span className="font-semibold text-white">{durationText}</span></span>
            </div>
          </div>

          <p className="text-sm text-slate-400 text-center">
            Please collect payment and free up the station.
          </p>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/[0.08]">
          <button
            onClick={onClose}
            className="w-full py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-semibold transition-colors"
          >
            Got it
          </button>
        </div>

        {/* Auto-close indicator */}
        <div className="absolute bottom-0 left-0 w-full h-1 bg-white/[0.06] rounded-b-2xl overflow-hidden">
          <div
            className="h-full bg-red-500 animate-shrink-width"
            style={{
              animation: 'shrink-width 10s linear forwards'
            }}
          />
        </div>

        <style jsx>{`
          @keyframes shrink-width {
            from { width: 100%; }
            to { width: 0%; }
          }
        `}</style>
      </div>
    </div>
  );
}
