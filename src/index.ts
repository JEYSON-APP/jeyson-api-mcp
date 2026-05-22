#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

// ─── Config ──────────────────────────────────────────────────────────────────
const APP_ID  = process.env.JEYSON_APP_ID  ?? '';
const API_KEY = process.env.JEYSON_API_KEY ?? '';
const BASE_URL = (process.env.JEYSON_BASE_URL ?? '').replace(/\/$/, '');

if (!APP_ID || !API_KEY || !BASE_URL) {
  process.stderr.write(
    '[jeyson-mcp] Missing required env vars: JEYSON_APP_ID, JEYSON_API_KEY, JEYSON_BASE_URL\n'
  );
  process.exit(1);
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────
async function jeysonGet(path: string): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'X-API-KEY': API_KEY, 'Content-Type': 'application/json' },
  });
  const body = await res.json() as Record<string, unknown>;
  if (!res.ok) throw new McpError(ErrorCode.InternalError, (body.message as string) ?? 'Jeyson API error');
  return body;
}

async function jeysonPost(path: string, payload: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'X-API-KEY': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json() as Record<string, unknown>;
  if (!res.ok) throw new McpError(ErrorCode.InternalError, (body.message as string) ?? 'Jeyson API error');
  return body;
}

// ─── Code snippet templates ────────────────────────────────────────────────────
function buildSnippet(
  platform: string,
  schemaCode: string,
  schemaName: string,
  authRequired: boolean,
  apiType: string
): string {
  const endpoint = `${BASE_URL}/api/v1/${APP_ID}/${schemaCode}`;
  const headers = authRequired
    ? `"Authorization": "Bearer <USER_JWT>",\n  "Content-Type": "application/json"`
    : `"X-API-KEY": "${API_KEY}",\n  "Content-Type": "application/json"`;

  switch (platform) {
    case 'swift':
      return `// ${schemaName} — Jeyson API (Swift / URLSession)
import Foundation

func call${toPascalCase(schemaCode)}(prompt: String) async throws -> [String: Any] {
    let url = URL(string: "${endpoint}")!
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    ${authRequired
      ? 'request.setValue("Bearer \\(userJWT)", forHTTPHeaderField: "Authorization")'
      : `request.setValue("${API_KEY}", forHTTPHeaderField: "X-API-KEY")`}
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")

    let body: [String: Any] = ["prompt": prompt${apiType === 'vision' ? ', "image_url": imageURL' : ''}]
    request.httpBody = try JSONSerialization.data(withJSONObject: body)

    let (data, _) = try await URLSession.shared.data(for: request)
    let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]
    return json["data"] as! [String: Any]
}`;

    case 'kotlin':
      return `// ${schemaName} — Jeyson API (Kotlin / OkHttp)
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import org.json.JSONObject

val client = OkHttpClient()

fun call${toPascalCase(schemaCode)}(prompt: String): JSONObject {
    val json = JSONObject().put("prompt", prompt)
    val body = RequestBody.create("application/json".toMediaType(), json.toString())

    val request = Request.Builder()
        .url("${endpoint}")
        ${authRequired
          ? '.addHeader("Authorization", "Bearer $userJWT")'
          : `.addHeader("X-API-KEY", "${API_KEY}")`}
        .addHeader("Content-Type", "application/json")
        .post(body)
        .build()

    client.newCall(request).execute().use { response ->
        val responseBody = response.body!!.string()
        return JSONObject(responseBody).getJSONObject("data")
    }
}`;

    case 'flutter':
      return `// ${schemaName} — Jeyson API (Flutter / Dart)
// Add to pubspec.yaml: http: ^1.2.0
import 'dart:convert';
import 'package:http/http.dart' as http;

Future<Map<String, dynamic>> call${toPascalCase(schemaCode)}(String prompt) async {
  final response = await http.post(
    Uri.parse('${endpoint}'),
    headers: {
      ${authRequired
        ? "'Authorization': 'Bearer \$userJWT',"
        : `'X-API-KEY': '${API_KEY}',`}
      'Content-Type': 'application/json',
    },
    body: jsonEncode({'prompt': prompt}),
  );

  if (response.statusCode != 200) {
    throw Exception('Jeyson API error: \${response.body}');
  }

  final data = jsonDecode(response.body) as Map<String, dynamic>;
  return data['data'] as Map<String, dynamic>;
}`;

    case 'react_native':
      return `// ${schemaName} — Jeyson API (React Native / fetch)
const ENDPOINT = '${endpoint}';
${authRequired ? '' : `const API_KEY = '${API_KEY}';\n`}
export async function call${toPascalCase(schemaCode)}(prompt: string): Promise<Record<string, unknown>> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      ${authRequired
        ? `'Authorization': \`Bearer \${userJWT}\`,`
        : `'X-API-KEY': API_KEY,`}
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message ?? 'Jeyson API error');
  }

  const result = await response.json();
  return result.data;
}`;

    case 'javascript':
    default:
      return `// ${schemaName} — Jeyson API (JavaScript / fetch)
const ENDPOINT = '${endpoint}';
${authRequired ? '' : `const API_KEY = '${API_KEY}';\n`}
export async function call${toPascalCase(schemaCode)}(prompt) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      ${authRequired
        ? `'Authorization': \`Bearer \${userJWT}\`,`
        : `'X-API-KEY': API_KEY,`}
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message ?? 'Jeyson API error');
  }

  const result = await response.json();
  return result.data;
}`;
  }
}

function toPascalCase(str: string): string {
  return str.replace(/(^\w|[-_]\w)/g, (m) => m.replace(/[-_]/, '').toUpperCase());
}

// ─── Tool schemas ──────────────────────────────────────────────────────────────
const listSchemasSchema = z.object({});

const callSchemaSchema = z.object({
  schema_code: z.string().describe('The schema code (slug) to call, e.g. "sentiment_analysis"'),
  prompt: z.string().describe('The user prompt / input text to send to the schema'),
  lang: z.string().optional().describe('Response language ISO code, e.g. "en", "tr" (optional)'),
  user_token: z.string().optional().describe('End-user JWT token (required only for auth-required schemas)'),
});

const getSnippetSchema = z.object({
  schema_code: z.string().describe('The schema code to generate a snippet for'),
  platform: z
    .enum(['swift', 'kotlin', 'flutter', 'react_native', 'javascript'])
    .describe('Target platform: swift | kotlin | flutter | react_native | javascript'),
});

// ─── MCP Server ────────────────────────────────────────────────────────────────
const server = new Server(
  { name: 'jeyson-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'jeyson_list_schemas',
      description:
        'Lists all AI schemas configured for this Jeyson app. Returns schema codes, names, field definitions, API type (chat/vision), whether auth is required, and current token balance. Call this first to understand what APIs are available.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    {
      name: 'jeyson_call_schema',
      description:
        'Calls a Jeyson schema API endpoint with a prompt and returns the structured JSON response. Use this to test a schema or demonstrate its output before generating integration code.',
      inputSchema: {
        type: 'object',
        properties: {
          schema_code: { type: 'string', description: 'The schema code/slug to call' },
          prompt: { type: 'string', description: 'Input prompt text for the schema' },
          lang: { type: 'string', description: 'Response language ISO code (optional)' },
          user_token: { type: 'string', description: 'End-user JWT (only for auth-required schemas)' },
        },
        required: ['schema_code', 'prompt'],
      },
    },
    {
      name: 'jeyson_get_integration_snippet',
      description:
        'Generates a ready-to-use, platform-specific code snippet for integrating a Jeyson schema into a mobile or web app. Includes the real endpoint URL, correct headers, and request/response structure. Supported platforms: swift, kotlin, flutter, react_native, javascript.',
      inputSchema: {
        type: 'object',
        properties: {
          schema_code: { type: 'string', description: 'The schema code to generate a snippet for' },
          platform: {
            type: 'string',
            enum: ['swift', 'kotlin', 'flutter', 'react_native', 'javascript'],
            description: 'Target platform',
          },
        },
        required: ['schema_code', 'platform'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // ── jeyson_list_schemas ──────────────────────────────────────────────────
    if (name === 'jeyson_list_schemas') {
      listSchemasSchema.parse(args ?? {});

      const data = await jeysonGet(`/api/v1/${APP_ID}/schemas`) as {
        app_name: string;
        token_balance: number;
        ai_model: string;
        schemas: Array<{
          code: string;
          name: string;
          description: string;
          api_type: string;
          auth_required: boolean;
          has_agent: boolean;
          fields: Array<{ name: string; type: string }>;
        }>;
      };

      const lines: string[] = [
        `App: ${data.app_name} (ID: ${APP_ID})`,
        `Token Balance: ${data.token_balance.toLocaleString()}`,
        `AI Model: ${data.ai_model}`,
        `Base URL: ${BASE_URL}`,
        '',
        `Schemas (${data.schemas.length}):`,
      ];

      for (const s of data.schemas) {
        lines.push(`\n• ${s.name} [${s.code}]`);
        if (s.description) lines.push(`  Description: ${s.description}`);
        lines.push(`  Type: ${s.api_type} | Auth required: ${s.auth_required} | Has agent: ${s.has_agent}`);
        if (s.fields.length > 0) {
          lines.push(`  Fields: ${s.fields.map((f) => `${f.name}:${f.type}`).join(', ')}`);
        }
        lines.push(`  Endpoint: POST ${BASE_URL}/api/v1/${APP_ID}/${s.code}`);
      }

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }

    // ── jeyson_call_schema ───────────────────────────────────────────────────
    if (name === 'jeyson_call_schema') {
      const { schema_code, prompt, lang, user_token } = callSchemaSchema.parse(args);

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (user_token) {
        headers['Authorization'] = `Bearer ${user_token}`;
      } else {
        headers['X-API-KEY'] = API_KEY;
      }

      const payload: Record<string, unknown> = { prompt };
      if (lang) payload.lang = lang;

      const res = await fetch(`${BASE_URL}/api/v1/${APP_ID}/${schema_code}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      const body = await res.json() as Record<string, unknown>;

      const text = res.ok
        ? `Status: ${res.status}\n\n${JSON.stringify(body, null, 2)}`
        : `Error ${res.status}: ${JSON.stringify(body, null, 2)}`;

      return { content: [{ type: 'text', text }] };
    }

    // ── jeyson_get_integration_snippet ───────────────────────────────────────
    if (name === 'jeyson_get_integration_snippet') {
      const { schema_code, platform } = getSnippetSchema.parse(args);

      // Fetch schema metadata
      const data = await jeysonGet(`/api/v1/${APP_ID}/schemas`) as {
        schemas: Array<{
          code: string;
          name: string;
          api_type: string;
          auth_required: boolean;
          fields: Array<{ name: string; type: string }>;
        }>;
      };

      const schema = data.schemas.find((s) => s.code === schema_code);
      if (!schema) {
        throw new McpError(ErrorCode.InvalidParams, `Schema "${schema_code}" not found. Run jeyson_list_schemas to see available schemas.`);
      }

      const snippet = buildSnippet(
        platform,
        schema.code,
        schema.name,
        schema.auth_required,
        schema.api_type
      );

      const notes: string[] = [
        snippet,
        '',
        '─── Integration notes ───────────────────────────────────────',
        `Schema: ${schema.name} [${schema.code}]`,
        `API type: ${schema.api_type}`,
        `Auth required: ${schema.auth_required}`,
        `Expected response fields: ${schema.fields.map((f) => `${f.name} (${f.type})`).join(', ') || 'see schema definition'}`,
        '',
        schema.auth_required
          ? 'This schema requires end-user authentication. Obtain a user JWT via POST /api/v1/{app_id}/auth/login or /auth/register.'
          : 'This schema is public. The X-API-KEY header is sufficient — no user login required.',
      ];

      return { content: [{ type: 'text', text: notes.join('\n') }] };
    }

    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  } catch (err) {
    if (err instanceof McpError) throw err;
    if (err instanceof z.ZodError) {
      throw new McpError(ErrorCode.InvalidParams, `Invalid arguments: ${err.message}`);
    }
    throw new McpError(ErrorCode.InternalError, String(err));
  }
});

// ─── Start ─────────────────────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('[jeyson-mcp] Server started. Listening on stdio.\n');
}

main().catch((err) => {
  process.stderr.write(`[jeyson-mcp] Fatal: ${err}\n`);
  process.exit(1);
});
