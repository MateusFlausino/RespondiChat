CREATE TABLE IF NOT EXISTS instagram_accounts (
  id text PRIMARY KEY, username text NOT NULL, encrypted_token text NOT NULL, oauth_user_id text,
  expires_at timestamptz NOT NULL, subscribed boolean NOT NULL DEFAULT false,
  connected_at timestamptz NOT NULL DEFAULT now(), last_webhook_at timestamptz,
  CHECK (id ~ '^[0-9]+$')
);
CREATE UNIQUE INDEX IF NOT EXISTS one_instagram_account ON instagram_accounts ((true));
CREATE TABLE IF NOT EXISTS instagram_media (
  id text PRIMARY KEY, account_id text NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  caption text NOT NULL DEFAULT '', permalink text NOT NULL, media_type text NOT NULL,
  thumbnail_url text, published_at timestamptz, synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY, name text NOT NULL, url text NOT NULL,
  price text NOT NULL DEFAULT '', category text NOT NULL DEFAULT '', emoji text NOT NULL DEFAULT '🛍️',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS automations (
  id uuid PRIMARY KEY, name text NOT NULL, media_id text NOT NULL,
  post_url text NOT NULL, post_label text NOT NULL, keywords jsonb NOT NULL,
  match_mode text NOT NULL CHECK (match_mode IN ('word','exact')),
  message text NOT NULL, product_ids jsonb NOT NULL DEFAULT '[]', active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_rule_per_post ON automations (media_id) WHERE active;
CREATE TABLE IF NOT EXISTS deliveries (
  id uuid PRIMARY KEY, account_id text NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  comment_id text NOT NULL, sender_id text NOT NULL, media_id text NOT NULL,
  automation_id uuid REFERENCES automations(id) ON DELETE SET NULL,
  automation_name text NOT NULL, username text NOT NULL, message text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued','sending','sent','failed','uncertain','skipped')),
  attempts integer NOT NULL DEFAULT 0, error text, meta_message_id text,
  occurred_at timestamptz NOT NULL, next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id,comment_id)
);
CREATE INDEX IF NOT EXISTS deliveries_queue ON deliveries (next_attempt_at,created_at) WHERE status='queued';
CREATE TABLE IF NOT EXISTS rate_buckets (
  account_id text NOT NULL, bucket timestamptz NOT NULL, used integer NOT NULL DEFAULT 0,
  PRIMARY KEY(account_id,bucket)
);
CREATE TABLE IF NOT EXISTS login_attempts (
  key text PRIMARY KEY, window_start timestamptz NOT NULL, attempts integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS deletion_receipts (
  id uuid PRIMARY KEY, completed_at timestamptz NOT NULL DEFAULT now()
);
