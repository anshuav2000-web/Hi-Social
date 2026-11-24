# Webhook Setup

## Endpoint

```
GET  /api/v1/webhooks/meta   → verification handshake
POST /api/v1/webhooks/meta   → signed event deliveries
```

## 1. Configure in Meta

Webhooks → Page (and Instagram) → **Callback URL**:

```
https://<your-origin>/api/v1/webhooks/meta
```

**Verify token**: same string as `META_WEBHOOK_VERIFY_TOKEN`.

Meta immediately calls `GET` with `hub.mode=subscribe`, `hub.verify_token`, `hub.challenge`. The handler compares the token in
constant time and echoes `hub.challenge` as plain text. A mismatch returns 403.

## 2. Subscribe to fields

| Object | Field | Used for |
| --- | --- | --- |
| `page` | `feed` | Comments on Page posts |
| `page` | `messages` | DMs (extra permission required) |
| `instagram` | `comments` | IG comment threads |
| `instagram` | `mentions` | Optional mention tracking |

## 3. Signature verification

Every `POST` carries `X-Hub-Signature-256: sha256=<hex>`, an HMAC-SHA256 of the **raw request body** keyed with
`META_APP_SECRET`.

```ts
const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
const received = header.replace("sha256=", "");
if (expected.length !== received.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(received))) reject();
```

The raw body must be read **before** JSON parsing. Invalid signatures are stored with `signature_valid = 0`, logged as a security
event, and never processed. The endpoint returns 200 quickly so Meta does not retry a rejected payload forever.

## 4. Idempotency

Meta retries. Each delivery is keyed as `object:entry.id:entry.time` in `integration_webhooks.external_id` (unique index). A repeat
returns `{ duplicates: n }` without creating a second conversation or notification.

## 5. What is processed

- **comments** → upsert `inbox_conversations` (+ first `inbox_messages` row), notify the assignee, link to the post when the id is
  known.
- **messages** → conversation of kind `message` when the permission is present.
- Unknown fields are stored for inspection but not acted on.

Comment replies from the app go out through:
`POST /{comment-id}/replies` (Facebook) or `POST /{ig-comment-id}/replies` (Instagram). Without a live token the reply is recorded
in the thread as `channel = sandbox` and labelled.

## 6. Local development

Meta cannot reach `localhost`. Use a tunnel:

```bash
cloudflared tunnel --url http://localhost:3000
# or: ngrok http 3000
```

Set `APP_ORIGIN` and `META_REDIRECT_URI` to the tunnel origin, register the tunnel URL as the callback, then trigger a test
comment. Check **Integrations → Webhook deliveries** for `signature_valid` and status.

## 7. Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| Verification returns 403 | Token mismatch | Re-copy `META_WEBHOOK_VERIFY_TOKEN` |
| `signature invalid` rows | Wrong app secret, proxy altering body | Use the exact raw body; disable body-rewriting middleware |
| No rows at all | Not subscribed to the field | Subscribe in Meta and resend a test notification |
| Duplicate conversations | Missing unique index | Ensure `integration_webhooks.external_id` is unique |
| 500 on delivery | Handler bug | Meta retries; inspect logs and `/admin` |
