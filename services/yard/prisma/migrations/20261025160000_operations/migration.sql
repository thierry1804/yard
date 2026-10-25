-- AlterEnum
ALTER TYPE "MovementType" ADD VALUE 'CORRECTION';

-- AlterTable
ALTER TABLE "Zone" ADD COLUMN     "allowedTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "blockedSlots" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "maxTier" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "maxWeightKg" INTEGER,
ADD COLUMN     "reeferOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reeferPlugs" INTEGER;

-- AlterTable
ALTER TABLE "Container" ADD COLUMN     "clientHoldReason" TEXT,
ADD COLUMN     "releaseReference" TEXT,
ADD COLUMN     "releaseRequired" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "WorkTask" (
    "id" UUID NOT NULL,
    "containerId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'REQUESTED',
    "priority" INTEGER NOT NULL DEFAULT 2,
    "assignee" TEXT,
    "equipment" TEXT,
    "reason" TEXT,
    "groupId" TEXT,
    "sourceVersion" INTEGER NOT NULL,
    "sourceZoneId" TEXT NOT NULL,
    "sourceRow" INTEGER NOT NULL,
    "sourceCol" INTEGER NOT NULL,
    "sourceTier" INTEGER NOT NULL,
    "targetZoneId" TEXT,
    "targetRow" INTEGER,
    "targetCol" INTEGER,
    "dueAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationRecord" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "containerId" UUID,
    "data" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "entityId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkTask_state_createdAt_idx" ON "WorkTask"("state", "createdAt");

-- CreateIndex
CREATE INDEX "OperationRecord_kind_createdAt_idx" ON "OperationRecord"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_id_idx" ON "AuditEvent"("createdAt", "id");

-- AddForeignKey
ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationRecord" ADD CONSTRAINT "OperationRecord_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "work_task_one_active" ON "WorkTask" ("containerId") WHERE "state" IN ('REQUESTED', 'ASSIGNED', 'IN_PROGRESS', 'BLOCKED');
