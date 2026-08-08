"use client";

import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";

/**
 * MUV OS™ — Core Platform Foundation (Milestone 1), Header "Connection
 * status". A real, working indicator of the browser's own online/offline
 * state (`navigator.onLine` + the standard `online`/`offline` window
 * events) — not a fake always-green dot. This is also the concrete slot
 * the Global Layout Specification's "future offline support" note (§12)
 * expects to exist first; actual offline data handling is separately out
 * of scope for this milestone.
 */
export function ConnectionStatus() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    function goOnline() {
      setOnline(true);
    }
    function goOffline() {
      setOnline(false);
    }
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return (
    <span
      className="hidden md:flex items-center"
      title={online ? "Online" : "Offline — changes may not be saved"}
      aria-label={online ? "Online" : "Offline"}
      style={{ color: online ? "rgba(var(--text-rgb),0.35)" : "#ef4444" }}
    >
      {online ? <Wifi size={14} /> : <WifiOff size={14} />}
    </span>
  );
}
