import React from 'react';
import { Navigate, useLocation } from 'react-router';
import { useLogin } from '@/hooks/useLogin';
import { useAuthInit } from "@/components/AuthInitProvider";
import Loading from "@/layout/Loading";
import ErrorCard from "@/components/ErrorCard";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * Protected route wrapper that redirects to login if user is not connected.
 * Preserves the intended destination via ?returnTo= so Login can redirect back.
 */
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isConnected } = useLogin();
  const { status, error, retry } = useAuthInit();
  const location = useLocation();
  const wasReadyRef = React.useRef(false);

  if (status === "ready") {
    wasReadyRef.current = true;
  }

  if (!isConnected) {
    const returnTo = location.pathname + location.search;
    const loginPath = returnTo && returnTo !== "/"
      ? `/login?returnTo=${encodeURIComponent(returnTo)}`
      : "/login";
    return <Navigate to={loginPath} replace />;
  }

  // Ensure we have an auth-api user record (signup/signin) before allowing access.
  if (status === "idle" || status === "loading") {
    // If we've already been ready once, keep the route subtree mounted to avoid
    // racy unmount/remount cycles (e.g. transient address/token refresh).
    if (wasReadyRef.current) return <>{children}</>;
    return <Loading />;
  }

  if (status === "error") {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-default-background px-6 py-12">
        <div className="w-full max-w-xl">
          <ErrorCard
            title="Authentication failed"
            message="We couldn’t authenticate with the Auth API. Please try again."
            details={error}
            showDetails={false}
            onRetry={retry}
            retryText="Retry"
          />
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;

