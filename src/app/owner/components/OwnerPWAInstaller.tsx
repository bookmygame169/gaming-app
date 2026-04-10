'use client';

import { useState, useEffect, useCallback } from 'react';

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
    const [isIOS, setIsIOS] = useState(false);
    const [isStandalone, setIsStandalone] = useState(false);

    useEffect(() => {
        // Check if already installed
        const isStandaloneMode =
            window.matchMedia('(display-mode: standalone)').matches ||
            (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
        setIsStandalone(isStandaloneMode);

        // Check if iOS
        const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
        setIsIOS(isIOSDevice);

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
        if (isIOSDevice && !isStandaloneMode) {
            setTimeout(() => setShowInstallPrompt(true), 3000);
        }

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
        localStorage.setItem('owner_pwa_dismissed', Date.now().toString());
        setShowInstallPrompt(false);
    }, []);

    // Don't show if already installed or dismissed
    if (isStandalone || !showInstallPrompt) return null;

    return (
        <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:max-w-sm">
            <div className="bg-white/[0.06] border border-white/[0.09] rounded-xl p-4 shadow-2xl">
                <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                    </div>
                    <div className="flex-1">
                        <h3 className="text-white font-semibold text-sm">Install Owner Dashboard</h3>
                        <p className="text-slate-400 text-xs mt-1">
                            {isIOS
                                ? 'Tap Safari share button → "Add to Home Screen"'
                                : 'Quick access to manage your café from home screen'
                            }
                        </p>
                    </div>
                    <button
                        onClick={handleDismiss}
                        className="text-slate-500 hover:text-slate-300 p-1"
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
                        className="mt-3 w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors"
                    >
                        Install App
                    </button>
                )}
            </div>
        </div>
    );
}
