CREATE TABLE `dev_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`recipient` text NOT NULL,
	`subject` text,
	`body` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fact_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fact_id` integer NOT NULL,
	`url` text NOT NULL,
	`title` text,
	FOREIGN KEY (`fact_id`) REFERENCES `facts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_fact_sources_fact_id` ON `fact_sources` (`fact_id`);--> statement-breakpoint
CREATE TABLE `facts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`text` text NOT NULL,
	`image_path` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sent_facts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fact_id` integer NOT NULL,
	`sent_date` text NOT NULL,
	`cycle` integer NOT NULL,
	FOREIGN KEY (`fact_id`) REFERENCES `facts`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sent_facts_sent_date_unique` ON `sent_facts` (`sent_date`);--> statement-breakpoint
CREATE INDEX `idx_sent_facts_fact_id` ON `sent_facts` (`fact_id`);--> statement-breakpoint
CREATE TABLE `subscribers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`token` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`confirmed_at` text,
	`unsubscribed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscribers_email_unique` ON `subscribers` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `subscribers_token_unique` ON `subscribers` (`token`);