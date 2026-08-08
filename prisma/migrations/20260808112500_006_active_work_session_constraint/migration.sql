-- One governed active workday per employee. The partial index makes the
-- invariant atomic under retries and concurrent mobile submissions.
CREATE UNIQUE INDEX "seera_work_sessions_one_active_per_employee"
ON "seera_work_sessions" ("employeeId")
WHERE "status" = 'ACTIVE';
