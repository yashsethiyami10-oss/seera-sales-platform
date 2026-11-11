"use client";

import { useEffect, useState } from "react";

// Route tracking for an ACTIVE field day. While the Seera App is open and GPS is on, the phone
// reports its position; points are kept in a local queue (survives a weak network or app reload)
// and sent in batches to /api/field/gps-track. When GPS is switched off or the app is closed there
// are simply no points, and the TA distance falls back to the straight line between the last and
// next known point (see eligibleGpsDistanceKm).
type QueuedPoint = { latitude: number; longitude: number; accuracy: number | null; capturedAt: string };

const MIN_MOVE_METERS = 25;
const MAX_STILL_MS = 5 * 60_000;
const FLUSH_MS = 60_000;
const MAX_QUEUE = 3000;

function metersBetween(a: QueuedPoint, b: QueuedPoint) {
  const R = 6_371_000, rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad, dLng = (b.longitude - a.longitude) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, s)));
}

export function FieldGpsTracker({ workSessionId, language }: { workSessionId: string; language: "EN" | "HI" }) {
  const [state, setState] = useState<"ok" | "denied" | "unavailable">("ok");
  useEffect(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setState("unavailable");
      return;
    }
    const key = `seera-gps-track:${workSessionId}`;
    const load = (): QueuedPoint[] => {
      try { return JSON.parse(localStorage.getItem(key) ?? "[]") as QueuedPoint[]; } catch { return []; }
    };
    const save = (queue: QueuedPoint[]) => {
      try { localStorage.setItem(key, JSON.stringify(queue.slice(-MAX_QUEUE))); } catch { /* storage full or blocked */ }
    };
    let last: QueuedPoint | null = load().at(-1) ?? null;
    let stopped = false;
    let flushing = false;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setState("ok");
        const point: QueuedPoint = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : null,
          capturedAt: new Date(pos.timestamp || Date.now()).toISOString(),
        };
        if (last) {
          const moved = metersBetween(last, point);
          const waited = Date.parse(point.capturedAt) - Date.parse(last.capturedAt);
          if (moved < MIN_MOVE_METERS && waited < MAX_STILL_MS) return;
        }
        last = point;
        save([...load(), point]);
      },
      (error) => setState(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 60_000 },
    );

    const flush = async () => {
      if (stopped || flushing || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
      const batch = load().slice(0, 300);
      if (!batch.length) return;
      flushing = true;
      try {
        const res = await fetch("/api/field/gps-track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workSessionId, points: batch }),
          keepalive: true,
        });
        if (res.ok) save(load().slice(batch.length));
        else if (res.status === 404 || res.status === 409) {
          // Day ended (or not this user's session): stop tracking and drop the queue.
          stopped = true;
          navigator.geolocation.clearWatch(watchId);
          try { localStorage.removeItem(key); } catch { /* ignore */ }
        }
      } catch {
        // Offline / network error: keep the queue and retry on the next tick.
      } finally {
        flushing = false;
      }
    };
    const timer = window.setInterval(flush, FLUSH_MS);
    const onHide = () => { if (document.visibilityState === "hidden") void flush(); };
    window.addEventListener("online", flush);
    document.addEventListener("visibilitychange", onHide);
    void flush();
    return () => {
      stopped = true;
      navigator.geolocation.clearWatch(watchId);
      window.clearInterval(timer);
      window.removeEventListener("online", flush);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [workSessionId]);

  // Location problems are shown by GpsGate (always mounted on field portals), not twice here.
  void state;
  return null;
}
