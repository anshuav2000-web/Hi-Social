# OAuth Setup

SocialHub Pro supports two Meta authorisation paths. Both end at the same callback;
`state` handling, token storage and account import are shared.

## Flow A — Facebook Login (Pages + linked Instagram)

```
User clicks "Connect with Facebook"
        │  POST /api/v1/integrations/meta/start { flow: "facebook" }
        ▼
Server creates oauth_states row (random state, PKCE verifier, 10 min TTL, user + workspace)
        │  302 → https://www.facebook.com/v23.0/dialog/oauth
        ▼
Meta consent screen (pages_show_list, pages_manage_posts, instagram_content_publish, ...)
        │  302 → /api/v1/integrations/meta/callback?code=...&state=...
        ▼
Callback: validate state (single use) → exchange code → extend to long-lived token
        │
        ├─ GET /me/accounts                → Pages + page tokens
        ├─ GET /{page-id}?fields=instagram_business_account
        └─ GET /{ig-id}?fields=username,followers_count
        ▼
Encrypt tokens (AES-256-GCM) → upsert social_accounts + oauth_tokens → redirect with status
```

Page tokens are stored per Page; the Instagram account reuses the linked Page token, which is what the Graph API expects for
`instagram_content_publish`.

## Flow B — Instagram Login (direct)

```
POST /api/v1/integrations/meta/start { flow: "instagram" }
   → https://www.instagram.com/oauth/authorize?client_id=...&scope=instagram_business_basic,...
   → https://api.instagram.com/oauth/access_token (code → short-lived)
   → https://graph.instagram.com/access_token (short-lived → long-lived)
   → GET /me?fields=user_id,username,account_type
```

Scopes are `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_comments`,
`instagram_business_manage_insights`. Only Business/Creator accounts are accepted.

## State and CSRF

- `state` is 32 random bytes (base64url), stored with `user_id`, `workspace_id`, `flow`, `code_verifier`, `expires_at`.
- The callback rejects unknown, expired or already-consumed states, and requires the current session to own the state.
- PKCE (`S256`) is used where the provider supports it.
- The callback never trusts query parameters for identity: the workspace comes from the stored state row.

## Token lifecycle

| Stage | Behaviour |
| --- | --- |
| Storage | Encrypted (`v1.iv.tag.data`), never returned by any endpoint |
| Expiry | `oauth_tokens.expires_at`; UI warns when expired |
| Refresh | Long-lived Page tokens are refreshed on reauthorisation; expiring user tokens use the `fb_exchange_token` grant |
| Revocation | “Disconnect” deletes tokens and sets the account `disconnected`; publishing falls back to sandbox |
| Failure | Graph error `190` marks the account as needing reauthorisation and surfaces in Integrations |

## Required environment

```env
APP_ORIGIN=https://social.example.com
META_APP_ID=...
META_APP_SECRET=...
META_REDIRECT_URI=https://social.example.com/api/v1/integrations/meta/callback
META_GRAPH_VERSION=v23.0
```

`META_REDIRECT_URI` must match the Meta app configuration exactly.

## Testing without Meta credentials

Nothing is faked: “Connect with Facebook” returns a clear configuration error instead of opening a broken dialog. Seeded accounts
stay `sandbox`, publishing records `channel = 'sandbox'`, and the UI labels those results. To exercise the live path you need real
credentials and at least one Page you administer.

## Supabase / external identity

If you replace local auth with Supabase Auth, keep the callback contract: the state row must store the authenticated user and active
workspace, and the callback must resolve them server-side. Do not accept a workspace id from the query string.

## Security checklist

- [ ] `oauth_states` rows expire in 10 minutes and are deleted after use.
- [ ] Tokens encrypted at rest; key not committed.
- [ ] Callback validates state before any token exchange.
- [ ] No token or app secret ever reaches a client component.
- [ ] Disconnect removes stored tokens.
- [ ] Audit log records connect, disconnect and sync actions.
