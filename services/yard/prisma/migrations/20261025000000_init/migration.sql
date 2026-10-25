-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ContainerType" AS ENUM ('EMPTY_20', 'EMPTY_40', 'FULL_20', 'FULL_40', 'REEFER', 'REEFER_FULL');

-- CreateEnum
CREATE TYPE "ContainerStatus" AS ENUM ('PRESENT', 'DEPARTED');

-- CreateEnum
CREATE TYPE "CustomsStatus" AS ENUM ('RELEASED', 'HOLD');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('ARRIVAL', 'DEPARTURE', 'TRANSFER', 'MOVE', 'COMPACT');

-- CreateTable
CREATE TABLE "Zone" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "rows" INTEGER NOT NULL,
    "cols" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Container" (
    "id" UUID NOT NULL,
    "containerNo" TEXT NOT NULL,
    "type" "ContainerType" NOT NULL,
    "isoCode" TEXT NOT NULL,
    "client" TEXT,
    "weightKg" INTEGER,
    "zoneId" TEXT NOT NULL,
    "row" INTEGER NOT NULL,
    "col" INTEGER NOT NULL,
    "tier" INTEGER NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "plannedExitDate" TIMESTAMP(3),
    "exitDate" TIMESTAMP(3),
    "customsStatus" "CustomsStatus" NOT NULL DEFAULT 'RELEASED',
    "status" "ContainerStatus" NOT NULL DEFAULT 'PRESENT',
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Container_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReeferState" (
    "containerId" UUID NOT NULL,
    "commodity" TEXT NOT NULL,
    "setPoint" DOUBLE PRECISION NOT NULL,
    "tempMin" DOUBLE PRECISION NOT NULL,
    "tempMax" DOUBLE PRECISION NOT NULL,
    "powerStatus" TEXT NOT NULL,
    "ventSetting" TEXT NOT NULL,
    "humidity" TEXT NOT NULL,
    "currentTemp" DOUBLE PRECISION NOT NULL,
    "lastReadingAt" TIMESTAMP(3) NOT NULL,
    "alert" BOOLEAN NOT NULL DEFAULT false,
    "alertReason" TEXT,

    CONSTRAINT "ReeferState_pkey" PRIMARY KEY ("containerId")
);

-- CreateTable
CREATE TABLE "Movement" (
    "id" UUID NOT NULL,
    "type" "MovementType" NOT NULL,
    "containerId" UUID NOT NULL,
    "fromZoneId" TEXT,
    "fromRow" INTEGER,
    "fromCol" INTEGER,
    "fromTier" INTEGER,
    "toZoneId" TEXT,
    "toRow" INTEGER,
    "toCol" INTEGER,
    "toTier" INTEGER,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" TIMESTAMP(3),
    "undoneBy" TEXT,

    CONSTRAINT "Movement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox" (
    "id" UUID NOT NULL,
    "exchange" TEXT NOT NULL,
    "routingKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Container_zoneId_row_col_idx" ON "Container"("zoneId", "row", "col");

-- CreateIndex
CREATE INDEX "Container_containerNo_idx" ON "Container"("containerNo");

-- CreateIndex
CREATE INDEX "Movement_createdAt_idx" ON "Movement"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "outbox_publishedAt_createdAt_idx" ON "outbox"("publishedAt", "createdAt");

-- AddForeignKey
ALTER TABLE "ReeferState" ADD CONSTRAINT "ReeferState_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Present containers only: a container number and a physical slot can each be
-- held by at most one present container. Arbitrates concurrent writes.
CREATE UNIQUE INDEX "container_no_present" ON "Container"("containerNo") WHERE "status" = 'PRESENT';
CREATE UNIQUE INDEX "container_slot_present" ON "Container"("zoneId", "row", "col", "tier") WHERE "status" = 'PRESENT';
