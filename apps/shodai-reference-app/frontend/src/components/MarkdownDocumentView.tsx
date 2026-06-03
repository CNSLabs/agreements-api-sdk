import * as React from 'react';
import { unified } from 'unified';
import remarkStringify from 'remark-stringify';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import type { Root } from 'mdast';
import type { Components } from 'react-markdown';
import { Controller } from 'react-hook-form';
import VariableInput, { createValidationRules, DocumentVariable } from './VariableInput';
import ErrorBoundary from './ErrorBoundary';
import ErrorCard from './ErrorCard';
import { MarkdownRenderer } from './MarkdownRenderer';
import { resolveIssuerAddresses } from '@/utils/agreementsUi';

interface SpanProps {
  className?: string;
  children?: React.ReactNode;
  'data-name'?: string;
}

export interface MarkdownDocumentViewProps {
  control: any;
  content: {
    type: 'md' | 'mdast';
    data: string | Root;
  };
  variables?: Record<string, DocumentVariable>;
  errors?: Record<string, any>;
  nextActions?: Array<{
    conditions: Array<{
      input: any;
    }>;
  }> | any[];
  userAddress?: string;
  initialParams?: Record<string, string>;
  isInitializing?: boolean;
}

const MarkdownErrorFallback = ({ error }: { error: Error }) => (
  <ErrorCard
    title="Error Rendering Document"
    message="There was a problem displaying this content. Please check that all variables are defined correctly."
    details={error}
    className="w-full"
  />
);


const MarkdownDocumentView: React.FC<MarkdownDocumentViewProps> = ({
  control,
  content,
  variables = {},
  errors = {},
  nextActions = [],
  userAddress,
  initialParams = {},
  isInitializing = false
}) => {
  const isFieldEnabled = React.useCallback((variableName: string) => {
    try {
      if (isInitializing) {
        return Object.keys(initialParams || {}).includes(variableName);
      }

      if (!nextActions || !Array.isArray(nextActions) || nextActions.length === 0 || !userAddress) {
        return false;
      }

      return nextActions.some(action => {
        if (!action || !action.conditions || !Array.isArray(action.conditions)) {
          return false;
        }

        return action.conditions.some((condition: { input: any }) => {
          const input = condition?.input;

          if (!input) {
            return false;
          }

          const isFieldInInput = Object.keys(input.data || {}).includes(variableName);
          const isCorrectIssuer = !!userAddress &&
            resolveIssuerAddresses(input.issuer).some(
              (issuerAddress) => issuerAddress.toLowerCase() === userAddress.toLowerCase(),
            );

          return isFieldInInput && isCorrectIssuer;
        }) || false;
      });
    } catch (error) {
      console.error("Error in isFieldEnabled:", error);
      return false;
    }
  }, [nextActions, userAddress, isInitializing, initialParams]);

  const components = React.useMemo<Components>(() => ({
    h1: ({ children }) => <h1 className="text-heading-1 font-heading-1 mb-4">{children}</h1>,
    h2: ({ children }) => <h2 className="text-heading-2 font-heading-2 mb-3">{children}</h2>,
    h3: ({ children }) => <h3 className="text-heading-3 font-heading-3 mb-2">{children}</h3>,
    p: ({ children, ...props }) => <p className="text-body font-body mb-4" {...props}>{children}</p>,
    ul: ({ children }) => <ul className="mb-4 list-disc list-inside">{children}</ul>,
    ol: ({ children }) => <ol className="mb-4 list-decimal list-inside">{children}</ol>,
    li: ({ children }) => <li className="text-body font-body">{children}</li>,
    blockquote: ({ children }) => (
      <blockquote className="border-l-4 border-neutral-300 pl-4 italic mb-4">{children}</blockquote>
    ),
    code: ({ children }) => (
      <code className="bg-neutral-100 rounded px-2 py-1 font-mono text-caption">{children}</code>
    ),
    pre: ({ children }) => (
      <pre className="bg-neutral-100 rounded p-4 mb-4 overflow-x-auto">{children}</pre>
    ),
    a: ({ children, href }) => <a href={href} className="text-brand-600 hover:underline">{children}</a>,
    strong: ({ children }) => <strong className="font-bold">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    u: ({ children }) => <u className="underline">{children}</u>,
    div: ({ className, children, ...props }: any) => {
      if (className === 'variable-input' && props['data-name']) {
        const variableName = props['data-name'];
        const variable = variables[variableName];
        const enabled = isFieldEnabled(variableName);

        if (variable) {
          return (
            <Controller
              control={control}
              name={variableName}
              rules={createValidationRules(variable)}
              render={({ field: { onChange, value, onBlur } }) => (
                <VariableInput
                  variable={variable}
                  value={value || ''}
                  onChange={onChange}
                  onBlur={onBlur}
                  error={errors[variableName]}
                  disabled={!enabled}
                />
              )}
            />
          );
        }
        return <div className={className}>Unknown variable: {variableName}</div>;
      }
      return <div className={className}>{children}</div>;
    },
    span: ({ className, children, ...props }: SpanProps) => {
      if (className === 'variable-input' && props['data-name']) {
        const variableName = props['data-name'];
        const variable = variables[variableName];
        const enabled = isFieldEnabled(variableName);
        const isMarkdown = variable?.subType === 'markdown';

        if (variable) {
          return (
            <Controller
              control={control}
              name={variableName}
              rules={createValidationRules(variable)}
              render={({ field: { onChange, value, onBlur } }) => {
                if (isMarkdown && value && !enabled) {
                  return <MarkdownRenderer content={value} className="my-2" />;
                }
                return (
                  <VariableInput
                    variable={variable}
                    value={value || ''}
                    onChange={onChange}
                    onBlur={onBlur}
                    error={errors[variableName]}
                    disabled={!enabled}
                  />
                );
              }}
            />
          );
        }
        return <span className={className}>Unknown variable: {variableName}</span>;
      }
      return <span className={className}>{children}</span>;
    }
  }), [variables, control, errors, isFieldEnabled]);

  const renderContent = React.useCallback(() => {
    let markdownContent: string;

    if (content.type === 'md') {
      markdownContent = content.data as string;
    } else if (content.type === 'mdast') {
      const processor = unified()
        .use(remarkStringify as any);

      const result = processor.stringify(content.data as Root);
      markdownContent = typeof result === 'string' ? result : String(result);
    } else {
      return null;
    }

    const processedContent = markdownContent.replace(
      /\$\{variables\.([^}]+)\}/g,
      (match, variablePath) => {
        try {
          const parts = variablePath.split('.');
          const variableName = parts[0];

          if (!variableName || !variables) {
            console.warn(`Missing variable name or variables object: ${match}`);
            return match;
          }

          if (parts.length > 1) {
            const variable = variables[variableName];
            if (!variable) {
              console.warn(`Variable not found: ${variableName}`);
              return match;
            }

            let nestedValue: any = variable;
            for (let i = 1; i < parts.length; i++) {
              if (nestedValue === null || nestedValue === undefined) {
                console.warn(`Nested property path broken at: ${parts.slice(0, i).join('.')}`);
                return match;
              }
              nestedValue = nestedValue[parts[i]];
            }
            return nestedValue !== undefined ? String(nestedValue) : match;
          }

          return `<div class="variable-input" data-name="${variableName}"></div>`;
        } catch (error) {
          console.error(`Error processing variable: ${match}`, error);
          return match;
        }
      }
    );

    return (
      <article className="prose max-w-none overflow-x-auto [&_table]:block [&_table]:overflow-x-auto [&_pre]:overflow-x-auto">
        <ErrorBoundary
          fallback={(error: Error) => <MarkdownErrorFallback error={error} />}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={components}
            rehypePlugins={[rehypeRaw]}
          >
            {processedContent}
          </ReactMarkdown>
        </ErrorBoundary>
      </article>
    );
  }, [content, variables, components]);

  return (
    <>
      {renderContent()}
    </>
  );
};

export default MarkdownDocumentView;
