// ─── Paynexus MCP HTTP Service ────────────────────────────────────────────────
//
// Hosted HTTP proxy that Claude (or any AI agent) calls directly.
// Bridges Supabase JWT / API key auth to the Paynexus Rust backend.
//
// Demo flow:
//   1. POST /auth/forward   → store Supabase JWT in memory
//   2. POST /api-keys/create → exchange JWT for API key (stored in memory)
//   3. POST /checkout/demo  → create checkout session using stored API key
//   4. POST /webhooks/create → register webhook using stored API key
//   5. POST /api-keys/rotate → rotate stored API key
//
// The service is stateless per-restart. Each call can also supply its own
// Authorization: Bearer <token> header to override the in-memory state.
// ─────────────────────────────────────────────────────────────────────────────

import express from 'express';
import axios, { AxiosError } from 'axios';

// ── Config ───────────────────────────────────────────────────────────────────

const BACKEND = (process.env.PAYNEXUS_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const PORT    = parseInt(process.env.PORT ?? '3000', 10);
const MCP_ENV = process.env.MCP_ENV ?? 'demo';

// ── In-memory demo state (single-tenant — not for multi-user production) ─────

const state: { jwt: string | null; apiKey: string | null } = {
  jwt:    null,
  apiKey: null,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractBearer(req: express.Request): string | null {
  const auth = req.headers.authorization;
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function backendPost(path: string, token: string | null, body: unknown) {
  return axios.post(`${BACKEND}${path}`, body, { headers: authHeaders(token) });
}

function sendError(res: express.Response, err: unknown): void {
  if (err instanceof AxiosError) {
    res.status(err.response?.status ?? 502).json(
      err.response?.data ?? { error: err.message }
    );
  } else {
    res.status(500).json({ error: 'MCP internal error' });
  }
}

// ── App ───────────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// ── GET /health ───────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status:  'ok',
    service: 'paynexus-mcp',
    env:     MCP_ENV,
    backend: BACKEND,
    hasJwt:  state.jwt !== null,
    hasKey:  state.apiKey !== null,
  });
});

// ── POST /auth/forward ────────────────────────────────────────────────────────
// Accept a Supabase JWT and store it for subsequent calls.
// Body: { jwt: string }  OR  Authorization: Bearer <token>

app.post('/auth/forward', (req, res) => {
  const body = req.body as { jwt?: string };
  const token = body.jwt ?? extractBearer(req);

  if (!token) {
    res.status(400).json({
      error: 'Provide jwt in body or Authorization: Bearer <token>',
    });
    return;
  }

  state.jwt = token;
  res.json({
    ok:      true,
    message: 'JWT stored. Call POST /api-keys/create next.',
  });
});

// ── POST /api-keys/create ─────────────────────────────────────────────────────
// Calls backend POST /v1/api-keys/create (requires JWT).
// Falls back to legacy POST /api/keys/create if v1 fails (demo-safe).
// Body (optional): { tag, org_id, env, scopes }

app.post('/api-keys/create', async (req, res) => {
  const token  = extractBearer(req) ?? state.jwt;
  const body   = req.body as { tag?: string; org_id?: string; env?: string; scopes?: string[] };

  const v1Body = {
    org_id: body.org_id ?? 'demo-org',
    tag:    body.tag    ?? 'ai-agent',
    env:    body.env    ?? 'sandbox',
    scopes: body.scopes,
  };

  try {
    const r = await backendPost('/v1/api-keys/create', token, v1Body);
    if (r.data?.raw_key) state.apiKey = r.data.raw_key;
    res.json(r.data);
  } catch {
    // v1 requires a real Supabase JWT — fall back to unauthenticated legacy endpoint
    try {
      const r2 = await backendPost('/api/keys/create', null, { tag: body.tag ?? 'ai-agent' });
      if (r2.data?.key) state.apiKey = r2.data.key;
      res.json(r2.data);
    } catch (err2) {
      sendError(res, err2);
    }
  }
});

// ── POST /api-keys/rotate ─────────────────────────────────────────────────────
// Calls backend POST /v1/api-keys/rotate (requires current API key).
// Updates stored API key on success.
// Body (optional): { tag }

app.post('/api-keys/rotate', async (req, res) => {
  const token = extractBearer(req) ?? state.apiKey;

  try {
    const r = await backendPost('/v1/api-keys/rotate', token, req.body);
    if (r.data?.raw_key) state.apiKey = r.data.raw_key;
    res.json(r.data);
  } catch (err) {
    sendError(res, err);
  }
});

// ── POST /checkout/demo ───────────────────────────────────────────────────────
// Creates a checkout session using the stored API key (or supplied header).
// Falls back to legacy endpoint if v1 fails.
// Body (optional): { amount, currency, country, metadata }

app.post('/checkout/demo', async (req, res) => {
  const token = extractBearer(req) ?? state.apiKey;
  const body  = { amount: 4900, currency: 'usd', ...req.body };

  try {
    const r = await backendPost('/v1/checkout/create', token, body);
    res.json(r.data);
  } catch {
    try {
      const r2 = await backendPost('/api/checkout/create', null, body);
      res.json(r2.data);
    } catch (err2) {
      sendError(res, err2);
    }
  }
});

// ── POST /webhooks/create ─────────────────────────────────────────────────────
// Registers a webhook with the Paynexus backend using the stored API key.
// Body: { url, events }

app.post('/webhooks/create', async (req, res) => {
  const token = extractBearer(req) ?? state.apiKey;
  const body  = req.body as { url?: string; events?: string[] };

  const webhookBody = {
    url:    body.url    ?? 'https://webhook.site/demo',
    events: body.events ?? ['checkout.confirmed', 'transaction.succeeded'],
  };

  try {
    const r = await backendPost('/v1/webhooks', token, webhookBody);
    res.json(r.data);
  } catch (err) {
    sendError(res, err);
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║       Paynexus MCP HTTP Service          ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  Port:    ${PORT}                            ║`);
  console.log(`║  Backend: ${BACKEND.slice(0, 30).padEnd(30)} ║`);
  console.log(`║  Env:     ${MCP_ENV.padEnd(32)} ║`);
  console.log('╠══════════════════════════════════════════╣');
  console.log('║  POST /auth/forward                      ║');
  console.log('║  POST /api-keys/create                   ║');
  console.log('║  POST /api-keys/rotate                   ║');
  console.log('║  POST /checkout/demo                     ║');
  console.log('║  POST /webhooks/create                   ║');
  console.log('║  GET  /health                            ║');
  console.log('╚══════════════════════════════════════════╝');
});
