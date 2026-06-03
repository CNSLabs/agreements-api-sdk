import * as React from 'react';
import { Button } from "@/subframe/components/Button";

export interface ErrorCardProps {
  title?: string;
  message?: string;
  details?: string | Error;
  showDetails?: boolean;
  onRetry?: () => void;
  retryText?: string;
  className?: string;
}

const ErrorCard: React.FC<ErrorCardProps> = ({
  title = 'Something went wrong',
  message = 'An error occurred while processing your request.',
  details,
  showDetails: initialShowDetails = false,
  onRetry,
  retryText = 'Try Again',
  className = '',
}) => {
  const [showDetails, setShowDetails] = React.useState(initialShowDetails);

  const formattedDetails = React.useMemo(() => {
    if (!details) return null;

    if (details instanceof Error) {
      return details.stack || details.toString();
    }

    return details;
  }, [details]);

  return (
    <div className={`rounded-lg border-2 border-error-600 bg-error-50 ${className}`}>
      <div className="flex flex-row items-center gap-2 p-4 border-b border-error-200">
        <svg className="h-5 w-5 text-error-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <h3 className="text-heading-3 font-heading-3 text-error-700">{title}</h3>
      </div>

      <div className="p-4">
        <p className="text-body font-body text-default-font mb-4">{message}</p>

        {formattedDetails && (
          <div className="mt-4">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-caption font-caption text-brand-700 hover:text-brand-600 mb-2 underline focus:outline-none"
            >
              {showDetails ? 'Hide technical details' : 'Show technical details'}
            </button>

            {showDetails && (
              <pre className="p-3 bg-neutral-100 rounded text-caption font-caption overflow-x-auto whitespace-pre-wrap max-h-[200px] overflow-y-auto text-default-font font-mono">
                {formattedDetails}
              </pre>
            )}
          </div>
        )}
      </div>

      {onRetry && (
        <div className="p-4 border-t border-error-200 bg-neutral-50">
          <Button
            onClick={onRetry}
            variant="destructive-secondary"
            size="small"
          >
            {retryText}
          </Button>
        </div>
      )}
    </div>
  );
};

export default ErrorCard;
