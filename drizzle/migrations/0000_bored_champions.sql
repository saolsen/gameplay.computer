CREATE TABLE `agents` (
	`agent_id` text PRIMARY KEY NOT NULL,
	`game` text NOT NULL,
	`user_id` text NOT NULL,
	`agentname` text NOT NULL,
	`endpoint` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `match_players` (
	`match_id` text NOT NULL,
	`player_number` integer NOT NULL,
	`player_kind` text NOT NULL,
	`user_id` text,
	`agent_id` text,
	PRIMARY KEY(`match_id`, `player_number`),
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`match_id`) ON UPDATE no action ON DELETE CASCADE,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_id`) REFERENCES `matches`(`match_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `match_turns` (
	`match_id` text NOT NULL,
	`turn_number` integer NOT NULL,
	`status_kind` text NOT NULL,
	`status` text NOT NULL,
	`player` integer,
	`action` text,
	`state` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`match_id`, `turn_number`),
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`match_id`) ON UPDATE no action ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `matches` (
	`match_id` text PRIMARY KEY NOT NULL,
	`game` text NOT NULL,
	`created_by` text NOT NULL,
	`turn_number` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`user_id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`first_name` text,
	`last_name` text,
	`email_address` text NOT NULL,
	`clerk_user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `user_idx` ON `agents` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agentname_idx` ON `agents` (`user_id`,`agentname`);--> statement-breakpoint
CREATE INDEX `user_idx` ON `match_players` (`user_id`);--> statement-breakpoint
CREATE INDEX `agent_idx` ON `match_players` (`agent_id`);--> statement-breakpoint
CREATE INDEX `status_kind_idx` ON `match_turns` (`status_kind`);--> statement-breakpoint
CREATE INDEX `game_idx` ON `matches` (`game`);--> statement-breakpoint
CREATE INDEX `created_by_idx` ON `matches` (`created_by`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_clerk_user_id_unique` ON `users` (`clerk_user_id`);