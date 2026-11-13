"use client";
import { useEffect, useState } from "react";

/** Shown only while the browser reports no network. Pages keep the last data they loaded. */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (!offline) return null;
  return (
    <div role="status" className="border-b border-bad/40 bg-bad/10 px-4 py-2 text-center text-xs text-bad sm:px-6 lg:px-8">
      You are offline. Showing the last data loaded. Transactions and updates resume when you reconnect.
    </div>
  );
}
