'use client';

import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Booking App PWA Installer Component
 * 
 * Displays install prompts for customers to add BookMyGame as a PWA.
 * Modular design - can be removed by simply not importing this component.
 * 
 * To remove: Delete this file and remove import from layout/HomeClient
 */
export default function PWAInstaller() {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [showInstallPrompt, setShowInstallPrompt] = useState(false);
    /**
     * Whether the site is already running as an installed app, and whether this
     * is an iPhone or iPad.
     *
     * Subscribed to rather than copied into state on mount. Copying rendered
     * the page twice and, for the frame in between, offered to install
     * something already installed.
     *
     * The third argument is the server's answer. This component renders on the
     * server too, where there is no window, so returning false there keeps the
     * first client render matching the HTML instead of throwing a hydration
     * mismatch — which is also why a lazy useState initialiser will not do.
     *
     * Kept identical to OwnerPWAInstaller, which is the same component for the
     * owner dashboard.
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

    // Nothing to subscribe to: a user agent does not change.
    const isIOS = useSyncExternalStore(
        () => () => {},
        () => /iPad|iPhone|iPod/.test(navigator.userAgent),
        () => false
    );

    useEffect(() => {
        if (typeof window !== 'undefined') {
            // Check if dismissed recently (7 days)
            const dismissedAt = localStorage.getItem('pwa_dismissed');
            if (dismissedAt) {
                const daysSinceDismissal = (Date.now() - parseInt(dismissedAt)) / (1000 * 60 * 60 * 24);
                if (daysSinceDismissal < 7) return;
            }

            // Show iOS instructions after delay if not installed
            if (isIOS && !isStandalone) {
                const timer = setTimeout(() => setShowInstallPrompt(true), 4000);
                return () => clearTimeout(timer);
            }
        }
        // isIOS and isStandalone are read here, and during hydration the
        // first render sees the server's answer, so this has to re-run when
        // they settle.
    }, [isIOS, isStandalone]);

    useEffect(() => {
        // Listen for install prompt separate from init logic
        const handleBeforeInstallPrompt = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);
            // Show prompt after short delay
            setTimeout(() => setShowInstallPrompt(true), 3000);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        };
    }, []);

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
        localStorage.setItem('pwa_dismissed', Date.now().toString());
        setShowInstallPrompt(false);
    }, []);

    // Don't show if already installed or dismissed
    if (isStandalone || !showInstallPrompt) return null;

    return (
        <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:max-w-sm">
            <div className="bg-gray-900 border border-red-900/30 rounded-xl p-4 shadow-2xl">
                <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-red-600 to-red-700 rounded-lg flex items-center justify-center flex-shrink-0">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <div className="flex-1">
                        <h3 className="text-white font-semibold text-sm">Install BookMyGame</h3>
                        <p className="text-gray-400 text-xs mt-1">
                            {isIOS
                                ? 'Tap share button → "Add to Home Screen"'
                                : 'Book gaming sessions faster from home screen'
                            }
                        </p>
                    </div>
                    <button
                        onClick={handleDismiss}
                        className="text-gray-500 hover:text-gray-300 p-1"
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
                        className="mt-3 w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-medium py-2 px-4 rounded-lg text-sm transition-all"
                    >
                        Install App
                    </button>
                )}
            </div>
        </div>
    );
}
