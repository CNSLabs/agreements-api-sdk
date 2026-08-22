import axios from "axios";
import { useState } from "react";
import * as Sentry from "@sentry/react";
import { FeatherAlertTriangle, FeatherCheck } from "@subframe/core";
import { useLogin } from "@/hooks/useLogin";
import { createBrowserTelemetryHeaders } from "@/lib/telemetry";
import { sentryEnabled } from "@/sentry";
import { IconButton } from "@/subframe/components/IconButton";

const sentryEnvironment = import.meta.env.VITE_SENTRY_ENVIRONMENT?.toLowerCase() ?? "";
const smokeTestEnvironments = new Set(["dev", "alpha"]);
const showSentrySmokeTrigger = sentryEnabled && smokeTestEnvironments.has(sentryEnvironment);
const AGREEMENTS_API_URL = import.meta.env.VITE_AGREEMENTS_API_BASE_URL || "";
const AGREEMENTS_API_BASE = `${AGREEMENTS_API_URL}/agreements-api`;
const deepSmokeFailTarget = "auth-api";

export default function SentryDevErrorButton() {
  const { getAuthToken } = useLogin();
  const [isRunning, setIsRunning] = useState(false);
  const [lastEventId, setLastEventId] = useState<string | null>(null);
  const [lastCorrelationId, setLastCorrelationId] = useState<string | null>(null);

  if (!showSentrySmokeTrigger) {
    return null;
  }

  const handleClick = async () => {
    setIsRunning(true);
    setLastEventId(null);
    setLastCorrelationId(null);

    await Sentry.startSpan(
      {
        name: "shodai-reference-frontend.telemetry.full-stack-smoke",
        op: "ui.action",
        attributes: {
          "smoke.test": true,
          "smoke.trigger": "topbar_button",
          "smoke.fail_target": deepSmokeFailTarget,
          "app.environment": sentryEnvironment,
        },
      },
      async () => {
        const telemetryHeaders = createBrowserTelemetryHeaders();
        const correlationId = telemetryHeaders["x-correlation-id"] ?? null;
        setLastCorrelationId(correlationId);

        try {
          const authToken = await getAuthToken();

          await axios.get(`${AGREEMENTS_API_BASE}/telemetry/smoke/full-stack`, {
            params: { failAt: deepSmokeFailTarget },
            headers: {
              ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
              ...telemetryHeaders,
            },
          });

          const eventId = Sentry.captureMessage(
            `Shodai reference frontend ${sentryEnvironment} full-stack smoke unexpectedly succeeded`,
            {
              level: "warning",
              tags: {
                smoke_test: "true",
                smoke_trigger: "topbar_button",
                smoke_path: "full_stack",
                smoke_fail_target: deepSmokeFailTarget,
                smoke_outcome: "unexpected_success",
                app: "shodai-reference-frontend",
              },
              extra: {
                correlationId,
                href: window.location.href,
                apiBase: AGREEMENTS_API_BASE,
              },
            }
          );

          setLastEventId(eventId ?? null);
          return;
        } catch (error) {
          const eventId = Sentry.captureException(
            new Error(
              `Shodai reference frontend ${sentryEnvironment} full-stack smoke hit ${deepSmokeFailTarget} as expected`
            ),
            {
              tags: {
                smoke_test: "true",
                smoke_trigger: "topbar_button",
                smoke_path: "full_stack",
                smoke_fail_target: deepSmokeFailTarget,
                smoke_outcome: "expected_failure",
                app: "shodai-reference-frontend",
              },
              extra: {
                correlationId,
                href: window.location.href,
                userAgent: window.navigator.userAgent,
                apiBase: AGREEMENTS_API_BASE,
                requestPath: "/shodai-reference-api/agreements-api/telemetry/smoke/full-stack",
                responseStatus: axios.isAxiosError(error) ? error.response?.status : undefined,
                responseData: axios.isAxiosError(error) ? error.response?.data : undefined,
                originalError:
                  error instanceof Error ? error.message : typeof error === "string" ? error : undefined,
              },
            }
          );

          setLastEventId(eventId ?? null);
        } finally {
          setIsRunning(false);
        }
      }
    );
  };

  return (
    <IconButton
      className="shrink-0"
      variant="neutral-secondary"
      size="small"
      icon={lastEventId ? <FeatherCheck /> : <FeatherAlertTriangle />}
      disabled={isRunning}
      onClick={handleClick}
      title={
        isRunning
          ? "Triggering full-stack Sentry smoke test"
          : lastEventId
            ? `Sent full-stack Sentry smoke event ${lastEventId}${
                lastCorrelationId ? ` [correlationId=${lastCorrelationId}]` : ""
              }`
            : "Trigger full-stack Sentry smoke error"
      }
      aria-label={isRunning ? "Triggering full-stack Sentry smoke test" : "Trigger full-stack Sentry smoke error"}
    />
  );
}
