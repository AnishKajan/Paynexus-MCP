# Paynexus MCP

A Node.js + TypeScript Model Control Plane (MCP) client for the Paynexus backend.

This package acts as a programmable, securely isolated client for AI agents and automated systems to interact with the Paynexus Rust (Axum) backend.

## Overview

The Paynexus MCP is a strictly-typed wrapper designed to operate purely through the Paynexus backend REST endpoints without bypassing any business logic or security controls. It strictly adheres to security requirements such as environment isolation, protected database access, and structured logging.

### Features
* **Create Checkout Sessions**: Instantiate secure payment checkouts.
* **Confirm Payments**: Verify payment status.
* **Fetch Transactions**: Retrieve transaction history.
* **Trigger & Retrieve Compliance Scans**: Interface with the compliance systems.
* **Webhook Auto-Registration**: Setup webhook listeners with secure HMAC secrets.
* **API Key Rotation**: Automatically rollover and revoke API keys seamlessly.

## Configuration & Usage

### 1. Installation

```bash
npm install @paynexus/mcp
```

### 2. Environment Variables

Create a `.env` file based on `.env.example`:

```bash
PAYNEXUS_ENV=sandbox
PAYNEXUS_API_KEY=pnx_test_xxxxxxxxxxxxxxxx
PAYNEXUS_BASE_URL=https://api.sandbox.paynexus.com
LOG_LEVEL=info
```

### 3. Basic Example

```typescript
import { PaynexusClient, logger } from '@paynexus/mcp';

async function main() {
  const client = new PaynexusClient();

  // Create a checkout session
  const session = await client.createCheckout(150.00, 'USD');
  logger.info('Created session', { url: session.url });
}

main();
```

See `example.ts` for a full end-to-end example.

## Security & Operations

### How MCP Authenticates
The MCP utilizes org-scoped API keys (Bearer tokens). The tokens are injected transparently into the `Authorization` header of every request made by the `PaynexusClient`. Because this client runs locally or in an AI's tool execution environment, it relies on Azure OIDC federation implemented at the infrastructure layer. 

### How it Operates Safely
* **No Database Access**: The MCP has zero database drivers installed. All actions are routed through the backend validation layers.
* **Environment Isolation**: The `X-Paynexus-Env` header explicitly prevents sandbox keys from accessing production routes, and vice-versa.
* **Structured Logging**: Any data matching the `pnx_` prefix is automatically redacted by the structured logger to prevent logging sensitive keys.

### How it Rotates Keys
The `rotateApiKey` function communicates with the backend's `/v1/auth/rotate` endpoint.
1. The backend issues a new key and securely invalidates the old key after a brief grace period.
2. The MCP instance automatically updates its configuration strictly in memory, applying the new key to all subsequent requests.

### How it Registers Webhooks
The `WebhookManager` leverages `crypto.randomBytes(32)` to generate a secure secret. This secret is transmitted to the backend alongside the listener URL. You can use the manager's `verifySignature(payload, signature, secret)` method to securely evaluate HMAC incoming payloads.
