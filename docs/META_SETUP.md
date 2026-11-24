# Meta Setup (Instagram + Facebook Pages)

This is the complete path from zero to live publishing. Steps 1–6 are yours in the Meta dashboard; 7–10 happen inside SocialHub Pro.
App Review is a manual Meta process — this app cannot complete it and never claims it is done.

## 1. Create the app

<https://developers.facebook.com/apps> → **Create app** → use case **Business**.

Record:
- **App ID** → `META_APP_ID`
- **App Secret** → `META_APP_SECRET` (App settings → Basic)

## 2. Add products

- **Facebook Login for Business** — used by the “Connect with Facebook” flow (Pages + linked Instagram professional accounts).
- **Instagram** → *API setup with Facebook login* (or **Instagram Login** if you want the direct Instagram flow).

## 3. Redirect URIs

Facebook Login for Business → Settings → **Valid OAuth Redirect URIs**:

```
https://<your-origin>/api/v1/integrations/meta/callback
```

`META_REDIRECT_URI` must be identical, including scheme, trailing path and no trailing slash.

For Instagram Login, add the same URL under Instagram → API setup → **OAuth redirect URI**.

## 4. Environment

```env
APP_ORIGIN=https://social.example.com
META_APP_ID=1234567890
META_APP_SECRET=xxxxxxxxxxxxxxxx
META_REDIRECT_URI=https://social.example.com/api/v1/integrations/meta/callback
META_GRAPH_VERSION=v23.0
META_WEBHOOK_VERIFY_TOKEN=choose-a-long-random-string
```

Restart the app. `/integrations` should show **Configured**.

## 5. Permissions

Requested by the Facebook flow:

`pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_manage_engagement`, `read_insights`,
`instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`, `instagram_manage_insights`, `business_management`.

Instagram Login flow requests the Instagram-scoped equivalents plus `instagram_business_manage_messages` only if you need DMs.

Permission models are never mixed in one token: the callback keeps each flow's scopes intact.

## 6. Webhooks

Webhooks → **Page** (and **Instagram** if used) → Callback URL:

```
https://<your-origin>/api/v1/webhooks/meta
```

Verify token: the value of `META_WEBHOOK_VERIFY_TOKEN`. Subscribe to `comments` (and `messages` if approved). See
[`WEBHOOK_SETUP.md`](WEBHOOK_SETUP.md).

## 7. Connect accounts

In **Integrations → Connect with Facebook**, authorise. The callback:

1. Verifies the signed `state` (10-minute TTL, single use).
2. Exchanges the code for a user token and extends it to a long-lived token.
3. Lists Pages the user manages, then each Page's `instagram_business_account`.
4. Stores one `social_accounts` row per Page and per linked IG account, with **encrypted** tokens.
5. Redirects to `/integrations?meta=connected&accounts=N`.

Unlinked Instagram accounts are skipped — they cannot be published to. Accounts imported before configuration stay `sandbox` until
reauthorised.

## 8. Instagram requirements

- The IG account must be **Business or Creator**.
- It must be linked to a Facebook Page you administer.
- Publishing requires an image or video reachable over HTTPS (or uploaded through this app, which exposes a signed URL).

## 9. App Review

Required for use beyond app admins/testers:

| Permission | Why |
| --- | --- |
| `instagram_content_publish` | Publish IG media |
| `instagram_manage_comments` | Read/reply to comments |
| `pages_manage_posts` | Publish to Pages |
| `pages_manage_engagement` | Reply to Page comments |
| `read_insights` / `instagram_manage_insights` | Analytics |

Prepare a screencast showing the full flow (connect → create → approve → publish → see the live post) and a written description of
each permission's use. Review typically takes days to weeks.

## 10. Go live

Switch the app to **Live** in the Meta dashboard, then reauthorise accounts in Integrations. New publishing jobs pick the live
channel automatically; historical sandbox rows keep `channel = 'sandbox'`.

## How delivery works

| Content | Endpoint |
| --- | --- |
| Facebook photo post | `POST /{page-id}/photos` (`url`, `caption`) |
| Facebook text/link | `POST /{page-id}/feed` |
| Instagram image | `POST /{ig-id}/media` → `media_publish` |
| Instagram carousel | child containers → parent container → `media_publish` |
| Instagram reel | `media_type=REELS`, `video_url`, poll `status_code` |
| Instagram story | `media_type=STORIES` |

Container status is polled (`IN_PROGRESS` → `FINISHED`); `ERROR` surfaces the platform message in `publishing_attempts` and the queue.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `(#10) Application does not have permission` | App Review missing or wrong user role | Use an admin/tester account or complete review |
| `Invalid OAuth redirect URI` | Mismatch between app setting and env | Copy the exact URI, no trailing slash |
| `(#190) Invalid OAuth access token` | Token expired/revoked | Reauthorise the account |
| `(#4) Application request limit reached` | Rate limit | Job requeues automatically; reduce burst |
| `Media not found` / `url invalid` | Signed URL not publicly reachable | Ensure `APP_ORIGIN` is public HTTPS |
| Webhook verification fails | Wrong verify token or path | Compare `META_WEBHOOK_VERIFY_TOKEN`, use `/api/v1/webhooks/meta` |
| Nothing publishes | `ENABLE_INPROCESS_SCHEDULER=false` and no worker | Start `worker` service or flip the flag |

Useful: **Integrations** shows token expiry per account; **Admin → Integration health** shows failing syncs and invalid webhook
signatures; **Publishing Queue** shows every attempt with the platform error.
