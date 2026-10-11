import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/App";
import { AppProviders } from "@/app/providers/AppProviders";
import { ErrorBoundary } from "@/app/ErrorBoundary";
import "@/styles/globals.css";
import "@/styles/components.css";
import "@/styles/utilities.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found — check index.html.");
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <AppProviders>
        <App />
      </AppProviders>
    </ErrorBoundary>
  </StrictMode>
);

// PWA service worker (Master Spec section 63). Registered only in
// production builds so `npm run dev` never serves stale cached assets —
// and wrapped so a registration failure (e.g. served over plain HTTP)
// never breaks the app itself.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      // eslint-disable-next-line no-console
      console.warn("Service worker registration failed:", error);
    });
  });
}
