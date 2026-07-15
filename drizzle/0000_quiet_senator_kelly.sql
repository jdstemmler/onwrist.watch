CREATE TABLE `watch_photos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`watch_id` integer NOT NULL,
	`file_path` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`watch_id`) REFERENCES `watches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `watches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`brand` text NOT NULL,
	`model` text NOT NULL,
	`reference_no` text,
	`nickname` text,
	`dial_color` text,
	`movement` text,
	`case_mm` real,
	`lug_mm` real,
	`water_resistance_m` integer,
	`strap_notes` text,
	`purchase_date` text,
	`price_paid_cents` integer,
	`purchased_from` text,
	`box_papers` text,
	`condition` text,
	`status` text DEFAULT 'owned' NOT NULL,
	`sold_date` text,
	`sold_price_cents` integer,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wear_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`watch_id` integer NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`note` text,
	`source` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`watch_id`) REFERENCES `watches`(`id`) ON UPDATE no action ON DELETE cascade
);
