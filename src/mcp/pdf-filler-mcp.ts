// src/mcp/pdf-filler-mcp.ts
/* MCP stdio server exposing deterministic PDF tools
   Tools:
     - list_fields({ pdfPath, password? })
     - fill_form({ pdfPath, data, outPath, options? })
     - extract_text({ pdfPath, password? })
     - extract_to_csv({ pdfPath, outPath, delimiter?, password? })
     - compare_forms({ leftPath, rightPath, leftPassword?, rightPassword? })
*/

import { z } from 'zod';

// NOTE: Depending on SDK version, these import paths may be:
//   '@modelcontextprotocol/sdk/server'  and  '@modelcontextprotocol/sdk/stdio'
// If your build complains, change to '/server/index.js' and '/stdio.js' variants.
// @ts-ignore - allow deep import path for ESM runtime; types present under dist/esm
import { Server } from '@modelcontextprotocol/sdk/dist/esm/server/index.js';
// @ts-ignore - allow deep import path for ESM runtime; types present under dist/esm
import { StdioServerTransport } from '@modelcontextprotocol/sdk/dist/esm/server/stdio.js';

import {
  listFields,
  fillForm,
  extractText,
  extractToCSV,
  compareForms
} from '../pdf-tools';

async function main() {
  const transport = new StdioServerTransport();
  const instructions = `
You provide deterministic, local PDF operations via tools. Use absolute paths only.

Tools:
- list_fields({ pdfPath, password? }): Returns fields with name, type, value, options.
- fill_form({ pdfPath, data, outPath, options? }): Fills a PDF and writes it to outPath.
- extract_text({ pdfPath, password? }): Returns { pages, fullText, info, metadata, version }. Uses pdf.js for high-quality text extraction, falling back to a secondary method if needed.
- extract_to_csv({ pdfPath, outPath, delimiter?, password? }): Writes one-row CSV of current field values.
- compare_forms({ leftPath, rightPath, leftPassword?, rightPassword? }): Returns differences by field.

Guidance:
- Prefer calling these tools for PDF analysis/extraction/validation rather than inferring from raw prompts.
- Return only the JSON content from tool results; avoid extra narration.
- If no extractable text, return an empty fullText and indicate that OCR is not enabled.
`;
  const server = new Server(
    { name: 'pdf-filler', version: '1.0.0' },
    { capabilities: { tools: {} }, instructions },
    transport
  );

  // list_fields
  server.tool(
    'list_fields',
    {
      description: 'List AcroForm fields with types, values, options',
      inputSchema: z.object({
        pdfPath: z.string().describe('Absolute path to the PDF file'),
        password: z.string().optional().nullable()
      })
    },
    async ({ input }: { input: any }) => {
      const fields = await listFields(input.pdfPath, input.password ?? undefined);
      return {
        content: [{ type: 'json', json: { fields } }]
      };
    }
  );

  // fill_form
  server.tool(
    'fill_form',
    {
      description: 'Fill form fields in a PDF and save to outPath',
      inputSchema: z.object({
        pdfPath: z.string().describe('Absolute path to the template PDF'),
        data: z.record(z.union([z.string(), z.number(), z.boolean()])),
        outPath: z.string().describe('Absolute path for the output PDF'),
        options: z
          .object({
            flatten: z.boolean().optional(),
            password: z.string().optional()
          })
          .optional()
          .nullable()
      })
    },
    async ({ input }: { input: any }) => {
      const result = await fillForm(input.pdfPath, input.data, input.outPath, input.options ?? undefined);
      return { content: [{ type: 'json', json: result }] };
    }
  );

  // extract_text
  server.tool(
    'extract_text',
    {
      description: 'Extract full text content and metadata from a PDF',
      inputSchema: z.object({
        pdfPath: z.string(),
        password: z.string().optional().nullable()
      })
    },
    async ({ input }: { input: any }) => {
      const result = await extractText(input.pdfPath, input.password ?? undefined);
      return { content: [{ type: 'json', json: result }] };
    }
  );

  // extract_to_csv
  server.tool(
    'extract_to_csv',
    {
      description: 'Export current field values to a one-row CSV',
      inputSchema: z.object({
        pdfPath: z.string(),
        outPath: z.string(),
        delimiter: z.string().optional(),
        password: z.string().optional()
      })
    },
    async ({ input }: { input: any }) => {
      const result = await extractToCSV(input.pdfPath, input.outPath, {
        delimiter: input.delimiter,
        password: input.password
      });
      return { content: [{ type: 'json', json: result }] };
    }
  );

  // compare_forms
  server.tool(
    'compare_forms',
    {
      description: 'Compare two PDFs by AcroForm values and report differences',
      inputSchema: z.object({
        leftPath: z.string(),
        rightPath: z.string(),
        leftPassword: z.string().optional(),
        rightPassword: z.string().optional()
      })
    },
    async ({ input }: { input: any }) => {
      const result = await compareForms(input.leftPath, input.rightPath, {
        leftPassword: input.leftPassword,
        rightPassword: input.rightPassword
      });
      return { content: [{ type: 'json', json: result }] };
    }
  );

  await server.connect();
}

main().catch((err) => {
  // Emit a structured MCP error payload if needed; for now, log and exit.
  console.error('[pdf-filler-mcp] fatal:', err?.stack || err);
  process.exit(1);
});
