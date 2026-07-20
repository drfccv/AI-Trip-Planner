CREATE TABLE `ai_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`provider` text DEFAULT 'openai-compatible' NOT NULL,
	`base_url` text DEFAULT 'https://api.openai.com/v1' NOT NULL,
	`model` text DEFAULT 'gpt-5-mini' NOT NULL,
	`encrypted_api_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
