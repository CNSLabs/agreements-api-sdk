import React, { useState } from "react";
import { Button } from "@/subframe/components/Button";
import { OAuthSocialButton } from "@/subframe/components/OAuthSocialButton";
import { TextField } from "@/subframe/components/TextField";
import { useLogin } from "@/hooks/useLogin";

export interface LoginFormProps {
  /**
   * Label for the primary submit button.
   * @default "SIGN IN"
   */
  submitLabel?: string;
  /**
   * Pre-fill the email field (e.g. from an invite deep-link).
   */
  initialEmail?: string;
  /**
   * Called after a verification code has been successfully sent to the email.
   */
  onCodeSent?: (email: string) => void;
  /**
   * Called after the user successfully authenticates via social login.
   * If not provided the caller is expected to react to `useLogin().isConnected`
   * becoming true.
   */
  onConnected?: () => void;
}

/**
 * Shared authentication form used by the Login page.
 *
 * Renders:
 *  1. "Sign in with Google" OAuth button
 *  2. Divider ("or continue with email")
 *  3. Email + send-code entry point (verification happens on /login/code)
 */
const LoginForm: React.FC<LoginFormProps> = ({
  submitLabel = "SIGN IN",
  initialEmail,
  onCodeSent,
  onConnected,
}) => {
  const {
    connectWithGoogle,
    connectWithEmail,
    isConnected,
    isConnecting,
  } = useLogin();

  const [email, setEmail] = useState(initialEmail ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Notify parent when the user becomes connected.
  const prevConnected = React.useRef(isConnected);
  React.useEffect(() => {
    if (isConnected && !prevConnected.current) {
      onConnected?.();
    }
    prevConnected.current = isConnected;
  }, [isConnected, onConnected]);

  const handleSendOtp = async () => {
    if (!email) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await connectWithEmail(email);
      onCodeSent?.(email);
    } catch (err: any) {
      setError(
        err?.message || "Failed to send verification code. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* ---- Social OAuth ---- */}
      <div className="flex w-full flex-col items-start justify-center gap-2">
        <OAuthSocialButton
          className="h-10 w-full flex-none"
          onClick={connectWithGoogle}
          disabled={isConnecting}
        >
          Sign in with Google
        </OAuthSocialButton>
      </div>

      {/* ---- Divider ---- */}
      <div className="flex w-full items-center gap-2">
        <div className="flex h-px grow shrink-0 basis-0 flex-col items-center gap-2 bg-neutral-border" />
        <span className="text-body font-body text-subtext-color">
          or continue with email
        </span>
        <div className="flex h-px grow shrink-0 basis-0 flex-col items-center gap-2 bg-neutral-border" />
      </div>

      {/* ---- Email send-code ---- */}
      <div className="flex w-full flex-col items-start justify-center gap-6">
        <TextField
          className="h-auto w-full flex-none"
          label="Email address"
          helpText={error || ""}
          error={!!error}
        >
          <TextField.Input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              setEmail(event.target.value);
              setError(null);
            }}
            onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
              if (event.key === "Enter") {
                handleSendOtp();
              }
            }}
          />
        </TextField>
        <Button
          className="h-10 w-full flex-none"
          size="large"
          variant="brand-primary"
          disabled={!email || isSubmitting}
          loading={isSubmitting}
          onClick={handleSendOtp}
        >
          {isSubmitting ? "SENDING..." : submitLabel}
        </Button>
      </div>
    </>
  );
};

export default LoginForm;
