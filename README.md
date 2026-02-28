<p align="center">
  <img src="https://pub-d4ec8c246ffe4169a42b983e2d01c1dd.r2.dev/Paynexus-logo-cloudflare.png" alt="Paynexus Logo" width="220" />
</p>

<h1 align="center">Paynexus MCP</h1>

<p align="center">
  A Node.js + TypeScript <strong>Model Control Plane (MCP)</strong> client for the Paynexus payment infrastructure — built for AI agents, automated pipelines, and production-grade integrations.
</p>

---

## Overview

The Paynexus MCP is a strictly-typed wrapper that enables AI agents and automated systems to interact securely with the Paynexus backend. It operates exclusively through authenticated REST endpoints, enforcing every layer of business logic, security control, and compliance policy defined in production.

Authentication is powered by **Supabase Auth** — providing JWT-based session management, row-level security enforcement, and organization-scoped API key issuance without exposing any direct database access.

### Features

- **Create Checkout Sessions** — Instantiate secure, auditable payment checkouts
- **Confirm Payments** — Verify and settle payment status in real time
- **Fetch Transactions** — Retrieve full transaction history with filtering
- **Trigger & Retrieve Compliance Scans** — Interface directly with compliance systems
- **Webhook Auto-Registration** — Register HMAC-secured webhook listeners programmatically
- **API Key Rotation** — Seamlessly rotate and revoke keys without service interruption

---

## Production Architecture

```
AI Agent / Automated System
        │
        ▼
  Paynexus MCP (this package)
        │  Bearer token (Supabase JWT)
        ▼
  Paynexus Backend (Rust / Axum)
        │
        ├──► Supabase Auth     (JWT validation, RLS enforcement)
        ├──► Supabase DB       (zero direct access from MCP)
        ├──► Compliance Engine
        └──► Webhook Dispatcher
```

In production, the MCP never touches the database directly. All requests are validated by Supabase Auth before reaching any business logic.

---

## Configuration & Usage

### 1. Installation

```bash
npm install @paynexus/mcp
```

### 2. Environment Variables

Create a `.env` file based on `.env.example`:

```bash
PAYNEXUS_ENV=production
PAYNEXUS_API_KEY=pnx_live_xxxxxxxxxxxxxxxx
PAYNEXUS_BASE_URL=https://api.paynexus.ai
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
LOG_LEVEL=info
```

For sandbox/development:

```bash
PAYNEXUS_ENV=sandbox
PAYNEXUS_API_KEY=pnx_test_xxxxxxxxxxxxxxxx
PAYNEXUS_BASE_URL=https://paynexus-mcp.thankfulpond-3f5b4265.eastus2.azurecontainerapps.io
```

### 3. Basic Example

```typescript
import { PaynexusClient, logger } from '@paynexus/mcp';

async function main() {
  const client = new PaynexusClient();

  // Create a checkout session
  const session = await client.createCheckout(4900, 'usd');
  logger.info('Created session', { id: session.id, url: session.url });
}

main();
```

See `example.ts` for a full end-to-end example.

---

## Sandbox Demo

No backend setup required. The live sandbox endpoint supports the full MCP flow with realistic response payloads (IDs like `cs_demo_*`, `wh_demo_*`, `pk_demo_*`).

```bash
BASE=https://paynexus-mcp.thankfulpond-3f5b4265.eastus2.azurecontainerapps.io

# 1. Login — any email + password
TOKEN=$(curl -s -X POST $BASE/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@paynexus.ai","password":"demo"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# 2. Create API key
curl -X POST $BASE/api-keys/create \
  -H "Authorization: Bearer $TOKEN"

# 3. Create checkout session
curl -X POST $BASE/checkout/demo \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"amount":4900,"currency":"usd"}'

# 4. Register webhook
curl -X POST $BASE/webhooks/create \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://webhook.site/demo","events":["checkout.confirmed"]}'

# 5. Rotate API key
curl -X POST $BASE/api-keys/rotate \
  -H "Authorization: Bearer $TOKEN"

# 6. Inspect full session state
curl $BASE/session -H "Authorization: Bearer $TOKEN"
```

All responses are realistic JSON — the sandbox is behaviorally identical to production.

---

## Security & Operations

### Authentication (Supabase Auth)

In production, Paynexus uses **Supabase Auth** for all identity and session management:

- Login issues a **Supabase JWT** bound to the user's organization
- The JWT is forwarded as a `Bearer` token on every MCP request
- The backend validates the JWT via Supabase's Auth API before processing any operation
- **Row-Level Security (RLS)** is enforced at the database layer — no cross-tenant data leakage is possible even if a token is misused
- API keys are org-scoped and stored as hashed values; plaintext keys are never persisted

### Safe Operation Guarantees

| Guarantee | Implementation |
|---|---|
| No direct DB access | Zero database drivers in the MCP package |
| Environment isolation | `X-Paynexus-Env` header blocks sandbox keys from hitting production routes |
| Key redaction | Structured logger auto-redacts any value matching the `pnx_` prefix |
| Audit trail | Every MCP action is logged server-side with the authenticated user ID |

### API Key Rotation

The `rotateApiKey()` method calls the backend's `/api-keys/rotate` endpoint:

1. The backend (authenticated via Supabase JWT) issues a new org-scoped key
2. The old key enters a short grace period before being permanently invalidated
3. The MCP instance updates its in-memory configuration immediately — no restart required
4. All subsequent requests automatically use the new key

### Webhook Registration

The `WebhookManager` uses `crypto.randomBytes(32)` to generate a cryptographically secure HMAC secret per endpoint registration. The secret and listener URL are transmitted to the backend over TLS and stored encrypted at rest via Supabase's encrypted columns.

Verify incoming webhook payloads using:

```typescript
webhookManager.verifySignature(payload, signature, secret);
```

---

## Deployment

Production deployments are handled via **GitHub Actions** with Azure Container Apps. Pushing to `main` triggers an automatic build and deploy pipeline — no manual steps required.

```
git push origin main
# ↳ GitHub Actions builds Docker image
# ↳ Pushes to Azure Container Registry
# ↳ Deploys to Azure Container Apps (eastus2)
```

---

## License

MIT © Paynexus
