const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

// Configuration from Vercel env vars
const HARNESS_ACCOUNT_ID = process.env.HARNESS_ACCOUNT_ID || 'GCOCLlOsR9-ysFlbwaF_Yw';
const HARNESS_BASE_URL = process.env.HARNESS_BASE_URL || 'https://munklinde96.pr2.harness.io';
const EXPECTED_AUDIENCE = process.env.EXPECTED_AUDIENCE || 'harness-idp';
const ALLOWED_EMAIL = process.env.ALLOWED_EMAIL || 'admin@harness.io';
const EXPECTED_ISSUER = process.env.EXPECTED_ISSUER || '';
const USER_TOKEN_HEADER = 'x-harness-idp-user-token';

const JWKS_URI = `${HARNESS_BASE_URL}/oidc/account/${HARNESS_ACCOUNT_ID}/.wellknown/jwks`;

const client = jwksClient({
  jwksUri: JWKS_URI,
  cache: true,
  cacheMaxAge: 60 * 60 * 1000,
  rateLimit: true
});

function getSigningKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

function verifyToken(token) {
  return new Promise((resolve, reject) => {
    const options = { algorithms: ['RS256'] };
    if (EXPECTED_AUDIENCE) options.audience = EXPECTED_AUDIENCE;
    if (EXPECTED_ISSUER) options.issuer = EXPECTED_ISSUER;
    jwt.verify(token, getSigningKey, options, (err, decoded) => {
      if (err) return reject(err);
      resolve(decoded);
    });
  });
}

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-harness-idp-user-token');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Health check
  if (req.url === '/health') {
    return res.status(200).json({ status: 'ok', jwksUri: JWKS_URI });
  }

  const token = req.headers[USER_TOKEN_HEADER];

  if (!token) {
    return res.status(401).json({ error: `Missing ${USER_TOKEN_HEADER} header` });
  }

  try {
    const decoded = await verifyToken(token);
    const email = decoded.triggered_by_email;

    if (ALLOWED_EMAIL && email !== ALLOWED_EMAIL) {
      return res.status(403).json({
        error: 'User not allowed',
        detail: `email '${email}' is not permitted`
      });
    }

    return res.status(200).json({
      message: 'User token verified successfully',
      user: decoded.sub,
      email,
      audience: decoded.aud,
      issuer: decoded.iss,
      claims: decoded
    });
  } catch (err) {
    return res.status(401).json({ error: 'Token verification failed', detail: err.message });
  }
};
