-- ============================================================
-- SocialHub Pro — schema (SQLite dialect, v1)
-- Every tenant-owned row carries workspace_id for isolation.
-- Timestamps are ISO-8601 UTC strings. Booleans are INTEGER 0/1.
-- ============================================================

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

-- ── Identity ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                 TEXT PRIMARY KEY,
  email              TEXT NOT NULL UNIQUE,
  password_hash      TEXT NOT NULL,
  full_name          TEXT NOT NULL,
  job_title          TEXT,
  avatar_color       TEXT NOT NULL DEFAULT '#1677FF',
  timezone           TEXT NOT NULL DEFAULT 'UTC',
  locale             TEXT NOT NULL DEFAULT 'en',
  is_super_admin     INTEGER NOT NULL DEFAULT 0,
  notification_prefs TEXT NOT NULL DEFAULT '{"email":true,"inApp":true,"browser":false,"digest":"weekly"}',
  is_active          INTEGER NOT NULL DEFAULT 1,
  last_login_at      TEXT,
  created_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  ip         TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reset_user ON password_reset_tokens(user_id);

CREATE TABLE IF NOT EXISTS workspaces (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  owner_id      TEXT NOT NULL REFERENCES users(id),
  plan          TEXT NOT NULL DEFAULT 'agency',
  timezone      TEXT NOT NULL DEFAULT 'UTC',
  logo_color    TEXT NOT NULL DEFAULT '#1677FF',
  is_demo       INTEGER NOT NULL DEFAULT 0,
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_members (
  id             TEXT PRIMARY KEY,
  workspace_id   TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id        TEXT REFERENCES users(id) ON DELETE CASCADE,
  role_key       TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'active',
  invited_email  TEXT,
  invited_by     TEXT,
  client_scope   TEXT,
  created_at     TEXT NOT NULL,
  UNIQUE (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_wm_workspace ON workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_wm_user ON workspace_members(user_id);

CREATE TABLE IF NOT EXISTS roles (
  key         TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  is_system   INTEGER NOT NULL DEFAULT 1,
  rank        INTEGER NOT NULL DEFAULT 50
);

CREATE TABLE IF NOT EXISTS permissions (
  key         TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  category    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_key       TEXT NOT NULL REFERENCES roles(key) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
  PRIMARY KEY (role_key, permission_key)
);

-- ── Clients, brands, accounts ───────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id                TEXT PRIMARY KEY,
  workspace_id      TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  industry          TEXT,
  website           TEXT,
  contact_name      TEXT,
  contact_email     TEXT,
  status            TEXT NOT NULL DEFAULT 'active',
  approval_required INTEGER NOT NULL DEFAULT 1,
  approval_stages   TEXT NOT NULL DEFAULT 'internal_review,client_approval',
  notes             TEXT,
  color             TEXT NOT NULL DEFAULT '#1677FF',
  created_at        TEXT NOT NULL,
  UNIQUE (workspace_id, name)
);
CREATE INDEX IF NOT EXISTS idx_clients_ws ON clients(workspace_id);

CREATE TABLE IF NOT EXISTS brand_profiles (
  id                  TEXT PRIMARY KEY,
  workspace_id        TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  client_id           TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  brand_name          TEXT NOT NULL,
  personality         TEXT,
  tone                TEXT,
  audience            TEXT,
  industry            TEXT,
  languages           TEXT,
  writing_style       TEXT,
  words_to_avoid      TEXT,
  content_rules       TEXT,
  competitor_refs     TEXT,
  guidelines_url      TEXT,
  updated_at          TEXT NOT NULL,
  created_at          TEXT NOT NULL,
  UNIQUE (workspace_id, client_id)
);

CREATE TABLE IF NOT EXISTS oauth_connections (
  id               TEXT PRIMARY KEY,
  workspace_id     TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id          TEXT NOT NULL REFERENCES users(id),
  provider         TEXT NOT NULL,
  external_user_id TEXT,
  scopes           TEXT,
  expires_at       TEXT,
  created_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conn_ws ON oauth_connections(workspace_id);

CREATE TABLE IF NOT EXISTS oauth_tokens (
  id                 TEXT PRIMARY KEY,
  connection_id      TEXT NOT NULL REFERENCES oauth_connections(id) ON DELETE CASCADE,
  social_account_id  TEXT,
  provider           TEXT NOT NULL,
  access_token_enc   TEXT NOT NULL,
  refresh_token_enc  TEXT,
  token_type         TEXT DEFAULT 'bearer',
  expires_at         TEXT,
  scopes             TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tokens_conn ON oauth_tokens(connection_id);

CREATE TABLE IF NOT EXISTS social_accounts (
  id               TEXT PRIMARY KEY,
  workspace_id     TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  client_id        TEXT REFERENCES clients(id) ON DELETE SET NULL,
  platform         TEXT NOT NULL,
  account_type     TEXT NOT NULL DEFAULT 'page',
  external_id      TEXT NOT NULL,
  name             TEXT NOT NULL,
  username         TEXT,
  avatar_url       TEXT,
  followers_count  INTEGER,
  status           TEXT NOT NULL DEFAULT 'connected',
  token_expires_at TEXT,
  scopes           TEXT,
  meta_json        TEXT NOT NULL DEFAULT '{}',
  connected_at     TEXT NOT NULL,
  last_synced_at   TEXT,
  UNIQUE (workspace_id, platform, external_id)
);
CREATE INDEX IF NOT EXISTS idx_accounts_ws ON social_accounts(workspace_id);

-- ── Campaigns, ideas, posts ─────────────────────────────────
CREATE TABLE IF NOT EXISTS campaigns (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  client_id     TEXT REFERENCES clients(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  objective     TEXT,
  audience      TEXT,
  budget_cents  INTEGER,
  currency      TEXT DEFAULT 'USD',
  platforms     TEXT,
  start_date    TEXT,
  end_date      TEXT,
  status        TEXT NOT NULL DEFAULT 'draft',
  deliverables  TEXT,
  notes         TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_campaigns_ws ON campaigns(workspace_id);

CREATE TABLE IF NOT EXISTS content_ideas (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  client_id    TEXT REFERENCES clients(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  idea         TEXT,
  audience     TEXT,
  pillar       TEXT,
  platform     TEXT,
  source       TEXT DEFAULT 'manual',
  status       TEXT NOT NULL DEFAULT 'open',
  created_by   TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ideas_ws ON content_ideas(workspace_id);

CREATE TABLE IF NOT EXISTS social_posts (
  id                  TEXT PRIMARY KEY,
  workspace_id        TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  client_id           TEXT REFERENCES clients(id) ON DELETE SET NULL,
  campaign_id         TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
  title               TEXT NOT NULL,
  caption             TEXT,
  description         TEXT,
  hashtags            TEXT,
  mentions            TEXT,
  cta                 TEXT,
  location_name       TEXT,
  platform            TEXT NOT NULL DEFAULT 'instagram',
  content_type        TEXT NOT NULL DEFAULT 'image',
  content_pillar      TEXT,
  internal_notes      TEXT,
  first_comment       TEXT,
  alt_text            TEXT,
  status              TEXT NOT NULL DEFAULT 'idea',
  priority            TEXT NOT NULL DEFAULT 'medium',
  assigned_writer_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
  assigned_designer_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewer_id         TEXT REFERENCES users(id) ON DELETE SET NULL,
  deadline            TEXT,
  scheduled_at        TEXT,
  timezone            TEXT NOT NULL DEFAULT 'UTC',
  published_at        TEXT,
  external_post_id    TEXT,
  external_url        TEXT,
  media_ready         INTEGER NOT NULL DEFAULT 0,
  approval_required   INTEGER NOT NULL DEFAULT 1,
  created_by          TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  archived_at         TEXT
);
CREATE INDEX IF NOT EXISTS idx_posts_ws ON social_posts(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_posts_sched ON social_posts(workspace_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_posts_client ON social_posts(client_id);

CREATE TABLE IF NOT EXISTS post_platforms (
  id       TEXT PRIMARY KEY,
  post_id  TEXT NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  UNIQUE (post_id, platform)
);

CREATE TABLE IF NOT EXISTS post_media (
  id             TEXT PRIMARY KEY,
  post_id        TEXT NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  media_asset_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  position       INTEGER NOT NULL DEFAULT 0,
  role           TEXT NOT NULL DEFAULT 'attachment'
);
CREATE INDEX IF NOT EXISTS idx_post_media_post ON post_media(post_id);

CREATE TABLE IF NOT EXISTS content_briefs (
  id                    TEXT PRIMARY KEY,
  workspace_id          TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  post_id               TEXT NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  brief                 TEXT,
  creative_requirements TEXT,
  reference_files       TEXT,
  target_audience       TEXT,
  updated_at            TEXT NOT NULL,
  UNIQUE (post_id)
);

CREATE TABLE IF NOT EXISTS content_versions (
  id            TEXT PRIMARY KEY,
  post_id       TEXT NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  version_no    INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  changed_by    TEXT,
  created_at    TEXT NOT NULL,
  UNIQUE (post_id, version_no)
);

CREATE TABLE IF NOT EXISTS content_comments (
  id         TEXT PRIMARY KEY,
  post_id    TEXT NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cc_post ON content_comments(post_id);

CREATE TABLE IF NOT EXISTS content_approvals (
  id          TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  post_id     TEXT NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  stage       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  reviewer_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  decided_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  feedback    TEXT,
  due_at      TEXT,
  created_at  TEXT NOT NULL,
  decided_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_ca_post ON content_approvals(post_id);
CREATE INDEX IF NOT EXISTS idx_ca_ws ON content_approvals(workspace_id, status);

CREATE TABLE IF NOT EXISTS campaign_posts (
  id          TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  post_id     TEXT NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  UNIQUE (campaign_id, post_id)
);

-- ── Tasks & workflow ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id                 TEXT PRIMARY KEY,
  workspace_id       TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  client_id          TEXT REFERENCES clients(id) ON DELETE SET NULL,
  post_id            TEXT REFERENCES social_posts(id) ON DELETE SET NULL,
  title              TEXT NOT NULL,
  description        TEXT,
  kind               TEXT NOT NULL DEFAULT 'other',
  status             TEXT NOT NULL DEFAULT 'todo',
  priority           TEXT NOT NULL DEFAULT 'medium',
  assignee_id        TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewer_id        TEXT REFERENCES users(id) ON DELETE SET NULL,
  due_date           TEXT,
  parent_task_id     TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  recurring_rule     TEXT,
  created_by         TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at         TEXT NOT NULL,
  completed_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_tasks_ws ON tasks(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);

CREATE TABLE IF NOT EXISTS task_assignees (
  id      TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (task_id, user_id)
);

CREATE TABLE IF NOT EXISTS task_comments (
  id         TEXT PRIMARY KEY,
  task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_attachments (
  id             TEXT PRIMARY KEY,
  task_id        TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  media_asset_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
  name           TEXT NOT NULL,
  url            TEXT,
  created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_checklist_items (
  id       TEXT PRIMARY KEY,
  task_id  TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  label    TEXT NOT NULL,
  is_done  INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0
);

-- ── Media library ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS media_folders (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  client_id    TEXT REFERENCES clients(id) ON DELETE SET NULL,
  parent_id    TEXT REFERENCES media_folders(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS media_assets (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  client_id    TEXT REFERENCES clients(id) ON DELETE SET NULL,
  folder_id    TEXT REFERENCES media_folders(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'image',
  mime_type    TEXT NOT NULL,
  size_bytes   INTEGER NOT NULL DEFAULT 0,
  width        INTEGER,
  height       INTEGER,
  storage_path TEXT,
  url          TEXT,
  thumb_url    TEXT,
  tags         TEXT,
  alt_text     TEXT,
  checksum     TEXT,
  usage_count  INTEGER NOT NULL DEFAULT 0,
  uploaded_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL,
  deleted_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_media_ws ON media_assets(workspace_id);

CREATE TABLE IF NOT EXISTS hashtag_collections (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  client_id    TEXT REFERENCES clients(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  tags         TEXT NOT NULL,
  notes        TEXT,
  platform     TEXT,
  created_by   TEXT,
  created_at   TEXT NOT NULL
);

-- ── Publishing ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS publishing_jobs (
  id                TEXT PRIMARY KEY,
  workspace_id      TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  post_id           TEXT NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  social_account_id TEXT NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  platform          TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'queued',
  run_at            TEXT NOT NULL,
  attempts          INTEGER NOT NULL DEFAULT 0,
  max_attempts      INTEGER NOT NULL DEFAULT 5,
  idempotency_key   TEXT NOT NULL UNIQUE,
  last_error        TEXT,
  locked_at         TEXT,
  worker_id         TEXT,
  channel           TEXT NOT NULL DEFAULT 'sandbox',
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  finished_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_due ON publishing_jobs(status, run_at);
CREATE INDEX IF NOT EXISTS idx_jobs_ws ON publishing_jobs(workspace_id, status);

CREATE TABLE IF NOT EXISTS publishing_attempts (
  id            TEXT PRIMARY KEY,
  job_id        TEXT NOT NULL REFERENCES publishing_jobs(id) ON DELETE CASCADE,
  attempt_no    INTEGER NOT NULL,
  status        TEXT NOT NULL,
  http_status   INTEGER,
  response_body TEXT,
  error         TEXT,
  started_at    TEXT NOT NULL,
  finished_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_attempts_job ON publishing_attempts(job_id);

CREATE TABLE IF NOT EXISTS published_posts (
  id                TEXT PRIMARY KEY,
  workspace_id      TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  post_id           TEXT NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  social_account_id TEXT REFERENCES social_accounts(id) ON DELETE SET NULL,
  platform          TEXT NOT NULL,
  external_post_id  TEXT,
  url               TEXT,
  channel           TEXT NOT NULL DEFAULT 'sandbox',
  published_at      TEXT NOT NULL,
  raw_json          TEXT
);
CREATE INDEX IF NOT EXISTS idx_published_ws ON published_posts(workspace_id);

CREATE TABLE IF NOT EXISTS queue_state (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  is_paused    INTEGER NOT NULL DEFAULT 0,
  paused_by    TEXT,
  updated_at   TEXT NOT NULL
);

-- ── Analytics ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS post_metrics (
  id                TEXT PRIMARY KEY,
  workspace_id      TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  post_id           TEXT REFERENCES social_posts(id) ON DELETE CASCADE,
  social_account_id TEXT REFERENCES social_accounts(id) ON DELETE CASCADE,
  platform          TEXT NOT NULL,
  captured_at       TEXT NOT NULL,
  impressions       INTEGER,
  reach             INTEGER,
  likes             INTEGER,
  comments          INTEGER,
  shares            INTEGER,
  saves             INTEGER,
  views             INTEGER,
  video_views       INTEGER,
  clicks            INTEGER,
  engagement        INTEGER,
  engagement_rate   REAL,
  source            TEXT NOT NULL DEFAULT 'demo'
);
CREATE INDEX IF NOT EXISTS idx_pm_ws ON post_metrics(workspace_id, captured_at);
CREATE INDEX IF NOT EXISTS idx_pm_post ON post_metrics(post_id);

CREATE TABLE IF NOT EXISTS account_metrics (
  id                TEXT PRIMARY KEY,
  workspace_id      TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  social_account_id TEXT NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  platform          TEXT NOT NULL,
  captured_on       TEXT NOT NULL,
  followers         INTEGER,
  follower_growth   INTEGER,
  impressions       INTEGER,
  reach             INTEGER,
  profile_views     INTEGER,
  engagement        INTEGER,
  source            TEXT NOT NULL DEFAULT 'demo',
  UNIQUE (social_account_id, captured_on)
);
CREATE INDEX IF NOT EXISTS idx_am_ws ON account_metrics(workspace_id, captured_on);

CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  client_id    TEXT REFERENCES clients(id) ON DELETE SET NULL,
  granularity  TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end   TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

-- ── Inbox ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inbox_conversations (
  id                     TEXT PRIMARY KEY,
  workspace_id           TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  client_id              TEXT REFERENCES clients(id) ON DELETE SET NULL,
  social_account_id      TEXT REFERENCES social_accounts(id) ON DELETE SET NULL,
  platform               TEXT NOT NULL,
  external_id            TEXT,
  kind                   TEXT NOT NULL DEFAULT 'comment',
  subject                TEXT,
  participant_name       TEXT,
  participant_handle     TEXT,
  status                 TEXT NOT NULL DEFAULT 'open',
  priority               TEXT NOT NULL DEFAULT 'normal',
  assignee_id            TEXT REFERENCES users(id) ON DELETE SET NULL,
  labels                 TEXT,
  post_ref               TEXT,
  first_response_seconds INTEGER,
  last_message_at        TEXT,
  created_at             TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conv_ws ON inbox_conversations(workspace_id, status);

CREATE TABLE IF NOT EXISTS inbox_messages (
  id                TEXT PRIMARY KEY,
  conversation_id   TEXT NOT NULL REFERENCES inbox_conversations(id) ON DELETE CASCADE,
  direction         TEXT NOT NULL DEFAULT 'inbound',
  author_name       TEXT,
  author_external_id TEXT,
  body              TEXT NOT NULL,
  external_id       TEXT,
  is_read           INTEGER NOT NULL DEFAULT 0,
  sent_by           TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON inbox_messages(conversation_id);

-- ── Notifications ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      TEXT REFERENCES users(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,
  title        TEXT NOT NULL,
  body         TEXT,
  link         TEXT,
  is_read      INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read);

-- ── Automation ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS automations (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  trigger_key     TEXT NOT NULL,
  conditions_json TEXT NOT NULL DEFAULT '[]',
  actions_json    TEXT NOT NULL DEFAULT '[]',
  is_enabled      INTEGER NOT NULL DEFAULT 1,
  last_run_at     TEXT,
  run_count       INTEGER NOT NULL DEFAULT 0,
  created_by      TEXT,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS automation_runs (
  id            TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  trigger_event TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'succeeded',
  log           TEXT,
  duration_ms   INTEGER,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_runs_auto ON automation_runs(automation_id);

-- ── Reports ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  client_id    TEXT REFERENCES clients(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'monthly',
  period_start TEXT,
  period_end   TEXT,
  format       TEXT NOT NULL DEFAULT 'pdf',
  status       TEXT NOT NULL DEFAULT 'ready',
  payload_json TEXT,
  created_by   TEXT,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS report_schedules (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  client_id    TEXT REFERENCES clients(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'weekly',
  cadence      TEXT NOT NULL DEFAULT 'weekly',
  format       TEXT NOT NULL DEFAULT 'pdf',
  recipients   TEXT,
  next_run_at  TEXT,
  is_enabled   INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL
);

-- ── Research ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS competitor_profiles (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  client_id    TEXT REFERENCES clients(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  platform     TEXT,
  handle       TEXT,
  url          TEXT,
  notes        TEXT,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS competitor_references (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  competitor_id TEXT REFERENCES competitor_profiles(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  url           TEXT,
  platform      TEXT,
  notes         TEXT,
  tags          TEXT,
  saved_at      TEXT NOT NULL
);

-- ── Platform plumbing ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS integration_webhooks (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL,
  event           TEXT NOT NULL,
  external_id     TEXT,
  signature_valid INTEGER NOT NULL DEFAULT 0,
  payload_json    TEXT,
  status          TEXT NOT NULL DEFAULT 'received',
  error           TEXT,
  processed_at    TEXT,
  created_at      TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_dedupe ON integration_webhooks(provider, external_id);

CREATE TABLE IF NOT EXISTS sync_jobs (
  id                TEXT PRIMARY KEY,
  workspace_id      TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  social_account_id TEXT REFERENCES social_accounts(id) ON DELETE CASCADE,
  kind              TEXT NOT NULL DEFAULT 'history',
  status            TEXT NOT NULL DEFAULT 'queued',
  progress          INTEGER NOT NULL DEFAULT 0,
  records           INTEGER NOT NULL DEFAULT 0,
  error             TEXT,
  started_at        TEXT,
  finished_at       TEXT,
  created_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sync_ws ON sync_jobs(workspace_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,
  entity_type   TEXT,
  entity_id     TEXT,
  metadata_json TEXT,
  ip            TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_ws ON audit_logs(workspace_id, created_at);

CREATE TABLE IF NOT EXISTS security_events (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      TEXT,
  kind         TEXT NOT NULL,
  severity     TEXT NOT NULL DEFAULT 'info',
  detail       TEXT,
  ip           TEXT,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS api_idempotency (
  key           TEXT PRIMARY KEY,
  scope         TEXT NOT NULL,
  response_json TEXT,
  created_at    TEXT NOT NULL
);
