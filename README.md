# @jeyson-app/jeyson-api-mcp

An MCP (Model Context Protocol) server that connects AI coding assistants — Cursor, Claude Desktop, VS Code Copilot, Windsurf — directly to your Jeyson API workspace. Your AI assistant can list your schemas, call them live, and generate ready-to-paste integration code for any mobile or web platform.

## Tools

| Tool | Description |
|---|---|
| `jeyson_list_schemas` | Lists all schemas in your app with field definitions, endpoint URLs, auth requirements, and token balance |
| `jeyson_call_schema` | Calls a schema endpoint live and returns the structured JSON response |
| `jeyson_get_integration_snippet` | Generates platform-specific integration code for a schema |

Supported platforms for `jeyson_get_integration_snippet`: `swift` · `kotlin` · `flutter` · `react_native` · `javascript`

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
