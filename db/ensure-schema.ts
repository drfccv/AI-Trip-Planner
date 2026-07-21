import { env } from "cloudflare:workers";

let ready: Promise<void> | null = null;

const schema = [
  `CREATE TABLE IF NOT EXISTS users (id text PRIMARY KEY NOT NULL, email text NOT NULL, display_name text NOT NULL, created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq ON users (email)`,
  `CREATE TABLE IF NOT EXISTS anonymous_creation_limits (bucket_key text PRIMARY KEY NOT NULL, count integer DEFAULT 0 NOT NULL, expires_at text NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS trips (id text PRIMARY KEY NOT NULL, user_id text NOT NULL, title text NOT NULL, destination text NOT NULL, start_date text NOT NULL, end_date text NOT NULL, status text DEFAULT 'draft' NOT NULL, revision integer DEFAULT 1 NOT NULL, currency text DEFAULT 'CNY' NOT NULL, budget_total real, constraints_json text DEFAULT '{}' NOT NULL, source_type text DEFAULT 'user_added' NOT NULL, created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`,
  `CREATE INDEX IF NOT EXISTS trips_user_idx ON trips (user_id)`,
  `CREATE TABLE IF NOT EXISTS trip_days (id text PRIMARY KEY NOT NULL, trip_id text NOT NULL, day_index integer NOT NULL, date text NOT NULL, title text NOT NULL, weather_json text, summary_json text DEFAULT '{}' NOT NULL, created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL, FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS trip_days_trip_index_uq ON trip_days (trip_id, day_index)`,
  `CREATE TABLE IF NOT EXISTS places (id text PRIMARY KEY NOT NULL, provider text NOT NULL, provider_place_id text, name text NOT NULL, address text, latitude real, longitude real, category text, source_type text NOT NULL, verified_at text, raw_json text DEFAULT '{}' NOT NULL, created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS itinerary_items (id text PRIMARY KEY NOT NULL, trip_id text NOT NULL, day_id text NOT NULL, place_id text, type text NOT NULL, title text NOT NULL, start_time text NOT NULL, duration_minutes integer NOT NULL, position integer NOT NULL, notes text DEFAULT '' NOT NULL, locked integer DEFAULT false NOT NULL, lock_time integer DEFAULT false NOT NULL, source_type text NOT NULL, cost real, metadata_json text DEFAULT '{}' NOT NULL, created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL, FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE, FOREIGN KEY (day_id) REFERENCES trip_days(id) ON DELETE CASCADE, FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE SET NULL)`,
  `CREATE INDEX IF NOT EXISTS items_trip_day_idx ON itinerary_items (trip_id, day_id, position)`,
  `CREATE TABLE IF NOT EXISTS route_segments (id text PRIMARY KEY NOT NULL, trip_id text NOT NULL, day_id text NOT NULL, from_item_id text NOT NULL, to_item_id text NOT NULL, mode text NOT NULL, distance_meters integer, duration_minutes integer, cost real, geometry_json text, details_json text DEFAULT '{}' NOT NULL, source_type text NOT NULL, verified_at text, created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL, FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE, FOREIGN KEY (day_id) REFERENCES trip_days(id) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS trip_versions (id text PRIMARY KEY NOT NULL, trip_id text NOT NULL, revision integer NOT NULL, label text NOT NULL, snapshot_json text NOT NULL, created_by text NOT NULL, created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL, FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS versions_trip_revision_uq ON trip_versions (trip_id, revision)`,
  `CREATE TABLE IF NOT EXISTS trip_operations (id text PRIMARY KEY NOT NULL, trip_id text NOT NULL, base_revision integer NOT NULL, result_revision integer, status text NOT NULL, summary text NOT NULL, operations_json text NOT NULL, idempotency_key text NOT NULL, created_by text NOT NULL, created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL, FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS operations_idempotency_uq ON trip_operations (trip_id, idempotency_key)`,
  `CREATE TABLE IF NOT EXISTS mcp_servers (id text PRIMARY KEY NOT NULL, user_id text NOT NULL, provider_key text NOT NULL, name text NOT NULL, endpoint text NOT NULL, auth_mode text NOT NULL, encrypted_secret text, enabled integer DEFAULT true NOT NULL, permission text DEFAULT 'ask' NOT NULL, source text DEFAULT 'custom' NOT NULL, last_status text, last_error text, created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS mcp_user_provider_uq ON mcp_servers (user_id, provider_key)`,
  `CREATE TABLE IF NOT EXISTS mcp_call_logs (id text PRIMARY KEY NOT NULL, user_id text NOT NULL, server_id text NOT NULL, tool_name text NOT NULL, status text NOT NULL, duration_ms integer NOT NULL, error_code text, created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS mcp_logs_user_idx ON mcp_call_logs (user_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS ai_settings (user_id text PRIMARY KEY NOT NULL, provider text DEFAULT 'openai-compatible' NOT NULL, base_url text DEFAULT 'https://api.openai.com/v1' NOT NULL, model text DEFAULT 'gpt-5-mini' NOT NULL, thinking_enabled integer DEFAULT false NOT NULL, encrypted_api_key text, created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS ai_jobs (id text PRIMARY KEY NOT NULL, user_id text NOT NULL, trip_id text NOT NULL, prompt text NOT NULL, use_mcp integer DEFAULT true NOT NULL, status text DEFAULT 'queued' NOT NULL, stage text DEFAULT 'discovering_mcp' NOT NULL, progress integer DEFAULT 0 NOT NULL, attempts integer DEFAULT 0 NOT NULL, context_json text DEFAULT '{}' NOT NULL, result_json text, error text, started_at text, completed_at text, created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE)`,
  `CREATE INDEX IF NOT EXISTS ai_jobs_user_trip_idx ON ai_jobs (user_id, trip_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS ai_jobs_status_idx ON ai_jobs (status, updated_at)`,
  `CREATE TABLE IF NOT EXISTS share_links (id text PRIMARY KEY NOT NULL, trip_id text NOT NULL, token_hash text NOT NULL, expires_at text, revoked_at text, created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL, FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE)`,
];

export function ensureSchema() {
  if (!ready) ready = env.DB.batch(schema.map(statement => env.DB.prepare(statement))).then(async () => {
    const columns = await env.DB.prepare("PRAGMA table_info(ai_jobs)").all<{ name: string }>();
    const names = new Set(columns.results.map(column => column.name));
    const upgrades: string[] = [];
    if (!names.has("attempts")) upgrades.push("ALTER TABLE ai_jobs ADD COLUMN attempts integer DEFAULT 0 NOT NULL");
    if (!names.has("context_json")) upgrades.push("ALTER TABLE ai_jobs ADD COLUMN context_json text DEFAULT '{}' NOT NULL");
    if (upgrades.length) await env.DB.batch(upgrades.map(statement => env.DB.prepare(statement)));
    const settingColumns = await env.DB.prepare("PRAGMA table_info(ai_settings)").all<{ name: string }>();
    if (!settingColumns.results.some(column => column.name === "thinking_enabled"))
      await env.DB.prepare("ALTER TABLE ai_settings ADD COLUMN thinking_enabled integer DEFAULT false NOT NULL").run();
  }).catch(error => { ready = null; throw error; });
  return ready;
}
