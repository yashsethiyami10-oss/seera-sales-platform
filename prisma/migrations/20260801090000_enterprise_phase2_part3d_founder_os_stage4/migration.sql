-- MUV Enterprise Architecture v3.0 — Phase 2 Part 3D, Stage 4 — Founder
-- Workspace. Additive only. Touches nothing under any finance_* table
-- (Part 3C is formally frozen), and nothing in founder_alerts/
-- founder_notifications/founder_widget_definitions (Stage 1) or the
-- logic behind Stages 2-3 (no schema changes at all in those stages) —
-- hand-assembled from `prisma migrate diff`'s output with the usual
-- spurious DROP CONSTRAINT statements against hand-written users(id)
-- foreign keys on Part 3C/Stage 1 tables excluded (established pattern
-- throughout this engagement), and a purely cosmetic index-rename on
-- finance_ledger_entries excluded too (no functional effect, and Part 3C
-- is frozen — nothing under it is touched here, not even a rename).

-- Part 3D, Stage 4 — Pinned Widgets. Added to the existing Stage 1
-- founder_widget_preferences row rather than a new table (see schema.prisma).
ALTER TABLE "founder_widget_preferences" ADD COLUMN     "pinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pinnedOrder" INTEGER;

CREATE TABLE "founder_saved_views" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "sortBy" TEXT,
    "sortDirection" TEXT,
    "dateRangeFrom" TIMESTAMP(3),
    "dateRangeTo" TIMESTAMP(3),
    "displayMode" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "founder_saved_views_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "founder_dashboard_layouts" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "widgets" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "founder_dashboard_layouts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "founder_saved_reports" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "metrics" JSONB NOT NULL DEFAULT '[]',
    "dateRangeFrom" TIMESTAMP(3),
    "dateRangeTo" TIMESTAMP(3),
    "comparisonMode" TEXT,
    "grouping" TEXT,
    "filters" JSONB,
    "sortOrder" TEXT,
    "outputPreference" TEXT,
    "scheduleFrequency" TEXT,
    "scheduleTimezone" TEXT,
    "scheduleDeliveryChannel" TEXT,
    "scheduleEnabled" BOOLEAN NOT NULL DEFAULT false,
    "scheduleRequestedTime" TEXT,
    "lastGeneratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "founder_saved_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "founder_workspace_preferences" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "defaultDashboardLayoutId" TEXT,
    "defaultLandingSurface" TEXT,
    "defaultDateRange" TEXT,
    "defaultComparisonMode" TEXT,
    "displayDensity" TEXT,
    "tablePageSize" INTEGER,
    "timezone" TEXT,
    "notificationDisplayPreferences" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "founder_workspace_preferences_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "founder_saved_views_organizationKey_ownerId_surface_idx" ON "founder_saved_views"("organizationKey", "ownerId", "surface");
CREATE INDEX "founder_dashboard_layouts_organizationKey_ownerId_idx" ON "founder_dashboard_layouts"("organizationKey", "ownerId");
CREATE INDEX "founder_saved_reports_organizationKey_ownerId_idx" ON "founder_saved_reports"("organizationKey", "ownerId");
CREATE UNIQUE INDEX "founder_workspace_preferences_organizationKey_userId_key" ON "founder_workspace_preferences"("organizationKey", "userId");

ALTER TABLE "founder_workspace_preferences" ADD CONSTRAINT "founder_workspace_preferences_defaultDashboardLayoutId_fkey" FOREIGN KEY ("defaultDashboardLayoutId") REFERENCES "founder_dashboard_layouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Trusted User references (same hand-written pattern as every prior Part
-- and Stage 1 itself — Prisma's generator proposes DROPping these on
-- unrelated diffs because it doesn't know about them; added directly
-- here instead of via a Prisma-level relation to User, matching every
-- founder_*/finance_* table's own convention throughout this engagement).
ALTER TABLE "founder_saved_views" ADD CONSTRAINT "founder_saved_views_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "founder_dashboard_layouts" ADD CONSTRAINT "founder_dashboard_layouts_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "founder_saved_reports" ADD CONSTRAINT "founder_saved_reports_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "founder_workspace_preferences" ADD CONSTRAINT "founder_workspace_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Real, DB-level "at most one default/active per owner" invariants —
-- partial unique indexes, not expressible in schema.prisma directly, so
-- hand-added here (same reasoning as Part 3C's hand-added append-only
-- triggers: application-level checks alone are not atomic under
-- concurrency, a partial unique index is). Application code still does
-- the "unset the old default, set the new one" sequence inside a single
-- Serializable transaction (enterpriseTransaction) — this index is the
-- backstop guarantee, not the only enforcement.
CREATE UNIQUE INDEX "founder_saved_views_one_default_per_owner_surface" ON "founder_saved_views"("organizationKey", "ownerId", "surface") WHERE "isDefault" = true;
CREATE UNIQUE INDEX "founder_dashboard_layouts_one_active_per_owner" ON "founder_dashboard_layouts"("organizationKey", "ownerId") WHERE "isActive" = true;
CREATE UNIQUE INDEX "founder_dashboard_layouts_one_default_per_owner" ON "founder_dashboard_layouts"("organizationKey", "ownerId") WHERE "isDefault" = true;
