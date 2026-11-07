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
import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';

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
// Client (browser/mobile) snippets: login/register with the publishable key, then
// Bearer JWT for every other call. The secret key is NEVER embedded in them.
// Server snippets read the secret key from the environment.
const CLIENT_PLATFORMS = ['swift', 'kotlin', 'flutter', 'react_native', 'javascript'] as const;
const SERVER_PLATFORMS = ['node', 'python', 'curl'] as const;
const ALL_PLATFORMS = [...CLIENT_PLATFORMS, ...SERVER_PLATFORMS] as const;

function buildSnippet(
  platform: string,
  schemaCode: string,
  schemaName: string,
  apiType: string
): string {
  const endpoint = `${BASE_URL}/api/v1/${APP_ID}/${schemaCode}`;
  const loginUrl = `${BASE_URL}/api/v1/${APP_ID}/auth/login`;
  const fn = toPascalCase(schemaCode);
  if (apiType === 'vision') return buildVisionSnippet(platform, schemaCode, schemaName, endpoint, loginUrl, fn);

  switch (platform) {
    case 'swift':
      return `// ${schemaName} — Jeyson API (Swift / URLSession)
// Client app: log in with the PUBLISHABLE key (pk_live_), then use the user JWT. Never ship the secret key.
import Foundation

let publishableKey = "<PUBLISHABLE_KEY>" // pk_live_..., needs >= 1 allowed origin on the app

func login(email: String, password: String) async throws -> String {
    var request = URLRequest(url: URL(string: "${loginUrl}")!)
    request.httpMethod = "POST"
    request.setValue(publishableKey, forHTTPHeaderField: "x-publishable-key")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONSerialization.data(withJSONObject: ["email": email, "password": password])
    let (data, _) = try await URLSession.shared.data(for: request)
    let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]
    return (json["data"] as! [String: Any])["token"] as! String
}

func call${fn}(prompt: String, userJWT: String) async throws -> [String: Any] {
    var request = URLRequest(url: URL(string: "${endpoint}")!)
    request.httpMethod = "POST"
    request.setValue("Bearer \\(userJWT)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")

    let body: [String: Any] = ["prompt": prompt]
    request.httpBody = try JSONSerialization.data(withJSONObject: body)

    let (data, _) = try await URLSession.shared.data(for: request)
    let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]
    return json["data"] as! [String: Any]
}`;

    case 'kotlin':
      return `// ${schemaName} — Jeyson API (Kotlin / OkHttp)
// Client app: log in with the PUBLISHABLE key (pk_live_), then use the user JWT. Never ship the secret key.
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import org.json.JSONObject

val client = OkHttpClient()
const val PUBLISHABLE_KEY = "<PUBLISHABLE_KEY>" // pk_live_..., needs >= 1 allowed origin on the app

fun login(email: String, password: String): String {
    val json = JSONObject().put("email", email).put("password", password)
    val request = Request.Builder()
        .url("${loginUrl}")
        .addHeader("x-publishable-key", PUBLISHABLE_KEY)
        .post(RequestBody.create("application/json".toMediaType(), json.toString()))
        .build()
    client.newCall(request).execute().use { response ->
        return JSONObject(response.body!!.string()).getJSONObject("data").getString("token")
    }
}

fun call${fn}(prompt: String, userJWT: String): JSONObject {
    val json = JSONObject().put("prompt", prompt)
    val body = RequestBody.create("application/json".toMediaType(), json.toString())

    val request = Request.Builder()
        .url("${endpoint}")
        .addHeader("Authorization", "Bearer $userJWT")
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
// Client app: log in with the PUBLISHABLE key (pk_live_), then use the user JWT. Never ship the secret key.
// Add to pubspec.yaml: http: ^1.2.0
import 'dart:convert';
import 'package:http/http.dart' as http;

const publishableKey = '<PUBLISHABLE_KEY>'; // pk_live_..., needs >= 1 allowed origin on the app

Future<String> login(String email, String password) async {
  final response = await http.post(
    Uri.parse('${loginUrl}'),
    headers: {'x-publishable-key': publishableKey, 'Content-Type': 'application/json'},
    body: jsonEncode({'email': email, 'password': password}),
  );
  if (response.statusCode != 200) throw Exception('Login failed: \${response.body}');
  return (jsonDecode(response.body)['data']['token']) as String;
}

Future<Map<String, dynamic>> call${fn}(String prompt, String userJWT) async {
  final response = await http.post(
    Uri.parse('${endpoint}'),
    headers: {
      'Authorization': 'Bearer \$userJWT',
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
// Client app: log in with the PUBLISHABLE key (pk_live_), then use the user JWT. Never ship the secret key.
const PUBLISHABLE_KEY = '<PUBLISHABLE_KEY>'; // pk_live_..., needs >= 1 allowed origin on the app
const LOGIN_URL = '${loginUrl}';
const ENDPOINT = '${endpoint}';

export async function login(email: string, password: string): Promise<string> {
  const response = await fetch(LOGIN_URL, {
    method: 'POST',
    headers: { 'x-publishable-key': PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error((await response.json()).message ?? 'Login failed');
  return (await response.json()).data.token;
}

export async function call${fn}(prompt: string, userJWT: string): Promise<Record<string, unknown>> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': \`Bearer \${userJWT}\`,
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

    case 'node':
      return `// ${schemaName} — Jeyson API (Node.js, server-side only)
// Server-side only: the secret key bypasses origin checks. Never expose it to browsers or mobile apps.
const ENDPOINT = '${endpoint}';
const API_KEY = process.env.JEYSON_API_KEY; // sk_live_...

export async function call${fn}(prompt) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'X-API-KEY': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message ?? 'Jeyson API error');
  }

  const result = await response.json();
  return result.data;
}`;

    case 'python':
      return `# ${schemaName} — Jeyson API (Python, server-side only)
# Server-side only: the secret key bypasses origin checks. Never expose it to browsers or mobile apps.
import os
import requests

ENDPOINT = "${endpoint}"
API_KEY = os.environ["JEYSON_API_KEY"]  # sk_live_...

def call_${schemaCode.replace(/[^a-zA-Z0-9_]/g, '_')}(prompt: str) -> dict:
    res = requests.post(
        ENDPOINT,
        headers={"X-API-KEY": API_KEY, "Content-Type": "application/json"},
        json={"prompt": prompt},
        timeout=60,
    )
    res.raise_for_status()
    return res.json()["data"]`;

    case 'curl':
      return `# ${schemaName} — Jeyson API (curl, server-side only)
# Server-side only: keep the secret key in an env var, never in client code.
curl -X POST "${endpoint}" \\
  -H "X-API-KEY: $JEYSON_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"prompt": "Your input here"}'`;

    case 'javascript':
    default:
      return `// ${schemaName} — Jeyson API (JavaScript / browser fetch)
// Browser app: log in with the PUBLISHABLE key (pk_live_), then use the user JWT. Never ship the secret key.
// The publishable key requires >= 1 allowed origin on the app (https://app.com or app.com).
const PUBLISHABLE_KEY = '<PUBLISHABLE_KEY>';
const LOGIN_URL = '${loginUrl}';
const ENDPOINT = '${endpoint}';

export async function login(email, password) {
  const response = await fetch(LOGIN_URL, {
    method: 'POST',
    headers: { 'x-publishable-key': PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error((await response.json()).message ?? 'Login failed');
  return (await response.json()).data.token;
}

export async function call${fn}(prompt, userJWT) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': \`Bearer \${userJWT}\`,
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

// Vision schemas: multipart/form-data with an "image" file (jpeg/png/webp/gif, <= 5MB) and "prompt".
function buildVisionSnippet(
  platform: string,
  schemaCode: string,
  schemaName: string,
  endpoint: string,
  loginUrl: string,
  fn: string
): string {
  const clientNote = 'Client app: log in with the PUBLISHABLE key (pk_live_) via the login() helper from the chat snippet, then use the user JWT. Never ship the secret key.';
  switch (platform) {
    case 'swift':
      return `// ${schemaName} — Jeyson API vision (Swift / URLSession, multipart)
// ${clientNote}
// Login URL: ${loginUrl}
import Foundation

func call${fn}(imageData: Data, prompt: String, userJWT: String) async throws -> [String: Any] {
    let boundary = UUID().uuidString
    var request = URLRequest(url: URL(string: "${endpoint}")!)
    request.httpMethod = "POST"
    request.setValue("Bearer \\(userJWT)", forHTTPHeaderField: "Authorization")
    request.setValue("multipart/form-data; boundary=\\(boundary)", forHTTPHeaderField: "Content-Type")

    var body = Data()
    body.append("--\\(boundary)\\r\\nContent-Disposition: form-data; name=\\"prompt\\"\\r\\n\\r\\n\\(prompt)\\r\\n".data(using: .utf8)!)
    body.append("--\\(boundary)\\r\\nContent-Disposition: form-data; name=\\"image\\"; filename=\\"image.jpg\\"\\r\\nContent-Type: image/jpeg\\r\\n\\r\\n".data(using: .utf8)!)
    body.append(imageData)
    body.append("\\r\\n--\\(boundary)--\\r\\n".data(using: .utf8)!)
    request.httpBody = body

    let (data, _) = try await URLSession.shared.data(for: request)
    let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]
    return json["data"] as! [String: Any]
}`;

    case 'kotlin':
      return `// ${schemaName} — Jeyson API vision (Kotlin / OkHttp, multipart)
// ${clientNote}
// Login URL: ${loginUrl}
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.asRequestBody
import org.json.JSONObject
import java.io.File

val client = OkHttpClient()

fun call${fn}(image: File, prompt: String, userJWT: String): JSONObject {
    val body = MultipartBody.Builder().setType(MultipartBody.FORM)
        .addFormDataPart("prompt", prompt)
        .addFormDataPart("image", image.name, image.asRequestBody("image/jpeg".toMediaType()))
        .build()
    val request = Request.Builder()
        .url("${endpoint}")
        .addHeader("Authorization", "Bearer $userJWT")
        .post(body)
        .build()
    client.newCall(request).execute().use { response ->
        return JSONObject(response.body!!.string()).getJSONObject("data")
    }
}`;

    case 'flutter':
      return `// ${schemaName} — Jeyson API vision (Flutter / Dart, multipart)
// ${clientNote}
// Login URL: ${loginUrl}
// Add to pubspec.yaml: http: ^1.2.0
import 'dart:convert';
import 'package:http/http.dart' as http;

Future<Map<String, dynamic>> call${fn}(String imagePath, String prompt, String userJWT) async {
  final request = http.MultipartRequest('POST', Uri.parse('${endpoint}'))
    ..headers['Authorization'] = 'Bearer \$userJWT'
    ..fields['prompt'] = prompt
    ..files.add(await http.MultipartFile.fromPath('image', imagePath));
  final response = await http.Response.fromStream(await request.send());
  if (response.statusCode != 200) throw Exception('Jeyson API error: \${response.body}');
  return (jsonDecode(response.body) as Map<String, dynamic>)['data'] as Map<String, dynamic>;
}`;

    case 'react_native':
      return `// ${schemaName} — Jeyson API vision (React Native / fetch, multipart)
// ${clientNote}
// Login URL: ${loginUrl}
const ENDPOINT = '${endpoint}';

export async function call${fn}(imageUri: string, prompt: string, userJWT: string): Promise<Record<string, unknown>> {
  const form = new FormData();
  form.append('prompt', prompt);
  form.append('image', { uri: imageUri, name: 'image.jpg', type: 'image/jpeg' } as unknown as Blob);
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Authorization': \`Bearer \${userJWT}\` }, // let fetch set the multipart boundary
    body: form,
  });
  if (!response.ok) throw new Error((await response.json()).message ?? 'Jeyson API error');
  return (await response.json()).data;
}`;

    case 'node':
      return `// ${schemaName} — Jeyson API vision (Node.js 18+, server-side only, multipart)
// Server-side only: the secret key bypasses origin checks. Never expose it to browsers or mobile apps.
import { readFile } from 'node:fs/promises';

const ENDPOINT = '${endpoint}';
const API_KEY = process.env.JEYSON_API_KEY; // sk_live_...

export async function call${fn}(imagePath, prompt) {
  const form = new FormData();
  form.append('prompt', prompt);
  form.append('image', new Blob([await readFile(imagePath)], { type: 'image/jpeg' }), 'image.jpg');
  const response = await fetch(ENDPOINT, { method: 'POST', headers: { 'X-API-KEY': API_KEY }, body: form });
  if (!response.ok) throw new Error((await response.json()).message ?? 'Jeyson API error');
  return (await response.json()).data;
}`;

    case 'python':
      return `# ${schemaName} — Jeyson API vision (Python, server-side only, multipart)
# Server-side only: the secret key bypasses origin checks. Never expose it to browsers or mobile apps.
import os
import requests

ENDPOINT = "${endpoint}"
API_KEY = os.environ["JEYSON_API_KEY"]  # sk_live_...

def call_${schemaCode.replace(/[^a-zA-Z0-9_]/g, '_')}(image_path: str, prompt: str) -> dict:
    with open(image_path, "rb") as f:
        res = requests.post(
            ENDPOINT,
            headers={"X-API-KEY": API_KEY},
            files={"image": ("image.jpg", f, "image/jpeg")},
            data={"prompt": prompt},
            timeout=60,
        )
    res.raise_for_status()
    return res.json()["data"]`;

    case 'curl':
      return `# ${schemaName} — Jeyson API vision (curl, server-side only, multipart)
# Server-side only: keep the secret key in an env var, never in client code.
curl -X POST "${endpoint}" \\
  -H "X-API-KEY: $JEYSON_API_KEY" \\
  -F "prompt=Describe this image" \\
  -F "image=@./image.jpg;type=image/jpeg"`;

    case 'javascript':
    default:
      return `// ${schemaName} — Jeyson API vision (JavaScript / browser fetch, multipart)
// ${clientNote}
// Login URL: ${loginUrl}
const ENDPOINT = '${endpoint}';

export async function call${fn}(file, prompt, userJWT) { // file: File from <input type="file">
  const form = new FormData();
  form.append('prompt', prompt);
  form.append('image', file);
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Authorization': \`Bearer \${userJWT}\` }, // let fetch set the multipart boundary
    body: form,
  });
  if (!response.ok) throw new Error((await response.json()).message ?? 'Jeyson API error');
  return (await response.json()).data;
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
  target_language: z.string().optional().describe('Response language: ISO-like code (e.g. "en", "pt-BR") or language name up to 32 letters (optional)'),
  user_token: z.string().optional().describe('End-user JWT token (required only for auth-required schemas)'),
  image_path: z.string().optional().describe('Local image file path (jpeg/png/webp/gif, <= 5MB). Required for vision schemas.'),
});

const IMAGE_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
};

const getSnippetSchema = z.object({
  schema_code: z.string().describe('The schema code to generate a snippet for'),
  platform: z
    .enum(ALL_PLATFORMS)
    .describe('Target platform. Client (publishable key login + Bearer JWT): swift | kotlin | flutter | react_native | javascript. Server-side (secret key from env): node | python | curl'),
});

// ─── MCP Server ────────────────────────────────────────────────────────────────
const server = new Server(
  { name: 'jeyson-mcp', version: '1.2.0' },
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
        'Calls a Jeyson schema API endpoint with a prompt and returns the structured JSON response. Schemas require an end-user token (user_token) unless auth_required is explicitly false; without user_token the secret API key is used (this MCP runs server-side; the secret key is never for browser/mobile apps). Prompt max 8000 chars. Use this to test a schema or demonstrate its output before generating integration code.',
      inputSchema: {
        type: 'object',
        properties: {
          schema_code: { type: 'string', description: 'The schema code/slug to call' },
          prompt: { type: 'string', description: 'Input prompt text for the schema' },
          target_language: { type: 'string', description: 'Response language: ISO-like code (e.g. "en", "pt-BR") or language name <= 32 letters (optional)' },
          user_token: { type: 'string', description: 'End-user JWT (only for auth-required schemas)' },
          image_path: { type: 'string', description: 'Local image path (jpeg/png/webp/gif, <= 5MB). Required for vision schemas; sent as multipart/form-data.' },
        },
        required: ['schema_code', 'prompt'],
      },
    },
    {
      name: 'jeyson_get_integration_snippet',
      description:
        'Generates a ready-to-use, platform-specific code snippet for integrating a Jeyson schema. Client platforms (swift, kotlin, flutter, react_native, javascript) log in with the browser-safe publishable key (x-publishable-key, auth routes only) and then call the schema with the end-user Bearer JWT; they never contain the secret key. Server platforms (node, python, curl) use the secret X-API-KEY read from an env var (server-side only).',
      inputSchema: {
        type: 'object',
        properties: {
          schema_code: { type: 'string', description: 'The schema code to generate a snippet for' },
          platform: {
            type: 'string',
            enum: [...ALL_PLATFORMS],
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
      const { schema_code, prompt, target_language, user_token, image_path } = callSchemaSchema.parse(args);

      const headers: Record<string, string> = {};
      if (user_token) {
        headers['Authorization'] = `Bearer ${user_token}`;
      } else {
        headers['X-API-KEY'] = API_KEY;
      }

      let requestBody: string | FormData;
      if (image_path) {
        // Vision schema: multipart/form-data (fetch sets the boundary header)
        const ext = extname(image_path).slice(1).toLowerCase();
        const mime = IMAGE_MIME[ext];
        if (!mime) throw new McpError(ErrorCode.InvalidParams, 'image_path must be a jpeg, png, webp or gif file.');
        const file = await readFile(image_path).catch(() => {
          throw new McpError(ErrorCode.InvalidParams, `Cannot read image file: ${image_path}`);
        });
        if (file.byteLength > 5 * 1024 * 1024) throw new McpError(ErrorCode.InvalidParams, 'Image exceeds 5MB.');
        const form = new FormData();
        form.append('prompt', prompt);
        if (target_language) form.append('target_language', target_language);
        form.append('image', new Blob([file], { type: mime }), basename(image_path));
        requestBody = form;
      } else {
        headers['Content-Type'] = 'application/json';
        const payload: Record<string, unknown> = { prompt };
        if (target_language) payload.target_language = target_language;
        requestBody = JSON.stringify(payload);
      }

      const res = await fetch(`${BASE_URL}/api/v1/${APP_ID}/${schema_code}`, {
        method: 'POST',
        headers,
        body: requestBody,
      });

      const body = await res.json().catch(() => ({ message: `Non-JSON response (HTTP ${res.status})` })) as Record<string, unknown>;

      const hints: Record<number, string> = {
        400: image_path ? 'Bad request.' : 'If this is a vision schema, pass image_path (sent as multipart/form-data).',
        402: 'Insufficient token balance (QUOTA_EXCEEDED). Top up tokens in the dashboard.',
        413: 'Payload too large (PAYLOAD_TOO_LARGE). Limits: prompt 8000 chars, systemInstruction 2000, image 5MB, body 64KB.',
        429: 'Rate limit exceeded (RATE_LIMIT_EXCEEDED). Limits: 100 req/min per IP per app, 600/min per app. Retry later.',
      };
      const text = res.ok
        ? `Status: ${res.status}\n\n${JSON.stringify(body, null, 2)}`
        : `Error ${res.status}${hints[res.status] ? ` - ${hints[res.status]}` : ''}: ${JSON.stringify(body, null, 2)}`;

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
        SERVER_PLATFORMS.includes(platform as (typeof SERVER_PLATFORMS)[number])
          ? 'Server-side snippet: uses the secret X-API-KEY (sk_live_) from the JEYSON_API_KEY env var. It bypasses origin checks and works on all routes; never ship it in browser/mobile code.'
          : 'Client snippet: log in via POST /auth/login (or /auth/register, /auth/oauth) with the publishable x-publishable-key (pk_live_), then send the returned JWT as Authorization: Bearer on schema/chat/vision/db calls. The publishable key works only on /auth/{login,register,oauth} and is rejected (403) unless the app has at least one allowed origin (https://app.com or app.com, exact match). Never embed the secret key in client apps.',
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
