// src/components/LoadingBar.tsx
"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export default function LoadingBar() {
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);

  // Clears the overlay once the new route is on screen.
  //
  // Deriving this instead — remember where we navigated to, show the overlay
  // until pathname matches — looks cleaner and is wrong: back and forward do
  // not go through the click handler below, so the remembered target goes stale
  // and the overlay reappears over a page the customer is already reading. One
  // extra render per navigation is the cheaper of the two.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(false);
  }, [pathname]);

  // Listen for link clicks to show loading
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest("a");

      if (link && link.href && link.href.startsWith(window.location.origin)) {
        const url = new URL(link.href);
        // Only show loading if navigating to a different page
        if (url.pathname !== window.location.pathname) {
          setLoading(true);
        }
      }
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  if (!loading) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          width: "60px",
          height: "60px",
          border: "4px solid rgba(255, 7, 58, 0.2)",
          borderTop: "4px solid #ff073a",
          borderRight: "4px solid #00f0ff",
          borderRadius: "50%",
          animation: "spin 1s linear infinite",
        }}
      />
      <style>{`
        @keyframes spin {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
