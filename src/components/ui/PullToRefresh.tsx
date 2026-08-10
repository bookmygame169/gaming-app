"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { colors } from "@/lib/constants";

/**
 * Drag down at the top of the page to reload it.
 *
 * The interaction people already expect from every app on their phone, and its
 * absence is one of the things that makes a site feel like a site. The whole
 * difficulty is not breaking ordinary scrolling to get it.
 *
 * Three rules keep it out of the way:
 *
 * - It only ever starts when the page is already scrolled to the very top.
 *   Anywhere else the touch is a scroll and is never touched.
 * - The gesture must be more vertical than horizontal, so a sideways swipe
 *   through a row of chips is not mistaken for a pull.
 * - preventDefault is called only once a pull is genuinely underway, because
 *   calling it earlier would kill the scroll it turns out the user wanted.
 */

const TRIGGER_DISTANCE = 72;
/** Past the trigger the finger keeps moving but the indicator barely does,
 *  which is what makes the gesture feel like it is resisting. */
const MAX_PULL = 110;

interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  children: React.ReactNode;
  /** Switched off while a modal is open, or on pages that scroll internally. */
  disabled?: boolean;
}

export default function PullToRefresh({ onRefresh, children, disabled }: PullToRefreshProps) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const startY = useRef(0);
  const startX = useRef(0);
  const active = useRef(false);
  const decided = useRef(false);

  /**
   * Listeners are attached once and read only refs, so a state update landing
   * late cannot leave them looking at a stale pull distance — and four
   * listeners are not torn down and re-added on every frame of the gesture.
   */
  const refreshingRef = useRef(false);

  /**
   * Release.
   *
   * The distance is recomputed here from the touch that ended, rather than
   * read back from state set during the move. Reading it back meant relying on
   * a React update having landed before the finger lifted, and it had not — the
   * gesture armed on screen and then did nothing on release.
   */
  const finish = useCallback(async (event?: TouchEvent) => {
    const endY = event?.changedTouches?.[0]?.clientY;
    const travelled = typeof endY === "number" ? endY - startY.current : 0;
    const pulled = active.current && decided.current && travelled > 0
      ? Math.min(MAX_PULL, Math.sqrt(travelled) * 6)
      : 0;

    if (pulled >= TRIGGER_DISTANCE && !refreshingRef.current) {
      refreshingRef.current = true;
      setRefreshing(true);
      // Held at the trigger point so the spinner has somewhere to sit while
      // the work happens, rather than snapping back and leaving no feedback.
      setPull(TRIGGER_DISTANCE);
      try {
        await onRefresh();
      } finally {
        refreshingRef.current = false;
        setRefreshing(false);
        setPull(0);
      }
    } else {
      setPull(0);
    }

    active.current = false;
    decided.current = false;
  }, [onRefresh]);

  useEffect(() => {
    if (disabled) return;

    const onTouchStart = (event: TouchEvent) => {
      // Only from a genuine top-of-page. scrollY is checked rather than a
      // container's scrollTop because these pages scroll the window.
      if (window.scrollY > 0 || refreshingRef.current) return;

      startY.current = event.touches[0].clientY;
      startX.current = event.touches[0].clientX;
      active.current = true;
      decided.current = false;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!active.current || refreshingRef.current) return;

      const deltaY = event.touches[0].clientY - startY.current;
      const deltaX = event.touches[0].clientX - startX.current;

      // Upward, or the page has scrolled since the touch began: this is a
      // scroll, so let go of it entirely.
      if (deltaY <= 0 || window.scrollY > 0) {
        active.current = false;
        setPull(0);
        return;
      }

      if (!decided.current) {
        // Wait for enough movement to tell a pull from a sideways swipe.
        if (Math.abs(deltaY) < 8 && Math.abs(deltaX) < 8) return;

        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          active.current = false;
          return;
        }

        decided.current = true;
      }

      // Now it is definitely a pull, so stop the browser from rubber-banding
      // underneath it.
      if (event.cancelable) event.preventDefault();

      // Square-root easing: the first pixels move freely, the last barely
      // move at all.
      setPull(Math.min(MAX_PULL, Math.sqrt(deltaY) * 6));
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    // Not passive: this one needs to be able to call preventDefault.
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", finish, { passive: true });
    window.addEventListener("touchcancel", finish, { passive: true });

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", finish);
      window.removeEventListener("touchcancel", finish);
    };
  }, [disabled, finish]);

  const ready = pull >= TRIGGER_DISTANCE;

  return (
    <>
      <div
        aria-hidden={pull === 0}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          pointerEvents: "none",
          zIndex: 40,
          // Rides down with the finger and sits just under the header.
          transform: `translateY(${pull > 0 ? pull * 0.6 + 8 : -60}px)`,
          transition: active.current ? "none" : "transform 220ms ease",
          opacity: pull > 0 ? 1 : 0,
        }}
      >
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: "50%",
            background: "rgba(10,10,15,0.94)",
            border: `1px solid ${ready ? colors.cyan : colors.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 6px 20px rgba(0,0,0,0.5)",
          }}
        >
          <RefreshCw
            size={17}
            className={refreshing ? "animate-spin" : undefined}
            style={{
              color: ready ? colors.cyan : colors.textMuted,
              // Turns as it is pulled, so it visibly "arms" before release.
              transform: refreshing ? undefined : `rotate(${pull * 2.6}deg)`,
              transition: "color 150ms ease",
            }}
          />
        </div>
      </div>

      <div
        style={{
          transform: pull > 0 ? `translateY(${pull * 0.35}px)` : undefined,
          transition: active.current ? "none" : "transform 220ms ease",
        }}
      >
        {children}
      </div>
    </>
  );
}
