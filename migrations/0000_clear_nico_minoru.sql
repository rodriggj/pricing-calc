DO $$ BEGIN
 CREATE TYPE "audit_action_type" AS ENUM('VIEWED', 'CONTEXT_EDITED', 'DOCUMENT_UPLOADED', 'DOCUMENT_DELETED', 'APPROVED', 'RUN_STARTED', 'RUN_COMPLETED', 'RUN_FAILED', 'SHARE_URL_ADDED', 'SHARE_URL_DELETED', 'NAME_EDITED', 'TEAM_MEMBER_INVITED', 'TEAM_MEMBER_REMOVED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "estimate_status" AS ENUM('DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'QUEUED', 'IN_PROGRESS', 'COMPLETE', 'PARTIALLY_COMPLETE', 'FAILED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "line_item_status" AS ENUM('PENDING', 'IN_PROGRESS', 'ADDED', 'FAILED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "architecture_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"estimate_id" uuid NOT NULL,
	"mermaid_source" text NOT NULL,
	"agent_commentary" text,
	"generation_reason" text NOT NULL,
	"prompt_metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "estimate_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"estimate_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"action_type" "audit_action_type" NOT NULL,
	"details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "estimates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"org_id" text,
	"name" text DEFAULT 'Untitled Estimate' NOT NULL,
	"status" "estimate_status" DEFAULT 'DRAFT' NOT NULL,
	"year_one_start_month" date NOT NULL,
	"pinned_architecture_revision_id" uuid,
	"run_lock_holder" text,
	"run_lock_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"estimate_id" uuid NOT NULL,
	"service_code" text NOT NULL,
	"configuration" jsonb NOT NULL,
	"region" text DEFAULT 'us-east-1' NOT NULL,
	"quantity_per_year" jsonb NOT NULL,
	"status" "line_item_status" DEFAULT 'PENDING' NOT NULL,
	"failure_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "share_url_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"estimate_id" uuid NOT NULL,
	"share_url" text NOT NULL,
	"is_first_pass" boolean DEFAULT false NOT NULL,
	"created_by" text NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "arch_revisions_estimate_idx" ON "architecture_revisions" ("estimate_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_estimate_idx" ON "estimate_audit_log" ("estimate_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_action_idx" ON "estimate_audit_log" ("action_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_created_idx" ON "estimate_audit_log" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "estimates_owner_idx" ON "estimates" ("owner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "estimates_org_idx" ON "estimates" ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "estimates_status_idx" ON "estimates" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "line_items_estimate_idx" ON "line_items" ("estimate_id");--> statement-breakpoint
ALTER TABLE "line_items" ADD CONSTRAINT "line_items_region_us_east_1" CHECK ("region" = 'us-east-1');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "share_revisions_estimate_idx" ON "share_url_revisions" ("estimate_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "share_revisions_first_pass_unique" ON "share_url_revisions" ("estimate_id") WHERE "is_first_pass" = true AND "deleted_at" IS NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "architecture_revisions" ADD CONSTRAINT "architecture_revisions_estimate_id_estimates_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "estimates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "estimate_audit_log" ADD CONSTRAINT "estimate_audit_log_estimate_id_estimates_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "estimates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "estimates" ADD CONSTRAINT "estimates_pinned_architecture_revision_id_architecture_revisions_id_fk" FOREIGN KEY ("pinned_architecture_revision_id") REFERENCES "architecture_revisions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "line_items" ADD CONSTRAINT "line_items_estimate_id_estimates_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "estimates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "share_url_revisions" ADD CONSTRAINT "share_url_revisions_estimate_id_estimates_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "estimates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
