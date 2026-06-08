import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import OtpCodeInput from "@/components/OtpCodeInput";
import { useLogin } from "@/hooks/useLogin";
import { Alert } from "@/subframe/components/Alert";
import { LinkButton } from "@/subframe/components/LinkButton";
import {
  clearLoginCodeContext,
  type LoginCodeContext,
  persistLoginCodeContext,
  readLoginCodeContext,
  safeReturnTo,
} from "@/utils/loginCodeFlow";

const OTP_LENGTH = 6;

function emptyOtpCode(): string[] {
  return Array.from({ length: OTP_LENGTH }, () => "");
}

function resolveLoginCodeContext(state: unknown): LoginCodeContext | null {
  if (state && typeof state === "object") {
    const candidate = state as Partial<LoginCodeContext>;
    if (
      typeof candidate.email === "string" &&
      candidate.email.length > 0 &&
      typeof candidate.returnTo === "string"
    ) {
      return {
        email: candidate.email,
        returnTo: safeReturnTo(candidate.returnTo),
      };
    }
  }

  return readLoginCodeContext();
}

const LoginCode: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isConnected, verifyOTP, connectWithEmail } = useLogin();

  const context = useMemo(
    () => resolveLoginCodeContext(location.state),
    [location.state],
  );

  const [code, setCode] = useState<string[]>(() => emptyOtpCode());
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [inputResetKey, setInputResetKey] = useState(0);
  const lastSubmittedCodeRef = useRef<string | null>(null);

  const resetCode = useCallback(() => {
    setCode(emptyOtpCode());
    setInputResetKey((previous) => previous + 1);
    lastSubmittedCodeRef.current = null;
  }, []);

  useEffect(() => {
    if (!context) return;
    persistLoginCodeContext(context);
  }, [context]);

  useEffect(() => {
    if (!context) {
      navigate("/login", { replace: true });
    }
  }, [context, navigate]);

  useEffect(() => {
    if (isConnected && context) {
      clearLoginCodeContext();
      navigate(context.returnTo, { replace: true });
    }
  }, [context, isConnected, navigate]);

  const handleVerifyCode = useCallback(
    async (value: string) => {
      if (!context) return;
      setIsVerifying(true);
      setError(null);
      try {
        await verifyOTP(value);
        clearLoginCodeContext();
      } catch (err: any) {
        setError(
          err?.message || "Code invalid or expired. Please try again.",
        );
        resetCode();
      } finally {
        setIsVerifying(false);
      }
    },
    [context, resetCode, verifyOTP],
  );

  useEffect(() => {
    if (!context || isVerifying) return;
    if (code.some((digit) => digit === "")) return;

    const combinedCode = code.join("");
    if (combinedCode.length !== OTP_LENGTH) return;
    if (lastSubmittedCodeRef.current === combinedCode) return;

    lastSubmittedCodeRef.current = combinedCode;
    void handleVerifyCode(combinedCode);
  }, [code, context, handleVerifyCode, isVerifying]);

  const handleCodeChange = useCallback(
    (nextCode: string[]) => {
      setCode(nextCode);
      if (error) {
        setError(null);
      }
      if (nextCode.some((digit) => digit === "")) {
        lastSubmittedCodeRef.current = null;
      }
    },
    [error],
  );

  const handleResend = useCallback(async () => {
    if (!context || isResending) return;
    setIsResending(true);
    setError(null);
    try {
      await connectWithEmail(context.email);
      resetCode();
    } catch (err: any) {
      setError(
        err?.message || "Failed to resend verification code. Please try again.",
      );
    } finally {
      setIsResending(false);
    }
  }, [connectWithEmail, context, isResending, resetCode]);

  const handleBackToSignIn = useCallback(() => {
    clearLoginCodeContext();

    if (!context) {
      navigate("/login", { replace: true });
      return;
    }

    const params = new URLSearchParams();
    params.set("returnTo", context.returnTo);
    navigate(`/login?${params.toString()}`, { replace: true });
  }, [context, navigate]);

  if (!context) {
    return null;
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-default-background p-[10px] text-default-font">
      <div className="grid min-h-[calc(100vh-20px)] w-full grid-cols-1 gap-[10px] md:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <section className="shodai-module shodai-grid-surface flex min-h-[280px] flex-col justify-between p-[10px]">
          <div className="flex items-center justify-between gap-[10px]">
            <span className="text-heading-3 font-heading-3 text-default-font">
              Shodai Agreements
            </span>
            <span className="text-caption font-caption text-subtext-color">
              CODE
            </span>
          </div>
          <div className="max-w-[720px]">
            <h1 className="text-heading-1 font-heading-1 text-default-font">
              Verify access
            </h1>
            <p className="mt-[10px] max-w-[560px] text-heading-3 font-heading-3 text-subtext-color">
              Agreements stay accountable from signature through settlement.
            </p>
          </div>
        </section>

        <section className="shodai-module flex min-h-[520px] items-center justify-center p-[10px]">
          <div className="flex w-full max-w-[448px] flex-col items-center justify-center gap-[20px]">
          <div className="flex w-full flex-col items-center justify-center gap-2">
            <span className="text-heading-2 font-heading-2 text-default-font text-center">
              Enter verification code
            </span>
            <span className="text-caption font-caption text-subtext-color text-center">
              We sent a 6-digit code to {context.email}. The code expires in 10 minutes.
            </span>
          </div>

          {error ? (
            <Alert
              className="w-full"
              variant="error"
              title="Verification failed"
              description={error}
            />
          ) : null}

          <OtpCodeInput
            key={inputResetKey}
            value={code}
            onChange={handleCodeChange}
            disabled={isVerifying || isResending}
            autoFocus
            className="flex items-center justify-center gap-2"
          />

          <div className="flex flex-col items-center justify-center gap-4">
            <div className="flex items-center justify-center gap-1">
              <span className="text-caption font-caption text-subtext-color">
                Didn&apos;t receive the code?
              </span>
              <LinkButton
                size="small"
                variant="brand"
                disabled={isVerifying || isResending}
                onClick={handleResend}
              >
                {isResending ? "Sending..." : "Resend code"}
              </LinkButton>
            </div>
            <LinkButton
              size="small"
              disabled={isVerifying}
              onClick={handleBackToSignIn}
            >
              {"<"} Back to sign in
            </LinkButton>
          </div>
          </div>
        </section>
        </div>
    </div>
  );
};

export default LoginCode;
