import type { Metadata } from "next";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import LoadingBar from "@/components/LoadingBar";
import { Inter, Roboto_Mono, Orbitron, Rajdhani } from "next/font/google";
import "./globals.css";

const localhostServiceWorkerCleanupScript = `
(() => {
  if (typeof window === "undefined") return;

  const isLocalhost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "::1";

  if (!isLocalhost || !("serviceWorker" in navigator)) return;

  const cleanupFlag = "__bmg_local_sw_cleanup_v2";
  if (sessionStorage.getItem(cleanupFlag) === "done") return;

  const clearCaches = async () => {
    if (!("caches" in window)) return;
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map((key) => caches.delete(key)));
  };

  navigator.serviceWorker.getRegistrations().then(async (registrations) => {
    if (registrations.length === 0) {
      sessionStorage.setItem(cleanupFlag, "done");
      return;
    }

    await Promise.all(registrations.map((registration) => registration.unregister()));
    await clearCaches();

    sessionStorage.setItem(cleanupFlag, "done");
    window.location.reload();
  }).catch(() => {
    sessionStorage.setItem(cleanupFlag, "done");
  });
})();
`;

const geistSans = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

const geistMono = Roboto_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
  weight: ["700", "800"], // Only load heavy weights needed
  display: "swap",
  preload: false, // Don't preload - let it load async
  fallback: ["Arial", "sans-serif"],
});

const rajdhani = Rajdhani({
  variable: "--font-rajdhani",
  subsets: ["latin"],
  weight: ["400", "600"], // Only load weights actually used
  display: "swap",
  preload: false, // Don't preload - let it load async
  fallback: ["Arial", "sans-serif"],
});

export const metadata: Metadata = {
  title: "BookMyGame : Book Gaming Cafés Across India",
  description: "India's premier gaming café booking platform. Find, book, and play at the best gaming cafés near you.",
  manifest: "/manifest.json",
  applicationName: "BookMyGame",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "BookMyGame",
  },
  keywords: [
    "gaming cafe",
    "gaming cafe booking",
    "book gaming cafe",
    "gaming lounge",
    "esports cafe",
    "PS5 cafe",
    "PC gaming cafe",
    "India gaming",
  ],
  authors: [{ name: "BookMyGame" }],
  creator: "BookMyGame",
  publisher: "BookMyGame",
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: "https://www.bookmygame.co.in",
    title: "BookMyGame - Gaming Café Booking Platform",
    description: "India's premier gaming café booking platform. Find, book, and play at the best gaming cafés near you.",
    siteName: "BookMyGame",
  },
  twitter: {
    card: "summary_large_image",
    title: "BookMyGame - Gaming Café Booking",
    description: "India's premier gaming café booking platform",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: localhostServiceWorkerCleanupScript }} />
        <link rel="preconnect" href="https://zlwqbmcgrrqrbyxdpqgn.supabase.co" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        {/* iOS Splash Screens - using available splash as fallback */}
        {/* iPhone XS Max, 11 Pro Max (1242x2688) */}
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1242-2688.png" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        {/* iPhone X, XS, 11 Pro, 12 Mini (1125x2436) - fallback to existing */}
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1242-2688.png" media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        {/* iPhone XR, 11 (828x1792) - fallback to existing */}
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1242-2688.png" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        {/* iPhone 12, 12 Pro, 13, 13 Pro, 14 (1170x2532) - fallback to existing */}
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1242-2688.png" media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        {/* iPhone 12 Pro Max, 13 Pro Max, 14 Plus (1284x2778) - fallback to existing */}
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1242-2688.png" media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        {/* iPhone 14 Pro (1179x2556) - fallback to existing */}
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1242-2688.png" media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        {/* iPhone 14 Pro Max (1290x2796) - fallback to existing */}
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1242-2688.png" media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        {/* iPhone 8, 7, 6s, 6 (750x1334) - fallback to existing */}
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1242-2688.png" media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        {/* iPhone 8 Plus, 7 Plus, 6s Plus, 6 Plus (1242x2208) - fallback to existing */}
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1242-2688.png" media="(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        {/* iPad Pro 12.9" (2048x2732) - fallback to existing */}
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1242-2688.png" media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        {/* iPad Pro 11" (1668x2388) - fallback to existing */}
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1242-2688.png" media="(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        {/* iPad Air, iPad 10.2" (1620x2160) - fallback to existing */}
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1242-2688.png" media="(device-width: 810px) and (device-height: 1080px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#ff0033" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${orbitron.variable} ${rajdhani.variable} bg-black text-white`}
        suppressHydrationWarning
      >
        <LoadingBar />
        <Navbar />
        {children}
        <Footer />
      </body>
    </html>
  );
}
