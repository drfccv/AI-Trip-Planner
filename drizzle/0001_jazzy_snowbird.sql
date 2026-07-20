DROP INDEX `mcp_user_idx`;--> statement-breakpoint
ALTER TABLE `mcp_servers` ADD `provider_key` text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `mcp_user_provider_uq` ON `mcp_servers` (`user_id`,`provider_key`);