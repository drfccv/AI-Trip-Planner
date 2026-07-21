CREATE TABLE "ai_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"trip_id" text NOT NULL,
	"prompt" text NOT NULL,
	"use_mcp" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"stage" text DEFAULT 'discovering_mcp' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"context_json" text DEFAULT '{}' NOT NULL,
	"result_json" text,
	"error" text,
	"started_at" text,
	"completed_at" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"provider" text DEFAULT 'openai-compatible' NOT NULL,
	"base_url" text DEFAULT 'https://api.openai.com/v1' NOT NULL,
	"model" text DEFAULT 'gpt-5-mini' NOT NULL,
	"thinking_enabled" boolean DEFAULT false NOT NULL,
	"encrypted_api_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anonymous_creation_limits" (
	"bucket_key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "itinerary_items" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"day_id" text NOT NULL,
	"place_id" text,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"start_time" text NOT NULL,
	"duration_minutes" integer NOT NULL,
	"position" integer NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"lock_time" boolean DEFAULT false NOT NULL,
	"source_type" text NOT NULL,
	"cost" real,
	"metadata_json" text DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_call_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"server_id" text NOT NULL,
	"tool_name" text NOT NULL,
	"status" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"error_code" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_servers" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider_key" text NOT NULL,
	"name" text NOT NULL,
	"endpoint" text NOT NULL,
	"auth_mode" text NOT NULL,
	"encrypted_secret" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"permission" text DEFAULT 'ask' NOT NULL,
	"source" text DEFAULT 'custom' NOT NULL,
	"last_status" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "places" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"provider_place_id" text,
	"name" text NOT NULL,
	"address" text,
	"latitude" real,
	"longitude" real,
	"category" text,
	"source_type" text NOT NULL,
	"verified_at" text,
	"raw_json" text DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "route_segments" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"day_id" text NOT NULL,
	"from_item_id" text NOT NULL,
	"to_item_id" text NOT NULL,
	"mode" text NOT NULL,
	"distance_meters" integer,
	"duration_minutes" integer,
	"cost" real,
	"geometry_json" text,
	"details_json" text DEFAULT '{}' NOT NULL,
	"source_type" text NOT NULL,
	"verified_at" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_links" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" text,
	"revoked_at" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_days" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"day_index" integer NOT NULL,
	"date" text NOT NULL,
	"title" text NOT NULL,
	"weather_json" text,
	"summary_json" text DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_operations" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"base_revision" integer NOT NULL,
	"result_revision" integer,
	"status" text NOT NULL,
	"summary" text NOT NULL,
	"operations_json" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"revision" integer NOT NULL,
	"label" text NOT NULL,
	"snapshot_json" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"destination" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"currency" text DEFAULT 'CNY' NOT NULL,
	"budget_total" real,
	"constraints_json" text DEFAULT '{}' NOT NULL,
	"source_type" text DEFAULT 'user_added' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_day_id_trip_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."trip_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD CONSTRAINT "mcp_servers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_segments" ADD CONSTRAINT "route_segments_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_segments" ADD CONSTRAINT "route_segments_day_id_trip_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."trip_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_days" ADD CONSTRAINT "trip_days_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_operations" ADD CONSTRAINT "trip_operations_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_versions" ADD CONSTRAINT "trip_versions_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_jobs_user_trip_idx" ON "ai_jobs" USING btree ("user_id","trip_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_jobs_status_idx" ON "ai_jobs" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "items_trip_day_idx" ON "itinerary_items" USING btree ("trip_id","day_id","position");--> statement-breakpoint
CREATE INDEX "mcp_logs_user_idx" ON "mcp_call_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_user_provider_uq" ON "mcp_servers" USING btree ("user_id","provider_key");--> statement-breakpoint
CREATE INDEX "places_provider_idx" ON "places" USING btree ("provider","provider_place_id");--> statement-breakpoint
CREATE INDEX "routes_day_idx" ON "route_segments" USING btree ("day_id");--> statement-breakpoint
CREATE UNIQUE INDEX "share_token_uq" ON "share_links" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "trip_days_trip_index_uq" ON "trip_days" USING btree ("trip_id","day_index");--> statement-breakpoint
CREATE UNIQUE INDEX "operations_idempotency_uq" ON "trip_operations" USING btree ("trip_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "versions_trip_revision_uq" ON "trip_versions" USING btree ("trip_id","revision");--> statement-breakpoint
CREATE INDEX "trips_user_idx" ON "trips" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trips_status_idx" ON "trips" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");