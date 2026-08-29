'use client';

import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Owner Dashboard PWA Installer Component
 * 
 * Displays install prompts for café owners to add the dashboard as a PWA.
 * Modular design - can be removed by simply not importing this component.
 * 
 * To remove: Delete this file and remove import from owner/page.tsx
 */
export default function OwnerPWAInstaller() {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [showInstallPrompt, setShowInstallPrompt] = useState(false);
    /**
     * Whether this is an iPhone or iPad, which get written instructions
     * because Safari has no install prompt to offer.
     *
     * Read the same way as isStandalone and for the same reason: the value has
     * to come from the browser, the server has no browser, and copying it into
     * state from an effect renders the page twice. Nothing to subscribe to —
     * a user agent does not change — so the subscribe function does nothing.
     */
    const isIOS = useSyncExternalStore(
        () => () => {},
        () => /iPad|iPhone|iPod/.test(navigator.userAgent),
        () => false
    );
    /**
     * Whether the dashboard is already running as an installed app.
     *
     * Subscribed to rather than copied into state by an effect. The effect
     * version set state synchronously on mount, which renders the page twice
     * and — for the frame in between — offers to install something already
     * installed.
     *
     * The third argument is the server's answer. A client component still
     * renders on the server, where there is no window, so returning false
     * there is what keeps the first client render matching the HTML instead of
     * throwing a hydration mismatch. That is also why a lazy useState
     * initialiser will not do the job.
     */
    const isStandalone = useSyncExternalStore(
        (onChange) => {
            const query = window.matchMedia('(display-mode: standalone)');
            query.addEventListener('change', onChange);
            return () => query.removeEventListener('change', onChange);
        },
        () =>
            window.matchMedia('(display-mode: standalone)').matches ||
            (window.navigator as Navigator & { standalone?: boolean }).standalone === true,
        () => false
    );

    useEffect(() => {
        // Check if dismissed recently (7 days)
        const dismissedAt = localStorage.getItem('owner_pwa_dismissed');
        if (dismissedAt) {
            const daysSinceDismissal = (Date.now() - parseInt(dismissedAt)) / (1000 * 60 * 60 * 24);
            if (daysSinceDismissal < 7) return;
        }

        // Listen for install prompt
        const handleBeforeInstallPrompt = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);
            // Show prompt after short delay
            setTimeout(() => setShowInstallPrompt(true), 2000);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        // Show iOS instructions after delay
        if (isIOS && !isStandalone) {
            setTimeout(() => setShowInstallPrompt(true), 3000);
        }

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        };
        // isStandalone belongs here now that it is subscribed rather than read
        // inside. During hydration the first render sees the server's answer —
        // false — so an effect with no dependency on it would capture that and
        // offer to install an app that is already installed. Re-running when it
        // settles costs one listener swap.
    }, [isIOS, isStandalone]);

    const handleInstall = useCallback(async () => {
        if (!deferredPrompt) return;

        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted') {
            setShowInstallPrompt(false);
        }
        setDeferredPrompt(null);
    }, [deferredPrompt]);

    const handleDismiss = useCallback(() => {
        localStorage.setItem('owner_pwa_dismissed', Date.now().toString());
        setShowInstallPrompt(false);
    }, []);

    // Don't show if already installed or dismissed
    if (isStandalone || !showInstallPrompt) return null;

    return (
        <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:max-w-sm">
            <div className="bg-[#f2f0ea]/[0.06] border border-[#f2f0ea]/10 p-4">
                <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-[#d8ff3c] flex items-center justify-center flex-shrink-0">
                        <svg className="w-6 h-6 text-[#f2f0ea]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                    </div>
                    <div className="flex-1">
                        <h3 className="text-[#f2f0ea] font-semibold text-sm">Install Owner Dashboard</h3>
                        <p className="text-[#f2f0ea]/50 text-xs mt-1">
                            {isIOS
                                ? 'Tap Safari share button → "Add to Home Screen"'
                                : 'Quick access to manage your café from home screen'
                            }
                        </p>
                    </div>
                    <button
                        onClick={handleDismiss}
                        className="text-[#f2f0ea]/40 hover:text-[#f2f0ea]/70 p-1"
                        aria-label="Dismiss"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {!isIOS && deferredPrompt && (
                    <button
                        onClick={handleInstall}
                        className="mt-3 w-full bg-[#d8ff3c] hover:bg-[#d8ff3c] text-[#0b0b0c] font-medium py-2 px-4 text-sm transition-colors"
                    >
                        Install App
                    </button>
                )}
            </div>
        </div>
    );
}
