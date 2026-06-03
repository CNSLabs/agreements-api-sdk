import { useCallback, useEffect, useMemo } from "react";
import { useLogin } from "@/hooks/useLogin";
import { useNavigate, useLocation } from "react-router";
import LoginForm from "@/components/LoginForm";
import {
  persistLoginCodeContext,
  safeReturnTo,
} from "@/utils/loginCodeFlow";

function SignInWithQuote() {
  const { isConnected } = useLogin();
  const navigate = useNavigate();
  const location = useLocation();

  const { returnTo, emailHint } = useMemo(() => {
    const qs = new URLSearchParams(location.search || "");
    const dest = safeReturnTo(qs.get("returnTo"));
    // Extract email hint embedded in the returnTo destination (e.g. /agreement/x?email=y)
    let hint: string | undefined;
    try {
      const destParams = new URLSearchParams(dest.split("?")[1] || "");
      const e = destParams.get("email");
      if (e && e.includes("@")) hint = e;
    } catch { /* ignore */ }
    return { returnTo: dest, emailHint: hint };
  }, [location.search]);

  useEffect(() => {
    if (isConnected) {
      navigate(returnTo, { replace: true });
    }
  }, [isConnected, navigate, returnTo]);

  const handleCodeSent = useCallback(
    (email: string) => {
      const context = { email, returnTo };
      persistLoginCodeContext(context);
      navigate("/login/code", { state: context });
    },
    [navigate, returnTo],
  );

  return (
    <div className="flex min-h-screen w-full flex-col bg-default-background p-[10px] text-default-font">
      <div className="grid min-h-[calc(100vh-20px)] w-full grid-cols-1 gap-[10px] md:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <section className="shodai-module shodai-grid-surface flex min-h-[280px] flex-col justify-between p-[10px]">
          <div className="flex items-center justify-between gap-[10px]">
            <span className="text-heading-3 font-heading-3 text-default-font">
              Shodai Agreements
            </span>
            <span className="text-caption font-caption text-subtext-color">
              APP
            </span>
          </div>
          <div className="max-w-[720px]">
            <h1 className="text-heading-1 font-heading-1 text-default-font">
              Agreement console
            </h1>
            <p className="mt-[10px] max-w-[560px] text-heading-3 font-heading-3 text-subtext-color">
              Everything starts with an agreement.
            </p>
          </div>
        </section>

        <section className="shodai-module flex min-h-[520px] items-center justify-center p-[10px]">
          <div className="flex w-full max-w-[448px] flex-col items-stretch justify-center gap-[20px]">
            <div className="flex w-full flex-col items-start gap-[10px]">
              <span className="text-caption font-caption text-subtext-color">
                SIGN IN
              </span>
              <h2 className="text-heading-2 font-heading-2 text-default-font">
                Continue to Shodai
              </h2>
            </div>
          <LoginForm
            submitLabel="SIGN IN"
            initialEmail={emailHint}
            onCodeSent={handleCodeSent}
          />
          </div>
        </section>
        </div>
    </div>
  );
}

export default SignInWithQuote;
