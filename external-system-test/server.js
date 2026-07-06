/*
 * Mock External System for testing Harness IDP External Proxy User Token.
 *
 * This server simulates a customer-owned system that receives proxied requests
 * from Harness IDP. It verifies the X-Harness-IDP-User-Token JWT against
 * ng-manager's JWKS endpoint and extracts the user identity.
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const app = express();
app.use(express.json());
app.use(express.text({ type: '*/*' }));

// ---------------------------------------------------------------------------
// Configuration (override via environment variables)
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 5000;
const HARNESS_ACCOUNT_ID = process.env.HARNESS_ACCOUNT_ID || 'YOUR_ACCOUNT_ID';
const HARNESS_BASE_URL = process.env.HARNESS_BASE_URL || 'http://localhost:7457';
const EXPECTED_AUDIENCE = process.env.EXPECTED_AUDIENCE || 'harness-idp';
// The issuer is set by ng-manager's oidc_config.json (CUSTOM.payload.iss).
// Leave empty to skip issuer validation while testing.
const EXPECTED_ISSUER = process.env.EXPECTED_ISSUER || '';
const USER_TOKEN_HEADER = 'x-harness-idp-user-token';

// JWKS URL served by ng-manager for this account.
const JWKS_URI = `${HARNESS_BASE_URL}/ng/api/oidc/account/${HARNESS_ACCOUNT_ID}/.wellknown/jwks`;

const client = jwksClient({
  jwksUri: JWKS_URI,
  cache: true,
  cacheMaxAge: 60 * 60 * 1000, // 1 hour
  rateLimit: true
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      console.error('[ERROR] Failed to fetch signing key:', err.message);
      return callback(err);
    }
    const signingKey = key.getPublicKey();
    callback(null, signingKey);
  });
}

// ---------------------------------------------------------------------------
// JWT verification middleware
// ---------------------------------------------------------------------------
function verifyUserToken(req, res, next) {
  const token = req.headers[USER_TOKEN_HEADER];

  if (!token) {
    console.warn('[WARN] Missing X-Harness-IDP-User-Token header');
    return res.status(401).json({
      error: 'Missing user token',
      receivedHeaders: Object.keys(req.headers)
    });
  }

  console.log(`[INFO] Received token: ${token.substring(0, 40)}...`);

  const verifyOptions = {
    algorithms: ['RS256'],
    audience: EXPECTED_AUDIENCE
  };
  if (EXPECTED_ISSUER) {
    verifyOptions.issuer = EXPECTED_ISSUER;
  }

  jwt.verify(token, getKey, verifyOptions, (err, decoded) => {
    if (err) {
      console.error('[ERROR] Token verification failed:', err.message);
      return res.status(401).json({ error: 'Invalid token', details: err.message });
    }

    console.log('[SUCCESS] Token verified. Claims:');
    console.log(JSON.stringify(decoded, null, 2));
    req.userToken = decoded;
    next();
  });
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Protected endpoint — requires a valid user token.
app.all('/api/deployment', verifyUserToken, (req, res) => {
  const claims = req.userToken;
  const userId = claims.sub;
  const userEmail = claims.email || claims.upn;
  const accountId = claims.account_id;

  console.log(`[INFO] Processing deployment for user: ${userEmail} (${userId})`);

  // Example authorization check — customize as needed.
  const allowedUsers = (process.env.ALLOWED_USERS || '').split(',').filter(Boolean);
  if (allowedUsers.length > 0 && !allowedUsers.includes(userEmail)) {
    console.warn(`[WARN] User ${userEmail} not in allowed list`);
    return res.status(403).json({ error: 'User not authorized', userEmail, userId });
  }

  return res.status(200).json({
    status: 'success',
    message: `Deployment triggered by ${userEmail}`,
    userId,
    userEmail,
    accountId,
    tokenClaims: claims
  });
});

// Health check.
app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));

// Debug: inspect all received headers (no token verification).
app.all('/debug/headers', (req, res) => {
  const token = req.headers[USER_TOKEN_HEADER];
  let decodedNoVerify = null;
  if (token) {
    decodedNoVerify = jwt.decode(token, { complete: true });
  }
  res.status(200).json({
    method: req.method,
    path: req.path,
    headers: req.headers,
    body: req.body,
    decodedTokenWithoutVerification: decodedNoVerify
  });
});

// Debug: fetch and display the JWKS.
app.get('/debug/jwks', async (_req, res) => {
  try {
    const https = JWKS_URI.startsWith('https') ? require('https') : require('http');
    https.get(JWKS_URI, (resp) => {
      let data = '';
      resp.on('data', (chunk) => (data += chunk));
      resp.on('end', () => {
        try {
          res.status(200).json({ jwksUri: JWKS_URI, jwks: JSON.parse(data) });
        } catch (e) {
          res.status(500).json({ error: 'Failed to parse JWKS', raw: data });
        }
      });
    }).on('error', (e) => res.status(500).json({ error: e.message, jwksUri: JWKS_URI }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log('==========================================================');
  console.log(' Mock External System for Harness IDP Proxy User Token');
  console.log('==========================================================');
  console.log(`  Listening on:      http://localhost:${PORT}`);
  console.log(`  Harness account:   ${HARNESS_ACCOUNT_ID}`);
  console.log(`  ng-manager URL:    ${HARNESS_BASE_URL}`);
  console.log(`  JWKS URI:          ${JWKS_URI}`);
  console.log(`  Expected audience: ${EXPECTED_AUDIENCE}`);
  console.log(`  Expected issuer:   ${EXPECTED_ISSUER || '(not validated)'}`);
  console.log('----------------------------------------------------------');
  console.log('  Endpoints:');
  console.log(`    ALL  /api/deployment   (verifies user token)`);
  console.log(`    GET  /health`);
  console.log(`    ALL  /debug/headers    (shows received headers + decoded token)`);
  console.log(`    GET  /debug/jwks       (shows JWKS from ng-manager)`);
  console.log('==========================================================');
});
