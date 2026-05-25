import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { refreshSession } from "@/lib/api/auth";
import { apiClient } from "@/lib/api/client";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

// Sliding session + manual extend, mirroring the AWS Console pattern.
//
//   - Token TTL: ~30 min (set by the server's JWT_EXPIRATION_MINUTES).
//   - Session absolute cap: 12 h (enforced server-side in jwt.RefreshToken).
//
// This component is mounted once near the app root and runs as long as the
// user is signed in. It ticks every TICK_MS and decides whether to:
//
//   1. Silently refresh — token has <= AUTO_REFRESH_THRESHOLD_MS left AND
//      we saw user activity in the last RECENT_ACTIVITY_MS, OR
//   2. Surface a "Stay signed in" toast — token has <= WARN_THRESHOLD_MS
//      left AND no recent activity. Clicking it calls refreshSession().
//
// The toast is sticky and de-duplicated by id so it doesn't pile up.

const TICK_MS = 30 * 1000;
const AUTO_REFRESH_THRESHOLD_MS = 5 * 60 * 1000;
const WARN_THRESHOLD_MS = 2 * 60 * 1000;
const RECENT_ACTIVITY_MS = 2 * 60 * 1000;
const TOAST_ID = "session-extend";

export function SessionGuard() {
  const { isAuthenticated, logout } = useAuth();
  const lastActivityRef = useRef<number>(Date.now());
  const inflightRef = useRef<boolean>(false);

  const markActive = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  // Track user activity so the auto-refresh path is gated on "user is here"
  // rather than firing forever even when the tab is idle. mouse/keyboard
  // are enough — passive listeners so we never block paint.
  useEffect(() => {
    if (!isAuthenticated) return;
    const events: (keyof WindowEventMap)[] = [
      "mousemove",
      "keydown",
      "click",
      "touchstart",
      "scroll",
    ];
    for (const e of events) window.addEventListener(e, markActive, { passive: true });
    return () => {
      for (const e of events) window.removeEventListener(e, markActive);
    };
  }, [isAuthenticated, markActive]);

  const tryRefresh = useCallback(async (silent: boolean) => {
    if (inflightRef.current) return;
    inflightRef.current = true;
    try {
      await refreshSession();
      if (!silent) {
        toast.success("Session extended", { id: TOAST_ID });
      }
    } catch {
      // The server uses 401 for "absolute cap exceeded" — the apiClient's
      // 401 handler will trigger the SessionExpired dialog. Nothing to do.
    } finally {
      inflightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      toast.dismiss(TOAST_ID);
      return;
    }

    const tick = () => {
      const tokenExpISO = apiClient.getTokenExpiresAt();
      const sessionExpISO = apiClient.getSessionExpiresAt();
      if (!tokenExpISO) return; // legacy session — nothing to base decisions on

      const now = Date.now();
      const tokenMsLeft = new Date(tokenExpISO).getTime() - now;
      const sessionMsLeft = sessionExpISO
        ? new Date(sessionExpISO).getTime() - now
        : Infinity;

      // Absolute cap reached — force logout cleanly.
      if (sessionMsLeft <= 0) {
        toast.dismiss(TOAST_ID);
        logout();
        return;
      }

      // Silent slide forward while the user is active.
      const recentlyActive = now - lastActivityRef.current < RECENT_ACTIVITY_MS;
      if (tokenMsLeft <= AUTO_REFRESH_THRESHOLD_MS && recentlyActive) {
        void tryRefresh(true);
        return;
      }

      // Idle but the token is about to die: surface the toast so the user
      // can click "Stay signed in" instead of being logged out mid-keystroke.
      if (tokenMsLeft <= WARN_THRESHOLD_MS && !recentlyActive) {
        const seconds = Math.max(1, Math.round(tokenMsLeft / 1000));
        toast.warning(`Session ends in ${formatMmSs(seconds)}`, {
          id: TOAST_ID,
          description: "Stay signed in to keep working.",
          duration: Infinity,
          action: {
            label: "Stay signed in",
            onClick: () => {
              void tryRefresh(false);
            },
          },
        });
      } else {
        // Tidy up the toast if the user becomes active again.
        toast.dismiss(TOAST_ID);
      }
    };

    tick(); // immediate evaluation
    const id = window.setInterval(tick, TICK_MS);
    return () => {
      window.clearInterval(id);
    };
  }, [isAuthenticated, logout, tryRefresh]);

  return null;
}

// formatMmSs renders seconds as M:SS so the user has a concrete countdown.
function formatMmSs(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ExtendSessionButton is a small inline button consumers can drop into a
// header/menu if they want a permanent "extend" affordance instead of
// waiting for the warning toast. Re-exported so feature work can use it.
export function ExtendSessionButton() {
  const onClick = async () => {
    try {
      await refreshSession();
      toast.success("Session extended");
    } catch {
      toast.error("Could not extend session");
    }
  };
  return (
    <Button variant="outline" size="sm" onClick={onClick}>
      Extend session
    </Button>
  );
}
