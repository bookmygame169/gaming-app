'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Camera, Loader2, X } from 'lucide-react';
import jsQR from 'jsqr';

/**
 * Reads the code on a locked PC, from inside the app.
 *
 * The phone's own camera app can read the same code, and for someone browsing
 * the site normally that works fine. It does not work for the customers this is
 * actually for. An iPhone home-screen app keeps its cookies separately from
 * Safari, so a regular who installed BookMyGame and signed in there scans, gets
 * handed to Safari, and finds themselves signed out — standing at the machine,
 * being asked to log in again. Apple provides no way to hand a link back to an
 * installed web app, so the only fix is to never leave it.
 */
export default function ScanPage() {
    const router = useRouter();
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const [status, setStatus] = useState<'starting' | 'scanning' | 'found' | 'error'>('starting');
    const [error, setError] = useState<string | null>(null);

    /**
     * Whether opening the camera is taking longer than it should.
     *
     * getUserMedia does not settle while a permission prompt is on screen, and
     * on some devices it never settles at all. Either way the customer is left
     * reading "Opening the camera" with nothing to do about it. Rather than
     * give up on them - they may simply not have tapped Allow yet - the wait
     * turns into an explanation of what is being waited for.
     */
    const [slow, setSlow] = useState(false);

    // Held in a ref rather than state: the scan loop reads it every frame, and a
    // stale closure would keep reading a hit after we had navigated away.
    const stoppedRef = useRef(false);
    const streamRef = useRef<MediaStream | null>(null);

    /**
     * Pulls the token out of whatever was scanned.
     *
     * The code holds a full URL, but a customer could point the camera at any
     * QR in the world. Anything that is not one of our play links is ignored
     * rather than followed — sending someone to an arbitrary scanned address is
     * how a scanner becomes a way to phish them.
     */
    const tokenFrom = useCallback((raw: string): string | null => {
        const direct = raw.match(/\/play\/([A-Za-z0-9_-]{20,})$/);
        if (!direct) return null;

        try {
            const url = new URL(raw);
            if (url.origin !== window.location.origin) return null;
        } catch {
            return null;
        }

        return direct[1];
    }, []);

    const stop = useCallback(() => {
        stoppedRef.current = true;
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
    }, []);

    useEffect(() => {
        let raf = 0;

        const tick = () => {
            if (stoppedRef.current) return;

            const video = videoRef.current;
            const canvas = canvasRef.current;

            if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
                const context = canvas.getContext('2d', { willReadFrequently: true });
                if (context) {
                    // Scaled down before decoding. A full-resolution frame is far
                    // more pixels than a QR needs and turns the loop into a
                    // slideshow on a mid-range phone.
                    const width = 480;
                    const height = Math.round((video.videoHeight / video.videoWidth) * width) || 480;
                    canvas.width = width;
                    canvas.height = height;
                    context.drawImage(video, 0, 0, width, height);

                    const image = context.getImageData(0, 0, width, height);
                    const hit = jsQR(image.data, width, height, { inversionAttempts: 'dontInvert' });

                    if (hit?.data) {
                        const token = tokenFrom(hit.data);
                        if (token) {
                            setStatus('found');
                            stop();
                            router.push(`/play/${token}`);
                            return;
                        }
                    }
                }
            }

            raf = requestAnimationFrame(tick);
        };

        const start = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    // The back camera. Without this a phone opens the selfie one,
                    // and the customer is left turning the handset around.
                    video: { facingMode: { ideal: 'environment' } },
                    audio: false,
                });

                if (stoppedRef.current) {
                    stream.getTracks().forEach((track) => track.stop());
                    return;
                }

                streamRef.current = stream;

                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    // playsInline matters on iOS: without it the video takes over
                    // the whole screen in its own player and there is nothing to
                    // scan against.
                    await videoRef.current.play();
                }

                setStatus('scanning');
                raf = requestAnimationFrame(tick);
            } catch (err) {
                setStatus('error');
                setError(
                    err instanceof DOMException && err.name === 'NotAllowedError'
                        ? 'Camera access was blocked. Allow it in your browser settings, or ask at the counter.'
                        : 'Could not open the camera. Please ask at the counter.'
                );
            }
        };

        start();

        const slowTimer = window.setTimeout(() => setSlow(true), 6000);

        return () => {
            window.clearTimeout(slowTimer);
            cancelAnimationFrame(raf);
            stop();
        };
    }, [router, stop, tokenFrom]);

    return (
        <main className="fixed inset-0 z-50 bg-black">
            <video
                ref={videoRef}
                className="h-full w-full object-cover"
                muted
                playsInline
                autoPlay
            />
            <canvas ref={canvasRef} className="hidden" />

            {/* The frame is only a guide — decoding uses the whole picture, so a
                code slightly outside it still reads. */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-64 w-64 rounded-3xl border-2 border-white/70 shadow-[0_0_0_100vmax_rgba(0,0,0,0.55)]" />
            </div>

            <button
                type="button"
                onClick={() => {
                    stop();
                    router.back();
                }}
                aria-label="Close"
                className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur"
            >
                <X size={20} />
            </button>

            <div className="absolute inset-x-0 bottom-[max(2rem,env(safe-area-inset-bottom))] px-6 text-center">
                {status === 'starting' && (
                    <div className="space-y-2">
                        <p className="flex items-center justify-center gap-2 text-sm text-white/80">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Opening the camera…
                        </p>
                        {slow && (
                            <p className="mx-auto max-w-xs text-xs text-white/60">
                                Waiting for camera permission. If you did not see a prompt,
                                allow the camera in your browser settings — or ask at the counter.
                            </p>
                        )}
                    </div>
                )}

                {status === 'scanning' && (
                    <p className="flex items-center justify-center gap-2 text-sm font-semibold text-white">
                        <Camera size={16} />
                        Point at the code on the PC screen
                    </p>
                )}

                {status === 'found' && (
                    <p className="flex items-center justify-center gap-2 text-sm font-semibold text-emerald-300">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Got it — opening…
                    </p>
                )}

                {status === 'error' && error && (
                    <div className="mx-auto flex max-w-sm items-start gap-2 rounded-xl bg-amber-500/15 p-3 text-left text-sm text-amber-200 backdrop-blur">
                        <AlertCircle size={16} className="mt-0.5 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}
            </div>
        </main>
    );
}
