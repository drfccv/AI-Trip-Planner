CREATE TABLE `ai_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`trip_id` text NOT NULL,
	`prompt` text NOT NULL,
	`use_mcp` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`stage` text DEFAULT 'queued' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`result_json` text,
	`error` text,
	`started_at` text,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_jobs_user_trip_idx` ON `ai_jobs` (`user_id`,`trip_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ai_jobs_status_idx` ON `ai_jobs` (`status`,`updated_at`);