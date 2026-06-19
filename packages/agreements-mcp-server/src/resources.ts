import { readFileSync } from 'node:fs';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Static reference content bundled with the package (`content/` directory).
 * Sourced from docs.shodai.network Markdown exports; refresh when the docs change.
 */
function readContent(filename: string): string {
  return readFileSync(new URL(`../content/${filename}`, import.meta.url), 'utf8');
}

type StaticResource = {
  name: string;
  uri: string;
  title: string;
  description: string;
  mimeType: string;
  filename: string;
};

export const AGREEMENTS_MCP_RESOURCES: readonly StaticResource[] = [
  {
    name: 'simple-example-agreement',
    uri: 'agreements://examples/simple-agreement.json',
    title: 'Simple example agreement (MOU)',
    description:
      'The smallest complete, deployable agreement JSON artifact (a two-party memorandum of understanding). Use it to learn the authoritative document shape: metadata, variables with participant subtypes, markdown content, and a linear execution lifecycle.',
    mimeType: 'application/json',
    filename: 'simple-agreement.json',
  },
  {
    name: 'complex-example-agreement',
    uri: 'agreements://examples/complex-agreement.json',
    title: 'Complex example agreement',
    description:
      'A richer complete agreement JSON example with more states, event types, metadata, and branching behavior. Use it as the reference when authoring non-trivial lifecycles.',
    mimeType: 'application/json',
    filename: 'complex-agreement.json',
  },
  {
    name: 'authoring-guide',
    uri: 'agreements://docs/author-agreement-json.md',
    title: 'Author Agreement JSON guide',
    description:
      'How to make good authoring decisions when turning a real business workflow into agreement JSON: content, variables, participants, states, inputs, and transitions.',
    mimeType: 'text/markdown',
    filename: 'authoring-guide.md',
  },
  {
    name: 'docs-index',
    uri: 'agreements://docs/index.md',
    title: 'Shodai documentation index (llms.txt)',
    description:
      'Canonical index of all Agreements API documentation pages with Markdown export URLs. Fetch the linked pages for deployment, signing, and troubleshooting workflows not covered by this server.',
    mimeType: 'text/markdown',
    filename: 'docs-index.md',
  },
] as const;

export function registerResources(server: McpServer): void {
  for (const resource of AGREEMENTS_MCP_RESOURCES) {
    server.registerResource(
      resource.name,
      resource.uri,
      {
        title: resource.title,
        description: resource.description,
        mimeType: resource.mimeType,
      },
      async (uri) => ({
        contents: [
          {
            uri: uri.href,
            mimeType: resource.mimeType,
            text: readContent(resource.filename),
          },
        ],
      }),
    );
  }
}
