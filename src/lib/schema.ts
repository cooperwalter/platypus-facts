import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const facts = sqliteTable("facts", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	text: text("text").notNull(),
	image_path: text("image_path"),
	created_at: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const factSources = sqliteTable(
	"fact_sources",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		fact_id: integer("fact_id")
			.notNull()
			.references(() => facts.id, { onDelete: "cascade" }),
		url: text("url").notNull(),
		title: text("title"),
	},
	(table) => [index("idx_fact_sources_fact_id").on(table.fact_id)],
);

export const subscribers = sqliteTable("subscribers", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	email: text("email").notNull().unique(),
	token: text("token").notNull().unique(),
	status: text("status").notNull().default("pending"),
	created_at: text("created_at").notNull().default(sql`(datetime('now'))`),
	confirmed_at: text("confirmed_at"),
	unsubscribed_at: text("unsubscribed_at"),
});

export const sentFacts = sqliteTable(
	"sent_facts",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		fact_id: integer("fact_id")
			.notNull()
			.references(() => facts.id, { onDelete: "restrict" }),
		sent_date: text("sent_date").notNull().unique(),
		cycle: integer("cycle").notNull(),
	},
	(table) => [index("idx_sent_facts_fact_id").on(table.fact_id)],
);

export const devMessages = sqliteTable("dev_messages", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	type: text("type").notNull(),
	recipient: text("recipient").notNull(),
	subject: text("subject"),
	body: text("body").notNull(),
	created_at: text("created_at").notNull().default(sql`(datetime('now'))`),
});
