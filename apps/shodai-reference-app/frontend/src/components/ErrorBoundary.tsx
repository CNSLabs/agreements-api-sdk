import * as React from 'react';
import * as Sentry from '@sentry/react';
import ErrorCard from './ErrorCard';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode | ((error: Error) => React.ReactNode);
  onReset?: () => void;
  logError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  title?: string;
  message?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    Sentry.withScope((scope) => {
      scope.setContext('react', {
        componentStack: errorInfo.componentStack,
      });
      Sentry.captureException(error);
    });
    
    this.setState({
      errorInfo
    });

    if (this.props.logError) {
      this.props.logError(error, errorInfo);
    }
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });

    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback(this.state.error as Error);
      }
      
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <ErrorCard
          title={this.props.title || 'Something went wrong'}
          message={this.props.message || 'An error occurred while rendering this component.'}
          details={this.state.error || undefined}
          onRetry={this.handleReset}
          className="max-w-full"
        />
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
