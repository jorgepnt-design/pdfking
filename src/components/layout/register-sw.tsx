"use client";

import { useEffect } from "react";

export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    // The native Android wrapper always has a network connection and does not
    // need the PWA offline shell. An old cached navigation could otherwise
    // return the homepage for every tool link, making the app look as if it
    // merely reloads after a tap.
    if (navigator.userAgent.includes("CoroaPDFAndroid/")) {
      const disableOfflineShell = async () => {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));

        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((key) => caches.delete(key)));
        }

        if (
          navigator.serviceWorker.controller &&
          sessionStorage.getItem("coroapdf.android-sw-disabled") !== "1"
        ) {
          sessionStorage.setItem("coroapdf.android-sw-disabled", "1");
          window.location.reload();
        }
      };

      void disableOfflineShell().catch(() => undefined);
      return;
    }

    const register = () => navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
