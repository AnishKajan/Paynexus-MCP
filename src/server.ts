// ─── Paynexus MCP HTTP Service ────────────────────────────────────────────────
//
// Two operating modes, selected by environment variables:
//
// SANDBOX mode  (PAYNEXUS_ENV=sandbox  OR  MCP_ENV=demo)
//   Uses DemoAuth — fully self-contained, no backend required.
//   Any email + password is accepted. Sessions, API keys, checkouts,
//   and webhooks are all stored in memory.
//
//   Demo flow:
//     1. POST /auth/login       → any email + password → Bearer token
//     2. POST /api-keys/create  → returns pk_demo_<uuid>
//     3. POST /checkout/demo    → simulated checkout session
//     4. POST /webhooks/create  → simulated webhook registration
//     5. POST /api-keys/rotate  → rotates to new pk_demo_<uuid>
//     6. GET  /session          → inspect current session state
//
// PRODUCTION mode  (all other values)
//   Bridges Supabase JWT / API key auth to the Paynexus Rust backend.
//   No DemoAuth endpoints are active. Real backend calls are made.
//
// ─────────────────────────────────────────────────────────────────────────────

import express from 'express';
import axios, { AxiosError } from 'axios';
import { randomUUID } from 'crypto';

// ── Config ────────────────────────────────────────────────────────────────────

const BACKEND = (process.env.PAYNEXUS_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const PORT    = parseInt(process.env.PORT ?? '3000', 10);
const MCP_ENV = process.env.MCP_ENV ?? 'demo';

// Sandbox mode: PAYNEXUS_ENV=sandbox OR MCP_ENV=demo (deploy default)
// DEMO AUTH ONLY — NOT FOR PRODUCTION
const IS_SANDBOX = process.env.PAYNEXUS_ENV === 'sandbox' || MCP_ENV === 'demo';

// ── In-memory demo state (DEMO AUTH ONLY — NOT FOR PRODUCTION) ────────────────

interface DemoCheckout {
  id: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
}

interface DemoWebhook {
  id: string;
  url: string;
  events: string[];
  createdAt: string;
}

// DEMO AUTH ONLY — NOT FOR PRODUCTION
interface DemoSession {
  token: string;
  email: string;
  apiKey: string | null;
  checkouts: DemoCheckout[];
  webhooks: DemoWebhook[];
  createdAt: string;
}

// DEMO AUTH ONLY — NOT FOR PRODUCTION
// keyed by session token (UUID)
const demoSessions = new Map<string, DemoSession>();

// Legacy single-tenant state — used only in production mode
const prodState: { jwt: string | null; apiKey: string | null } = {
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

// DEMO AUTH ONLY — NOT FOR PRODUCTION
function getDemoSession(req: express.Request): DemoSession | null {
  const token = extractBearer(req);
  if (!token) return null;
  return demoSessions.get(token) ?? null;
}

// DEMO AUTH ONLY — NOT FOR PRODUCTION
// Returns the session or sends 401 and returns null.
function requireDemoSession(
  req: express.Request,
  res: express.Response
): DemoSession | null {
  const session = getDemoSession(req);
  if (!session) {
    res.status(401).json({
      error:   'Unauthorized — no valid demo session.',
      hint:    'Call POST /auth/login first, then pass the token as Authorization: Bearer <token>.',
      mode:    'sandbox',
    });
    return null;
  }
  return session;
}

// ── App ───────────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// ── GET /health ───────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status:   'ok',
    service:  'paynexus-mcp',
    mode:     IS_SANDBOX ? 'sandbox' : 'production',
    env:      MCP_ENV,
    backend:  IS_SANDBOX ? '(not used in sandbox mode)' : BACKEND,
    // DEMO AUTH ONLY — NOT FOR PRODUCTION
    sessions: IS_SANDBOX ? demoSessions.size : undefined,
  });
});

// ── POST /auth/login ──────────────────────────────────────────────────────────
// DEMO AUTH ONLY — NOT FOR PRODUCTION
// Accepts any email + password. Generates a UUID session token stored in memory.
// Only available in sandbox mode.

app.post('/auth/login', (req, res) => {
  if (!IS_SANDBOX) {
    res.status(404).json({
      error: '/auth/login is only available in sandbox mode.',
      hint:  'Use POST /auth/forward with a real Supabase JWT in production.',
    });
    return;
  }

  // DEMO AUTH ONLY — NOT FOR PRODUCTION
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email) {
    res.status(400).json({ error: 'Provide email in request body.' });
    return;
  }

  // Accept any credentials — this is demo only
  // DEMO AUTH ONLY — NOT FOR PRODUCTION
  const token = randomUUID();
  const session: DemoSession = {
    token,
    email,
    apiKey:    null,
    checkouts: [],
    webhooks:  [],
    createdAt: new Date().toISOString(),
  };

  demoSessions.set(token, session);

  // password is intentionally ignored — DEMO AUTH ONLY — NOT FOR PRODUCTION
  void password;

  res.json({
    ok:      true,
    token,
    email,
    mode:    'sandbox',
    message: 'Demo session created. Pass token as: Authorization: Bearer <token>',
    // DEMO AUTH ONLY — NOT FOR PRODUCTION
    warning: 'Sandbox session only. No real authentication occurred.',
  });
});

// ── POST /auth/forward ────────────────────────────────────────────────────────
// Production: Accept a Supabase JWT and store it for subsequent calls.
// Sandbox: Kept for compatibility — prefer POST /auth/login in sandbox mode.
// Body: { jwt: string }  OR  Authorization: Bearer <token>

app.post('/auth/forward', (req, res) => {
  const body  = req.body as { jwt?: string };
  const token = body.jwt ?? extractBearer(req);

  if (!token) {
    res.status(400).json({
      error: IS_SANDBOX
        ? 'Provide jwt in body. In sandbox mode, prefer POST /auth/login instead.'
        : 'Provide jwt in body or Authorization: Bearer <token>',
    });
    return;
  }

  prodState.jwt = token;
  res.json({
    ok:      true,
    mode:    IS_SANDBOX ? 'sandbox' : 'production',
    message: IS_SANDBOX
      ? 'JWT stored in legacy state. For the full demo flow, use POST /auth/login.'
      : 'JWT stored. Call POST /api-keys/create next.',
  });
});

// ── POST /api-keys/create ─────────────────────────────────────────────────────
// Sandbox: Generate pk_demo_<uuid> tied to the session. No backend call.
// Production: Call backend POST /v1/api-keys/create (JWT required).
//             Falls back to legacy POST /api/keys/create if v1 fails.
// Body (optional): { tag, org_id, env, scopes }

app.post('/api-keys/create', async (req, res) => {
  if (IS_SANDBOX) {
    // DEMO AUTH ONLY — NOT FOR PRODUCTION
    const session = requireDemoSession(req, res);
    if (!session) return;

    const key    = `pk_demo_${randomUUID().replace(/-/g, '')}`;
    session.apiKey = key;

    res.json({
      ok:      true,
      key,
      mode:    'sandbox',
      session: session.email,
      // DEMO AUTH ONLY — NOT FOR PRODUCTION
      warning: 'Demo API key — stored in memory only. Not valid for real transactions.',
    });
    return;
  }

  // Production path — proxy to Rust backend
  const token  = extractBearer(req) ?? prodState.jwt;
  const body   = req.body as { tag?: string; org_id?: string; env?: string; scopes?: string[] };
  const v1Body = {
    org_id: body.org_id ?? 'demo-org',
    tag:    body.tag    ?? 'ai-agent',
    env:    body.env    ?? 'sandbox',
    scopes: body.scopes,
  };

  try {
    const r = await backendPost('/v1/api-keys/create', token, v1Body);
    if (r.data?.raw_key) prodState.apiKey = r.data.raw_key;
    res.json(r.data);
  } catch {
    // v1 requires a real Supabase JWT — fall back to unauthenticated legacy endpoint
    try {
      const r2 = await backendPost('/api/keys/create', null, { tag: body.tag ?? 'ai-agent' });
      if (r2.data?.key) prodState.apiKey = r2.data.key;
      res.json(r2.data);
    } catch (err2) {
      sendError(res, err2);
    }
  }
});

// ── POST /api-keys/rotate ─────────────────────────────────────────────────────
// Sandbox: Generate a new pk_demo_<uuid>, invalidate old key on session.
// Production: Call backend POST /v1/api-keys/rotate (API key required).
// Body (optional): { tag }

app.post('/api-keys/rotate', async (req, res) => {
  if (IS_SANDBOX) {
    // DEMO AUTH ONLY — NOT FOR PRODUCTION
    const session = requireDemoSession(req, res);
    if (!session) return;

    const oldKey   = session.apiKey;
    const newKey   = `pk_demo_${randomUUID().replace(/-/g, '')}`;
    session.apiKey = newKey;

    res.json({
      ok:      true,
      key:     newKey,
      rotated: true,
      // Show truncated old key — never log full keys even in demo
      old_key: oldKey ? `${oldKey.slice(0, 15)}...` : null,
      mode:    'sandbox',
      // DEMO AUTH ONLY — NOT FOR PRODUCTION
      warning: 'Demo key rotation. No real keys were affected.',
    });
    return;
  }

  // Production path — proxy to Rust backend
  const token = extractBearer(req) ?? prodState.apiKey;
  try {
    const r = await backendPost('/v1/api-keys/rotate', token, req.body);
    if (r.data?.raw_key) prodState.apiKey = r.data.raw_key;
    res.json(r.data);
  } catch (err) {
    sendError(res, err);
  }
});

// ── POST /checkout/demo ───────────────────────────────────────────────────────
// Sandbox: Return a simulated checkout session. No backend call.
// Production: Call backend POST /v1/checkout/create.
//             Falls back to legacy endpoint if v1 fails.
// Body (optional): { amount, currency, metadata }

app.post('/checkout/demo', async (req, res) => {
  if (IS_SANDBOX) {
    // DEMO AUTH ONLY — NOT FOR PRODUCTION
    const session = requireDemoSession(req, res);
    if (!session) return;

    const body     = req.body as { amount?: number; currency?: string; metadata?: unknown };
    const amount   = body.amount   ?? 4900;
    const currency = (body.currency ?? 'usd').toLowerCase();
    const now      = new Date().toISOString();

    const checkout = {
      id:          `cs_demo_${randomUUID().replace(/-/g, '')}`,
      object:      'checkout_session',
      amount,
      currency,
      status:      'pending',
      created_at:  now,
      expires_at:  new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      merchant:    session.email,
      api_key:     session.apiKey ? `${session.apiKey.slice(0, 15)}...` : null,
      payment_url: `https://checkout.paynexus.demo/${randomUUID()}`,
      metadata:    body.metadata ?? {},
      mode:        'sandbox',
    };

    session.checkouts.push({ id: checkout.id, amount, currency, status: 'pending', createdAt: now });

    res.json(checkout);
    return;
  }

  // Production path — proxy to Rust backend
  const token = extractBearer(req) ?? prodState.apiKey;
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
// Sandbox: Return a simulated webhook registration. No backend call.
// Production: Call backend POST /v1/webhooks (API key required).
// Body: { url, events }

app.post('/webhooks/create', async (req, res) => {
  if (IS_SANDBOX) {
    // DEMO AUTH ONLY — NOT FOR PRODUCTION
    const session = requireDemoSession(req, res);
    if (!session) return;

    const body = req.body as { url?: string; events?: string[] };
    const now  = new Date().toISOString();

    const webhook = {
      id:         `wh_demo_${randomUUID().replace(/-/g, '')}`,
      url:        body.url    ?? 'https://webhook.site/demo',
      events:     body.events ?? ['checkout.confirmed', 'transaction.succeeded'],
      status:     'active',
      created_at: now,
      mode:       'sandbox',
    };

    session.webhooks.push({
      id:        webhook.id,
      url:       webhook.url,
      events:    webhook.events,
      createdAt: now,
    });

    res.json(webhook);
    return;
  }

  // Production path — proxy to Rust backend
  const token = extractBearer(req) ?? prodState.apiKey;
  const body  = req.body as { url?: string; events?: string[] };

  try {
    const r = await backendPost('/v1/webhooks', token, {
      url:    body.url    ?? 'https://webhook.site/demo',
      events: body.events ?? ['checkout.confirmed', 'transaction.succeeded'],
    });
    res.json(r.data);
  } catch (err) {
    sendError(res, err);
  }
});

// ── GET /session ──────────────────────────────────────────────────────────────
// DEMO AUTH ONLY — NOT FOR PRODUCTION
// Returns the current demo session state for the Bearer token.
// Useful for the demo flow to verify state without making real calls.

app.get('/session', (req, res) => {
  if (!IS_SANDBOX) {
    res.status(404).json({ error: 'Not available in production mode.' });
    return;
  }

  // DEMO AUTH ONLY — NOT FOR PRODUCTION
  const session = requireDemoSession(req, res);
  if (!session) return;

  res.json({
    email:      session.email,
    mode:       'sandbox',
    hasApiKey:  session.apiKey !== null,
    apiKey:     session.apiKey ? `${session.apiKey.slice(0, 15)}...` : null,
    checkouts:  session.checkouts,
    webhooks:   session.webhooks,
    createdAt:  session.createdAt,
    // DEMO AUTH ONLY — NOT FOR PRODUCTION
    warning:    'Sandbox session — in-memory only, resets on server restart.',
  });
});

// ── GET /sessions ─────────────────────────────────────────────────────────────
// DEMO AUTH ONLY — NOT FOR PRODUCTION
// Lists all active demo sessions (summary only — no tokens exposed).

app.get('/sessions', (_req, res) => {
  if (!IS_SANDBOX) {
    res.status(404).json({ error: 'Not available in production mode.' });
    return;
  }

  // DEMO AUTH ONLY — NOT FOR PRODUCTION
  const list = Array.from(demoSessions.values()).map((s) => ({
    email:      s.email,
    hasApiKey:  s.apiKey !== null,
    checkouts:  s.checkouts.length,
    webhooks:   s.webhooks.length,
    createdAt:  s.createdAt,
  }));

  res.json({ mode: 'sandbox', total: list.length, sessions: list });
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  const line = (s: string) => `║  ${s.padEnd(40)}║`;
  console.log('╔══════════════════════════════════════════╗');
  console.log('║       Paynexus MCP HTTP Service          ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(line(`Port:    ${PORT}`));
  console.log(line(`Mode:    ${IS_SANDBOX ? 'SANDBOX (DemoAuth)' : 'production'}`));
  if (!IS_SANDBOX) console.log(line(`Backend: ${BACKEND.slice(0, 32)}`));
  console.log(line(`Env:     ${MCP_ENV}`));
  console.log('╠══════════════════════════════════════════╣');
  if (IS_SANDBOX) {
    console.log(line('POST /auth/login      ← start here'));
  } else {
    console.log(line('POST /auth/forward'));
  }
  console.log(line('POST /api-keys/create'));
  console.log(line('POST /api-keys/rotate'));
  console.log(line('POST /checkout/demo'));
  console.log(line('POST /webhooks/create'));
  if (IS_SANDBOX) {
    console.log(line('GET  /session'));
    console.log(line('GET  /sessions'));
  }
  console.log(line('GET  /health'));
  if (IS_SANDBOX) {
    console.log('╠══════════════════════════════════════════╣');
    console.log('║  DEMO AUTH ONLY — NOT FOR PRODUCTION     ║');
  }
  console.log('╚══════════════════════════════════════════╝');
});
