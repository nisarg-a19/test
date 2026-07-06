# Mock External System (Node.js)

A minimal customer-side system that verifies the `X-Harness-IDP-User-Token` JWT injected by the Harness IDP external proxy.

## Install & Run

```bash
cd idp-service/external-system-test
npm install

HARNESS_ACCOUNT_ID=<your-account-id> \
HARNESS_BASE_URL=http://localhost:7457 \
npm start
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5000` | Port to listen on |
| `HARNESS_ACCOUNT_ID` | `YOUR_ACCOUNT_ID` | Your Harness account ID (used in JWKS URL) |
| `HARNESS_BASE_URL` | `http://localhost:7457` | ng-manager base URL that serves JWKS |
| `EXPECTED_AUDIENCE` | `harness-idp` | Expected `aud` claim |
| `EXPECTED_ISSUER` | *(empty)* | Expected `iss` claim; leave empty to skip validation |
| `ALLOWED_USERS` | *(empty)* | Comma-separated emails allowed to deploy (empty = allow all) |

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| ALL | `/api/deployment` | Protected — verifies the user token, returns decoded claims |
| GET | `/health` | Health check |
| ALL | `/debug/headers` | Shows all received headers + decoded token (no verification) |
| GET | `/debug/jwks` | Fetches and displays the JWKS from ng-manager |

## How to Test End-to-End

1. Point an IDP proxy plugin endpoint's `target` at this server (see note below) with `oidcUserTokenEnabled: true`.
2. Call the IDP proxy from an authenticated session.
3. Watch this server's console — you'll see the token received, verified, and the decoded claims:

```
[INFO] Received token: eyJhbGciOiJSUzI1NiIsInR5cCI6...
[SUCCESS] Token verified. Claims:
{
  "sub": "user-uuid-12345",
  "account_id": "kmpySmUISimoRrJL6NL73w",
  "aud": "harness-idp",
  "iss": "https://.../oidc/account/kmpySmUISimoRrJL6NL73w",
  "upn": "user@example.com",
  "iat": 1720256400,
  "exp": 1720256460
}
```

## IMPORTANT: Where the proxy endpoint is configured

The external proxy endpoints are **NOT** configured in `idp-service/config/config.yml`.

They are read from **enabled IDP plugin configs stored in the IDP database**
(`AppConfigRepository.findAllByAccountIdentifierAndConfigTypeAndEnabled(accountId, ConfigType.PLUGIN, true)`),
parsing the plugin's stored YAML under the `proxy.endpoints` key. See
`ExternalProxyServiceImpl.getAllProxyEndpointConfigs` and `parseProxyConfigsFromYaml`.

So to register a test endpoint you must add/enable a plugin whose YAML config
contains something like:

```yaml
proxy:
  endpoints:
    test-external-api:
      target: http://<this-server-host>:5000/api/deployment
      allowedMethods:
        - GET
        - POST
      oidcUserTokenEnabled: true
```

For the external system to be reachable from your dev environment, expose this
server publicly (e.g. via ngrok) and set the `target` to that public URL.

## Notes on `iss` (issuer)

The token's `iss` claim is defined by ng-manager's `oidc_config.json`
(`CUSTOM.payload.iss`), NOT hardcoded to `harness-idp`. If you want to validate
`iss`, set `EXPECTED_ISSUER` to match that config value; otherwise leave it empty.
