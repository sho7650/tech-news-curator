CREATE TABLE IF NOT EXISTS "articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_url" text NOT NULL,
	"source_name" varchar(100),
	"title_original" text,
	"title_ja" text,
	"body_original" text,
	"body_translated" text,
	"summary_ja" text,
	"author" varchar(200),
	"published_at" timestamp with time zone,
	"og_image_url" text,
	"categories" text[],
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "articles_source_url_unique" UNIQUE("source_url")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100),
	"rss_url" text NOT NULL,
	"site_url" text,
	"category" varchar(50),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_rss_url_unique" UNIQUE("rss_url")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "digests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"digest_date" date NOT NULL,
	"title" text,
	"content" text,
	"article_count" integer,
	"article_ids" uuid[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "digests_digest_date_unique" UNIQUE("digest_date")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_articles_published_at" ON "articles" USING btree ("published_at");
