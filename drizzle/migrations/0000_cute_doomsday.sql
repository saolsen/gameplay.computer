CREATE TABLE `agents` (
	`agent_id` text PRIMARY KEY NOT NULL,
	`game` text NOT NULL,
	`user_id` text NOT NULL,
	`agentname` text NOT NULL,
	`status_kind` text NOT NULL,
	`status` text NOT NULL,
	`url` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `match_locks` (
	`match_id` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`timestamp` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`match_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `match_players` (
	`match_id` text NOT NULL,
	`player_number` integer NOT NULL,
	`player_kind` text NOT NULL,
	`user_id` text,
	`agent_id` text,
	PRIMARY KEY(`match_id`, `player_number`),
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`match_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`agent_id`) ON UPDATE no action ON DELETE no action
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
	`timestamp` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`match_id`, `turn_number`),
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`match_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `matches` (
	`match_id` text PRIMARY KEY NOT NULL,
	`game` text NOT NULL,
	`created_by` text NOT NULL,
	`turn_number` integer NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
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
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `agent_user_idx` ON `agents` (`user_id`);--> statement-breakpoint
CREATE INDEX `agent_game_idx` ON `agents` (`game`);--> statement-breakpoint
CREATE INDEX `agent_game_status_idx` ON `agents` (`game`,`status_kind`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_agentname_idx` ON `agents` (`user_id`,`game`,`agentname`);--> statement-breakpoint
CREATE INDEX `match_player_user_idx` ON `match_players` (`user_id`);--> statement-breakpoint
CREATE INDEX `match_player_agent_idx` ON `match_players` (`agent_id`);--> statement-breakpoint
CREATE INDEX `match_turn_status_kind_idx` ON `match_turns` (`status_kind`);--> statement-breakpoint
CREATE INDEX `match_game_idx` ON `matches` (`game`);--> statement-breakpoint
CREATE INDEX `match_created_by_idx` ON `matches` (`created_by`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_clerk_user_id_unique` ON `users` (`clerk_user_id`);