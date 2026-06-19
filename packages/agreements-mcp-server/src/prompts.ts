import { readFileSync } from 'node:fs';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

function readPrompt(): string {
  return readFileSync(new URL('../content/author-agreement-prompt.md', import.meta.url), 'utf8');
}

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'author_agreement',
    {
      title: 'Author an agreement from a business description',
      description:
        'End-to-end authoring workflow: learn the agreement JSON shape from the example resources, draft the document, then iterate with validate_agreement and preflight_deployment until it is deployment-ready.',
      argsSchema: {
        businessDescription: z
          .string()
          .describe('Plain-language description of the business workflow the agreement should model (parties, obligations, payments, milestones).'),
      },
    },
    ({ businessDescription }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `${readPrompt()}\n\nBusiness workflow to model:\n${businessDescription}`,
          },
        },
      ],
    }),
  );
}
