-- CreateTable
CREATE TABLE "opportunity_stage_transitions" (
    "fromStageId" TEXT NOT NULL,
    "toStageId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "opportunity_stage_transitions_pkey" PRIMARY KEY ("fromStageId","toStageId")
);

-- CreateTable
CREATE TABLE "opportunity_task_rules" (
    "id" TEXT NOT NULL,
    "triggerEvent" TEXT NOT NULL,
    "taskTypeId" TEXT NOT NULL,
    "titleTemplate" TEXT NOT NULL,
    "dueOffsetMinutes" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunity_task_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "opportunity_task_rules_triggerEvent_active_idx" ON "opportunity_task_rules"("triggerEvent", "active");

-- CreateIndex
CREATE UNIQUE INDEX "opportunity_task_rules_triggerEvent_taskTypeId_key" ON "opportunity_task_rules"("triggerEvent", "taskTypeId");

-- AddForeignKey
ALTER TABLE "opportunity_stage_transitions" ADD CONSTRAINT "opportunity_stage_transitions_fromStageId_fkey" FOREIGN KEY ("fromStageId") REFERENCES "opportunity_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_stage_transitions" ADD CONSTRAINT "opportunity_stage_transitions_toStageId_fkey" FOREIGN KEY ("toStageId") REFERENCES "opportunity_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_task_rules" ADD CONSTRAINT "opportunity_task_rules_taskTypeId_fkey" FOREIGN KEY ("taskTypeId") REFERENCES "opportunity_task_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
