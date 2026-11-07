# @jeyson-app/jeyson-api-mcp

An MCP (Model Context Protocol) server that connects AI coding assistants — Cursor, Claude Desktop, VS Code Copilot, Windsurf — directly to your Jeyson API workspace. Your AI assistant can list your schemas, call them live, and generate ready-to-paste integration code for any mobile or web platform.

## Tools

| Tool | Description |
|---|---|
| `jeyson_list_schemas` | Lists all schemas in your app with field definitions, endpoint URLs, auth requirements, and token balance |
| `jeyson_call_schema` | Calls a schema endpoint live and returns the structured JSON response |
| `jeyson_get_integration_snippet` | Generates platform-specific integration code for a schema |

Supported platforms for `jeyson_get_integration_snippet`:
- Client (browser/mobile): `swift` · `kotlin` · `flutter` · `react_native` · `javascript`. Snippets log in with the publishable key (`x-publishable-key`), then call schemas with the end-user Bearer JWT. They never contain the secret key.
- Server-side: `node` · `python` · `curl`. Snippets read the secret `X-API-KEY` from the `JEYSON_API_KEY` env var.

## Setup

### 1. Find your credentials

Go to your [Jeyson Dashboard](https://your-jeyson-domain.com/dashboard) → **Settings** → copy your **App ID** and **API Key**.

### 2. Configure your AI tool

#### VS Code (GitHub Copilot)

Create `.vscode/mcp.json` in your project root:

```json
{
  "servers": {
    "jeyson": {
      "type": "stdio",
      "command": "npx",
      "args": ["--yes", "--package", "@jeyson-app/jeyson-api-mcp", "jeyson-api-mcp"],
      "env": {
        "JEYSON_APP_ID": "YOUR_APP_ID",
        "JEYSON_API_KEY": "YOUR_API_KEY",
        "JEYSON_BASE_URL": "https://your-jeyson-domain.com"
      }
    }
  }
}
```

#### Cursor

Create or edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "jeyson": {
      "command": "npx",
      "args": ["--yes", "--package", "@jeyson-app/jeyson-api-mcp", "jeyson-api-mcp"],
      "env": {
        "JEYSON_APP_ID": "YOUR_APP_ID",
        "JEYSON_API_KEY": "YOUR_API_KEY",
        "JEYSON_BASE_URL": "https://your-jeyson-domain.com"
      }
    }
  }
}
```

#### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "jeyson": {
      "command": "npx",
      "args": ["--yes", "--package", "@jeyson-app/jeyson-api-mcp", "jeyson-api-mcp"],
      "env": {
        "JEYSON_APP_ID": "YOUR_APP_ID",
        "JEYSON_API_KEY": "YOUR_API_KEY",
        "JEYSON_BASE_URL": "https://your-jeyson-domain.com"
      }
    }
  }
}
```

## Usage examples

Once connected, you can prompt your AI assistant:

```
What schemas do I have in my Jeyson app?
```
```
Call the sentiment_analysis schema with the prompt "I love this product"
```
```
Generate a Flutter integration for my meal_tracker schema
```
```
Add the sentiment_analysis schema to my Swift ViewController
```

## Development

```bash
git clone https://github.com/JEYSON-APP/jeyson-api-mcp.git
cd jeyson-api-mcp
npm install
npm run dev   # run with tsx (no build needed)
npm run build # compile to dist/
```

## Notes on security and limits

- `jeyson_call_schema` accepts `target_language` (ISO-like code such as `en`, `pt-BR`, or a language name up to 32 letters).
- Schemas default to `auth_required: true` unless explicitly set to `false`. Pass `user_token` for those.
- Vision schemas are called with `multipart/form-data`: pass `image_path` (local jpeg/png/webp/gif, max 5MB) to `jeyson_call_schema`. Vision snippets send an `image` file plus `prompt`.
- The `JEYSON_API_KEY` is your **secret** key (`sk_live_`). Keep it server-side; never embed it in browser or mobile apps. Client apps use the publishable key (`x-publishable-key`, `pk_live_`) on `auth/{login,register,oauth}` only; it is rejected (403) unless the app has at least one allowed origin configured (full origin `https://app.com` or host `app.com`, exact match). All other client calls use the end-user Bearer JWT from login.
- The chat `model` parameter is honored only with the secret key; end-user Bearer calls use the app's configured model.
- Errors are surfaced with context: 402 `QUOTA_EXCEEDED`, 413 `PAYLOAD_TOO_LARGE` (prompt 8000 chars, image 5MB, body 64KB), 429 `RATE_LIMIT_EXCEEDED` (100 req/min per IP per app, 600/min per app).
