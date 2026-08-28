'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  Download,
  Lock,
  MonitorSmartphone,
  RefreshCw,
  Wifi,
  WifiOff,
} from 'lucide-react';

type StationLiveInfo = {
  online: boolean;
  status: string;
  seconds_since_seen: number;
};

interface StationLockSetupProps {
  cafeId: string;
  stationName: string;
  displayName: string;
  /** Optional live row from /api/owner/stations/status */
  liveInfo?: StationLiveInfo | null;
  onLiveRefresh?: () => void;
}

/**
 * Walks an owner through linking one physical PC to one station id (e.g. pc-01).
 *
 * Intended to be opened on the gaming PC itself: download → install → type the
 * setup code. After that, the station can be managed from the dashboard anywhere.
 */
export function StationLockSetup({
  cafeId,
  stationName,
  displayName,
  liveInfo,
  onLiveRefresh,
}: StationLockSetupProps) {
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [publishHelp, setPublishHelp] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadDownloadUrl = useCallback(async () => {
    try {
      const res = await fetch('/api/owner/stations/agent-download', {
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setDownloadUrl(null);
        setDownloadError(data.error || 'Could not load the download link');
        setPublishHelp(data.publishHelp || null);
        return;
      }

      setDownloadUrl(data.url || null);
      setDownloadError(data.url ? null : 'No download link is configured on the server.');
      setPublishHelp(data.url ? null : data.publishHelp || null);
    } catch {
      setDownloadUrl(null);
      setDownloadError('Could not load the download link');
    }
  }, []);

  const generateCode = useCallback(async () => {
    setCodeLoading(true);
    setCodeError(null);

    try {
      const res = await fetch('/api/owner/stations/enroll-code', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cafeId, stationName }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not create a setup code');

      setCode(data.code);
      setExpiresAt(data.expiresAt);
    } catch (err) {
      setCode(null);
      setCodeError(err instanceof Error ? err.message : 'Could not create a setup code');
    } finally {
      setCodeLoading(false);
    }
  }, [cafeId, stationName]);

  useEffect(() => {
    loadDownloadUrl();
    generateCode();
  }, [loadDownloadUrl, generateCode]);

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Code is visible on screen to type manually.
    }
  };

  const expiryText = expiresAt
    ? new Date(expiresAt).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    : null;

  const isLinked = Boolean(liveInfo?.online);
  const agentStatus = liveInfo?.status?.toLowerCase();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center bg-[#d8ff3c]/15">
            <MonitorSmartphone size={16} className="text-[#d8ff3c]" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#f2f0ea]">
              Lock app for {displayName}
            </h3>
            <p className="text-[11px] text-[#f2f0ea]/40">
              Station id <span className="font-mono font-semibold text-[#f2f0ea]/50">{stationName}</span>
              — install on this physical PC, manage from anywhere after setup
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onLiveRefresh && (
            <button
              type="button"
              onClick={onLiveRefresh}
              className="flex items-center gap-1.5 border border-[#f2f0ea]/10 px-2.5 py-1.5 text-[11px] font-semibold text-[#f2f0ea]/50 transition-colors hover:text-[#f2f0ea]"
            >
              <RefreshCw size={12} />
              Refresh status
            </button>
          )}
          {liveInfo ? (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                isLinked
                  ? agentStatus === 'unlocked'
                    ? 'bg-[#d8ff3c]/15 text-[#d8ff3c]'
                    : 'bg-[#d8ff3c]/15 text-[#d8ff3c]'
                  : 'bg-[#ff5c2b]/15 text-[#ff5c2b]'
              }`}
            >
              {isLinked ? <Wifi size={11} /> : <WifiOff size={11} />}
              {isLinked
                ? agentStatus === 'unlocked'
                  ? 'Online · Unlocked'
                  : 'Online · Locked'
                : 'Not linked yet'}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f2f0ea]/[0.06] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#f2f0ea]/40">
              <Lock size={11} />
              Awaiting setup
            </span>
          )}
        </div>
      </div>

      <p className=" border border-[#d8ff3c]/20 bg-[#d8ff3c]/[0.06] px-3 py-2.5 text-[12px] text-[#d8ff3c]/90">
        Open this screen <strong>on the gaming PC</strong> you are setting up ({displayName}).
        Download and install here, then enter the code below in the lock app.
      </p>

      <ol className="flex flex-col gap-3 text-[12px] text-[#f2f0ea]/50">
        <li className="flex gap-2.5">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f2f0ea]/[0.06] text-[10px] font-bold text-[#f2f0ea]/70">
            1
          </span>
          <div className="min-w-0 flex-1">
            <span className="text-[#f2f0ea]/70">Download the lock app for {displayName}.</span>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {downloadUrl ? (
                <a
                  href={downloadUrl}
                  className="inline-flex items-center gap-1.5 border border-[#d8ff3c]/30 bg-[#d8ff3c]/10 px-3 py-2 text-[12px] font-bold text-[#d8ff3c] transition-colors hover:bg-[#d8ff3c]/20"
                >
                  <Download size={14} />
                  Download for {displayName}
                </a>
              ) : (
                <div className="text-[11px] text-[#ff5c2b]/90 space-y-1.5">
                  <p>{downloadError || 'Download is not available yet.'}</p>
                  {publishHelp && (
                    <p className="text-[#ff5c2b]/80 leading-relaxed">{publishHelp}</p>
                  )}
                </div>
              )}
            </div>
            <p className="mt-1.5 text-[11px] text-[#f2f0ea]/40">
              Same installer for every PC — this download is for{' '}
              <span className="font-semibold text-[#f2f0ea]/50">{displayName}</span>; the setup code
              links it to this station.
            </p>
          </div>
        </li>
        <li className="flex gap-2.5">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f2f0ea]/[0.06] text-[10px] font-bold text-[#f2f0ea]/70">
            2
          </span>
          <span>Run the installer on this PC and finish setup.</span>
        </li>
        <li className="flex gap-2.5">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f2f0ea]/[0.06] text-[10px] font-bold text-[#f2f0ea]/70">
            3
          </span>
          <span>
            When the app asks for a code, type the one for{' '}
            <span className="font-mono font-semibold text-[#f2f0ea]/70">{stationName}</span> below.
          </span>
        </li>
      </ol>

      <div className=" border border-[#f2f0ea]/10 bg-transparent p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#f2f0ea]/40">
            Setup code for {displayName}
          </p>
          <button
            type="button"
            onClick={generateCode}
            disabled={codeLoading}
            className="text-[11px] font-semibold text-[#d8ff3c] transition-colors hover:text-[#d8ff3c] disabled:opacity-40"
          >
            {codeLoading ? 'Creating…' : 'New code'}
          </button>
        </div>

        {codeError && (
          <div className="mt-3 flex items-start gap-2 border border-[#ff5c2b]/25 bg-[#ff5c2b]/[0.06] p-3 text-[12px] text-[#ff5c2b]">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{codeError}</span>
          </div>
        )}

        {code && !codeError && (
          <div className="mt-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-3xl font-bold tracking-widest text-[#f2f0ea]">
                {code}
              </span>
              <button
                type="button"
                onClick={copyCode}
                className="flex items-center gap-1.5 border border-[#f2f0ea]/10 px-2.5 py-1.5 text-[11px] font-semibold text-[#f2f0ea]/70 transition-colors hover:text-[#f2f0ea]"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="mt-2 text-[11px] text-[#f2f0ea]/40">
              Works once until {expiryText ?? 'it expires'}. After linking, manage {displayName} from
              this dashboard on any device.
            </p>
          </div>
        )}

        {!code && !codeError && codeLoading && (
          <p className="mt-3 text-[12px] text-[#f2f0ea]/40">Creating setup code…</p>
        )}
      </div>

      {liveInfo?.online && (
        <p className="text-[11px] text-[#d8ff3c]/90">
          Agent is online — last seen {liveInfo.seconds_since_seen}s ago. You can close this and
          control {displayName} from anywhere.
        </p>
      )}
    </div>
  );
}
