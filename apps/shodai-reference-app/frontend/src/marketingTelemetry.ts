declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const marketingTelemetryEnabled = import.meta.env.VITE_MARKETING_TELEMETRY_ENABLED === "true";

export function initializeMarketingTelemetry() {
  if (!marketingTelemetryEnabled) return;

  const gaMeasurementId = String(import.meta.env.VITE_GA_MEASUREMENT_ID || "").trim();
  const hubSpotPortalId = String(import.meta.env.VITE_HUBSPOT_PORTAL_ID || "").trim();

  if (gaMeasurementId) {
    initializeGoogleAnalytics(gaMeasurementId);
  }

  if (hubSpotPortalId) {
    appendScript({
      id: "hs-script-loader",
      src: `https://js-na3.hs-scripts.com/${encodeURIComponent(hubSpotPortalId)}.js`,
      defer: true,
    });
  }
}

function initializeGoogleAnalytics(measurementId: string) {
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || ((...args: unknown[]) => window.dataLayer?.push(args));
  window.gtag("js", new Date());
  window.gtag("config", measurementId);

  appendScript({
    id: "ga-gtag-loader",
    src: `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`,
    async: true,
  });
}

function appendScript(options: {
  id: string;
  src: string;
  async?: boolean;
  defer?: boolean;
}) {
  if (document.getElementById(options.id)) return;

  const script = document.createElement("script");
  script.id = options.id;
  script.src = options.src;
  script.async = options.async ?? false;
  script.defer = options.defer ?? false;
  document.head.appendChild(script);
}

export {};
