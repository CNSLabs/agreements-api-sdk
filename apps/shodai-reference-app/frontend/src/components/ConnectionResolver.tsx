import React, { useEffect, useState } from 'react';
import { useLogin } from '@/hooks/useLogin';
import Loading from '@/layout/Loading';

interface ConnectionResolverProps {
  children: React.ReactNode;
}

const ConnectionResolver: React.FC<ConnectionResolverProps> = ({ children }) => {
  const { isSdkInitialized } = useLogin();
  const [connectionResolved, setConnectionResolved] = useState(false);

  useEffect(() => {
    if (isSdkInitialized) {
      setConnectionResolved(true);
      return;
    }

    // Safety: never allow infinite spinner if initialization gets stuck.
    const t = window.setTimeout(() => setConnectionResolved(true), 10_000);
    return () => window.clearTimeout(t);
  }, [isSdkInitialized]);

  // Show loading spinner while resolving connection state
  if (!connectionResolved) {
    return (<Loading />);
  }

  return <>{children}</>;
};

export default ConnectionResolver;
