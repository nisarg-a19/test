/*
 * Mock external system for testing the IDP external proxy user-token feature.
 *
 * The IDP external proxy mints a short-lived JWT (via ng-manager's OIDC endpoint) and injects it
 * into every proxied request as the `X-Harness-IDP-User-Token` header. This server receives the
 * proxied request, extracts that header, and verifies the JWT signature against ng-manager's
 * public JWKS endpoint. On success it echoes the decoded claims so you can confirm the user
 * identity was propagated correctly end-to-end.
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

// ---------------------------------------------------------------------------
// Configuration (override via environment variables)
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 5000;
const HARNESS_ACCOUNT_ID = process.env.HARNESS_ACCOUNT_ID || 'GCOCLlOsR9-ysFlbwaF_Yw';
const HARNESS_BASE_URL = process.env.HARNESS_BASE_URL || 'https://munklinde96.pr2.harness.io';
const EXPECTED_AUDIENCE = process.env.EXPECTED_AUDIENCE || 'harness-idp';
// Only allow requests whose token carries this user email (triggered_by_email claim).
// Leave empty to allow any email.
const ALLOWED_EMAIL = process.env.ALLOWED_EMAIL || 'admin@harness.io';
// The issuer is set by ng-manager's oidc_config.json (CUSTOM.payload.iss).
// Leave empty to skip issuer validation while testing.
const EXPECTED_ISSUER = process.env.EXPECTED_ISSUER || '';
const USER_TOKEN_HEADER = 'x-harness-idp-user-token';

// JWKS URL served by ng-manager for this account (direct to ng-manager, no /ng/api gateway prefix).
const JWKS_URI = `${HARNESS_BASE_URL}/oidc/account/${HARNESS_ACCOUNT_ID}/.wellknown/jwks`;

const client = jwksClient({
  jwksUri: JWKS_URI,
  cache: true,
  cacheMaxAge: 60 * 60 * 1000, // 1 hour
  rateLimit: true
});

function getSigningKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      return callback(err);
    }
    callback(null, key.getPublicKey());
  });
}

function verifyToken(token) {
  return new Promise((resolve, reject) => {
    const options = { algorithms: ['RS256'] };
    if (EXPECTED_AUDIENCE) {
      options.audience = EXPECTED_AUDIENCE;
    }
    if (EXPECTED_ISSUER) {
      options.issuer = EXPECTED_ISSUER;
    }
    jwt.verify(token, getSigningKey, options, (err, decoded) => {
      if (err) {
        return reject(err);
      }
      resolve(decoded);
    });
  });
}

const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', jwksUri: JWKS_URI });
});

// Catch-all: the proxy forwards here. Verify the injected user token on every request.
app.all('*', async (req, res) => {
  const token = req.headers[USER_TOKEN_HEADER];

  console.log(`\n=== Incoming ${req.method} ${req.originalUrl} ===`);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));

  if (!token) {
    console.warn(`Missing ${USER_TOKEN_HEADER} header`);
    return res.status(401).json({ error: `Missing ${USER_TOKEN_HEADER} header` });
  }

  try {
    const decoded = await verifyToken(token);
    console.log('Verified user token claims:', JSON.stringify(decoded, null, 2));

    const email = decoded.triggered_by_email;
    if (ALLOWED_EMAIL && email !== ALLOWED_EMAIL) {
      console.warn(`Rejected: email '${email}' is not the allowed email '${ALLOWED_EMAIL}'`);
      return res.status(403).json({
        error: 'User not allowed',
        detail: `email '${email}' is not permitted`
      });
    }

    return res.json({
      message: 'User token verified successfully',
      user: decoded.sub,
      email,
      audience: decoded.aud,
      issuer: decoded.iss,
      claims: decoded
    });
  } catch (err) {
    console.error('Token verification failed:', err.message);
    return res.status(401).json({ error: 'Token verification failed', detail: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Mock external system listening on http://localhost:${PORT}`);
  console.log(`Verifying header: ${USER_TOKEN_HEADER}`);
  console.log(`JWKS URI: ${JWKS_URI}`);
  console.log(`Expected audience: ${EXPECTED_AUDIENCE || '(any)'}`);
  console.log(`Expected issuer: ${EXPECTED_ISSUER || '(any)'}`);
  console.log(`Allowed email: ${ALLOWED_EMAIL || '(any)'}`);
});
