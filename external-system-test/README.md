# IDP External Proxy — Mock External System

A tiny Node.js server that stands in for a customer's external system behind the Harness IDP
external proxy. It verifies the `X-Harness-IDP-User-Token` JWT that the proxy injects, using
ng-manager's public JWKS endpoint.

## Install

```bash
cd idp-service/external-system-test
npm install
```

## Run

```bash
HARNESS_ACCOUNT_ID=<your-account-id> \
HARNESS_BASE_URL=http://localhost:7457 \
EXPECTED_AUDIENCE=harness-idp \
npm start
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5000` | Port the mock server listens on |
| `HARNESS_ACCOUNT_ID` | `YOUR_ACCOUNT_ID` | Account whose JWKS keys are used to verify tokens |
| `HARNESS_BASE_URL` | `http://localhost:7457` | Base URL of ng-manager (direct, no `/ng/api`) |
| `EXPECTED_AUDIENCE` | `harness-idp` | Required `aud` claim (matches the proxy's minted token) |
| `EXPECTED_ISSUER` | *(empty)* | Optional `iss` claim to enforce (from `oidc_config.json`) |

## Endpoints

- `GET /health` — returns the resolved JWKS URI.
- `ALL *` — verifies the injected user token and echoes the decoded claims.

## How it verifies

1. Reads the `x-harness-idp-user-token` header.
2. Fetches the RS256 public key from `${HARNESS_BASE_URL}/oidc/account/${HARNESS_ACCOUNT_ID}/.wellknown/jwks`.
3. Validates signature, `aud`, and (optionally) `iss`.
4. Returns the decoded `sub` (user id) and full claims on success, or `401` on failure.

## Testing the full flow

1. Run ng-manager (`make run t=120-ng-manager`) and idp-service (`make run t=idp-service`).
2. Configure a proxy endpoint with `oidcUserTokenEnabled: true` and `target` pointing at this server
   (e.g. `http://localhost:5000`).
3. Call the IDP proxy; this server logs and verifies the injected JWT.
