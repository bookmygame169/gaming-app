'use client';

import { X } from 'lucide-react';
import { StationLockSetup } from './StationLockSetup';

type StationLiveInfo = {
  online: boolean;
  status: string;
  seconds_since_seen: number;
};

interface StationLockSetupModalProps {
  cafeId: string;
  stationName: string;
  displayName: string;
  liveInfo?: StationLiveInfo | null;
  onLiveRefresh?: () => void;
  onClose: () => void;
}

export function StationLockSetupModal({
  cafeId,
  stationName,
  displayName,
  liveInfo,
  onLiveRefresh,
  onClose,
}: StationLockSetupModalProps) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-[#0b0b0c]/90 backdrop-blur-sm p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-h-[92vh] overflow-y-auto rounded-t-2xl border border-white/[0.08] bg-[#0d1118] shadow-2xl sm:max-w-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="p-4 sm:p-5">
          <StationLockSetup
            cafeId={cafeId}
            stationName={stationName}
            displayName={displayName}
            liveInfo={liveInfo}
            onLiveRefresh={onLiveRefresh}
          />
        </div>
      </div>
    </div>
  );
}
