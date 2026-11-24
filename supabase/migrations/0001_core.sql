-- SocialHub Pro — core Postgres translation (see ../README.md for scope).
-- Core tables only; the remaining modules follow the same pattern.
-- Reviewed but not executed against a live project in this build.

create extension if not exists "pgcrypto";

-- ── Identity ──────────────────────────────────────────────────────────────────
create table if not exists users (
  id text primary key,
  email text not null unique,
  password_hash text,
  full_name text not null,
  job_title text,
  avatar_color text default '#1677FF',
  timezone text default 'UTC',
  is_super_admin boolean not null default false,
  is_active boolean not null default true,
  notification_prefs jsonb not null default '{}'::jsonb,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists workspaces (
  id text primary key,
  name text not null,
  slug text not null unique,
  timezone text not null default 'UTC',
  logo_color text not null default '#1677FF',
  plan text not null default 'agency',
  is_demo boolean not null default false,
  settings_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists workspace_members (
  id text primary key default gen_random_uuid()::text,
  workspace_id text not null references workspaces(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  role_key text not null,
  client_scope jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table if not exists sessions (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  token_hash text not null unique,
  user_agent text,
  ip text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists sessions_token_idx on sessions (token_hash);

create table if not exists audit_logs (
  id text primary key default gen_random_uuid()::text,
  workspace_id text references workspaces(id) on delete cascade,
  actor_id text references users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  payload jsonb,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists audit_ws_idx on audit_logs (workspace_id, created_at desc);

-- ── Clients ───────────────────────────────────────────────────────────────────
create table if not exists clients (
  id text primary key default gen_random_uuid()::text,
  workspace_id text not null references workspaces(id) on delete cascade,
  name text not null,
  industry text,
  website text,
  contact_name text,
  contact_email text,
  status text not null default 'active',
  approval_required boolean not null default true,
  approval_stages text default 'internal_review,client_approval',
  color text default '#1677FF',
  notes text,
  created_at timestamptz not null default now()
);

-- ── Social accounts & tokens ──────────────────────────────────────────────────
create table if not exists social_accounts (
  id text primary key default gen_random_uuid()::text,
  workspace_id text not null references workspaces(id) on delete cascade,
  client_id text references clients(id) on delete set null,
  platform text not null,
  account_type text not null default 'page',
  external_id text not null,
  name text not null,
  username text,
  status text not null default 'sandbox',
  scopes text,
  followers_count integer,
  last_synced_at timestamptz,
  connected_at timestamptz not null default now(),
  unique (workspace_id, platform, external_id)
);

create table if not exists oauth_tokens (
  id text primary key default gen_random_uuid()::text,
  social_account_id text not null references social_accounts(id) on delete cascade,
  token_type text not null default 'access',
  token_encrypted text not null,
  scopes text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- ── Content ───────────────────────────────────────────────────────────────────
create table if not exists social_posts (
  id text primary key default gen_random_uuid()::text,
  workspace_id text not null references workspaces(id) on delete cascade,
  client_id text references clients(id) on delete set null,
  campaign_id text,
  title text not null,
  caption text,
  hashtags text,
  cta text,
  link_url text,
  content_type text not null default 'image',
  content_pillar text,
  platform text[] not null default '{}',
  status text not null default 'idea',
  priority text not null default 'medium',
  brief text,
  assigned_writer_id text references users(id) on delete set null,
  assigned_designer_id text references users(id) on delete set null,
  reviewer_id text references users(id) on delete set null,
  approval_required boolean not null default true,
  scheduled_at timestamptz,
  published_at timestamptz,
  timezone text default 'UTC',
  reference_files text,
  version integer not null default 1,
  deleted_at timestamptz,
  created_by text references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists posts_ws_sched_idx on social_posts (workspace_id, scheduled_at);
create index if not exists posts_ws_status_idx on social_posts (workspace_id, status);

create table if not exists media_assets (
  id text primary key default gen_random_uuid()::text,
  workspace_id text not null references workspaces(id) on delete cascade,
  folder_id text,
  filename text not null,
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null default 0,
  width integer,
  height integer,
  alt_text text,
  tags jsonb,
  checksum text,
  deleted_at timestamptz,
  created_by text references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists post_media (
  id text primary key default gen_random_uuid()::text,
  post_id text not null references social_posts(id) on delete cascade,
  media_asset_id text references media_assets(id) on delete set null,
  position integer not null default 0,
  kind text default 'image'
);

create table if not exists content_approvals (
  id text primary key default gen_random_uuid()::text,
  workspace_id text not null references workspaces(id) on delete cascade,
  post_id text not null references social_posts(id) on delete cascade,
  stage text not null,
  status text not null default 'pending',
  reviewer_id text references users(id) on delete set null,
  note text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists post_versions (
  id text primary key default gen_random_uuid()::text,
  post_id text not null references social_posts(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  created_by text references users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ── Publishing ────────────────────────────────────────────────────────────────
create table if not exists publishing_jobs (
  id text primary key default gen_random_uuid()::text,
  workspace_id text not null references workspaces(id) on delete cascade,
  post_id text not null references social_posts(id) on delete cascade,
  social_account_id text references social_accounts(id) on delete set null,
  platform text not null,
  quality text not null default 'feed',
  status text not null default 'queued',
  run_at timestamptz not null,
  attempts integer not null default 0,
  idempotency_key text not null unique,
  last_error text,
  scheduled_by text references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists jobs_due_idx on publishing_jobs (status, run_at);

create table if not exists publishing_attempts (
  id text primary key default gen_random_uuid()::text,
  job_id text not null references publishing_jobs(id) on delete cascade,
  attempt integer not null,
  status text not null,
  request jsonb,
  response jsonb,
  error text,
  duration_ms integer,
  created_at timestamptz not null default now()
);

create table if not exists published_posts (
  id text primary key default gen_random_uuid()::text,
  workspace_id text not null references workspaces(id) on delete cascade,
  post_id text not null references social_posts(id) on delete cascade,
  social_account_id text references social_accounts(id) on delete set null,
  platform text not null,
  external_post_id text,
  permalink text,
  channel text not null default 'meta',
  published_at timestamptz not null default now()
);
create unique index if not exists published_unique on published_posts (post_id, social_account_id);

-- ── Analytics ─────────────────────────────────────────────────────────────────
create table if not exists account_metrics (
  id text primary key default gen_random_uuid()::text,
  workspace_id text not null references workspaces(id) on delete cascade,
  social_account_id text not null references social_accounts(id) on delete cascade,
  captured_on date not null,
  followers integer,
  follower_growth integer,
  reach integer,
  impressions integer,
  engagement integer,
  profile_views integer,
  website_clicks integer,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  unique (social_account_id, captured_on, source)
);

create table if not exists post_metrics (
  id text primary key default gen_random_uuid()::text,
  workspace_id text not null references workspaces(id) on delete cascade,
  post_id text not null references social_posts(id) on delete cascade,
  social_account_id text references social_accounts(id) on delete set null,
  captured_on date not null,
  reach integer,
  impressions integer,
  likes integer,
  comments integer,
  shares integer,
  saves integer,
  engagement integer,
  video_views integer,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  unique (post_id, captured_on, source)
);

-- ── Work, reports, notifications ──────────────────────────────────────────────
create table if not exists tasks (
  id text primary key default gen_random_uuid()::text,
  workspace_id text not null references workspaces(id) on delete cascade,
  client_id text references clients(id) on delete set null,
  post_id text references social_posts(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'todo',
  priority text not null default 'medium',
  due_date date,
  created_by text references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists reports (
  id text primary key default gen_random_uuid()::text,
  workspace_id text not null references workspaces(id) on delete cascade,
  client_id text references clients(id) on delete set null,
  name text not null,
  kind text not null,
  period_start date not null,
  period_end date not null,
  format text not null default 'pdf',
  status text not null default 'ready',
  payload jsonb,
  created_by text references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id text primary key default gen_random_uuid()::text,
  workspace_id text not null references workspaces(id) on delete cascade,
  user_id text references users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── RLS ───────────────────────────────────────────────────────────────────────
create or replace function is_workspace_member(ws text)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid() and m.status = 'active'
  );
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'clients','social_accounts','social_posts','media_assets','content_approvals',
    'publishing_jobs','published_posts','account_metrics','post_metrics','tasks',
    'reports','notifications','audit_logs'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "workspace members read" on %I', t);
    execute format(
      'create policy "workspace members read" on %I for select using (is_workspace_member(workspace_id))', t
    );
  end loop;
end $$;

-- Writes stay server-side through the service role; these policies protect
-- direct PostgREST access with a user JWT.
create policy "workspace members insert" on social_posts
  for insert with check (is_workspace_member(workspace_id));
create policy "workspace members update" on social_posts
  for update using (is_workspace_member(workspace_id));

create policy "members read workspace" on workspaces
  for select using (is_workspace_member(id));
create policy "members read clients" on clients
  for select using (is_workspace_member(workspace_id));
