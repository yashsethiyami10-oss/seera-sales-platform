-- Schema drift repair: SeeraAttendanceRecord / SeeraHoliday / SeeraLeaveRequest (and their enums)
-- exist in schema.prisma but no migration ever created them (environments built only from
-- migrations had no attendance/leave tables, so Manager > Attendance failed to load).
-- Fully idempotent: databases that already have these objects (created earlier via db push)
-- are left untouched.

DO $$ BEGIN
  CREATE TYPE "SeeraAttendanceStatus" AS ENUM ('PRESENT', 'LATE', 'ABSENT', 'ON_LEAVE', 'WEEK_OFF', 'HOLIDAY', 'EXCEPTION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SeeraAttendanceSource" AS ENUM ('SYSTEM', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SeeraOffDayWorkType" AS ENUM ('SUNDAY_WORKED', 'HOLIDAY_WORKED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SeeraLeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "seera_attendance_records" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "SeeraAttendanceStatus" NOT NULL,
    "source" "SeeraAttendanceSource" NOT NULL,
    "reason" TEXT NOT NULL,
    "offDayWorked" "SeeraOffDayWorkType",
    "firstActivityAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seera_attendance_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "seera_holidays" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seera_holidays_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "seera_leave_requests" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "SeeraLeaveStatus" NOT NULL DEFAULT 'PENDING',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seera_leave_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "seera_attendance_records_date_status_idx" ON "seera_attendance_records"("date", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "seera_attendance_records_employeeId_date_key" ON "seera_attendance_records"("employeeId", "date");
CREATE UNIQUE INDEX IF NOT EXISTS "seera_holidays_date_key" ON "seera_holidays"("date");
CREATE INDEX IF NOT EXISTS "seera_leave_requests_employeeId_startDate_endDate_idx" ON "seera_leave_requests"("employeeId", "startDate", "endDate");
CREATE INDEX IF NOT EXISTS "seera_leave_requests_status_idx" ON "seera_leave_requests"("status");
