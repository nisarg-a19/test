# Deploy Mock External System to Vercel

This mock external system verifies the `X-Harness-IDP-User-Token` JWT injected by the IDP external proxy. Deploy it to Vercel to test against a real Harness environment.

## Prerequisites

- Node.js 18+ installed locally
- Vercel CLI: `npm i -g vercel`
- Vercel account (free tier works)

## Deployment Steps

### 1. Install dependencies (if not already installed)

```bash
cd idp-service/external-system-test
npm install
```

### 2. Login to Vercel

```bash
vercel login
```

### 3. Deploy

```bash
vercel
```

Follow the prompts:
- **Set and deploy?** → `Y`
- **Project name** → press Enter (default: `idp-external-system-test`)
- **Link to existing project?** → `N`
- **Scope** → select your account/team
- **Build command** → leave blank (Vercel auto-detects)
- **Output directory** → leave blank
- **Override settings?** → `N` (uses `vercel.json`)

Vercel will deploy and give you a URL like:
```
https://idp-external-system-test-xxx.vercel.app
```

### 4. Configure environment variables (optional)

The `vercel.json` file already sets defaults:
- `HARNESS_ACCOUNT_ID` = `GCOCLlOsR9-ysFlbwaF_Yw`
- `HARNESS_BASE_URL` = `https://munklinde96.pr2.harness.io`
- `EXPECTED_AUDIENCE` = `harness-idp`
- `ALLOWED_EMAIL` = `admin@harness.io`

To override them:

```bash
vercel env add HARNESS_ACCOUNT_ID
vercel env add HARNESS_BASE_URL
vercel env add EXPECTED_AUDIENCE
vercel env add ALLOWED_EMAIL
```

Then redeploy:
```bash
vercel --prod
```

### 5. Test the deployment

```bash
curl https://your-deployment-url.vercel.app/health
```

Expected response:
```json
{
  "status": "ok",
  "jwksUri": "https://munklinde96.pr2.harness.io/oidc/account/GCOCLlOsR9-ysFlbwaF_Yw/.wellknown/jwks"
}
```

## Using with IDP Proxy

Update your IDP plugin proxy config to point to the Vercel URL:

```yaml
proxy:
  - endpoint: /my-external-service
    target: https://your-deployment-url.vercel.app
    oidcUserTokenEnabled: true
    oidcAudience: harness-idp
```

## File Structure

```
external-system-test/
├── api/
│   └── index.js          # Vercel serverless function entry point
├── server.js             # Express app (shared)
├── package.json          # Dependencies
├── vercel.json           # Vercel config + env vars
└── VERCEL_DEPLOYMENT.md  # This file
```

## Notes

- Vercel's free tier has 100GB bandwidth/month and 100GB-hrs execution — sufficient for testing.
- The server is stateless; JWKS caching is in-memory per request (Vercel serverless functions are short-lived).
- If you need persistent caching, add Redis or use Vercel Edge Config.
