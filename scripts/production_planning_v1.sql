-- Producción / Tejeduría v1
-- Migración aditiva e idempotente. No borra ni transforma datos existentes.
-- Ejecutar completa dentro de PostgreSQL antes de publicar esta versión del backend.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE items
    ADD COLUMN IF NOT EXISTS "pesoConoKg" numeric(10,3);

ALTER TABLE articulo_item_refs
    ADD COLUMN IF NOT EXISTS "conosPreparacion" integer;

CREATE TABLE IF NOT EXISTS production_schedules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "planDate" date NOT NULL,
    "sectorCode" varchar NOT NULL DEFAULT '3000',
    status varchar NOT NULL DEFAULT 'DRAFT',
    revision integer NOT NULL DEFAULT 1,
    "sourceFiles" jsonb NOT NULL DEFAULT '[]'::jsonb,
    notes text,
    "createdBy" varchar,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now(),
    CONSTRAINT "UQ_production_schedule_revision" UNIQUE ("planDate", "sectorCode", revision)
);

CREATE TABLE IF NOT EXISTS production_schedule_lines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "scheduleId" uuid NOT NULL REFERENCES production_schedules(id) ON DELETE CASCADE,
    "resourceId" uuid REFERENCES production_resources(id) ON DELETE SET NULL,
    "machineId" uuid REFERENCES machines(id) ON DELETE SET NULL,
    "articleId" uuid REFERENCES articulos(id) ON DELETE SET NULL,
    "machineNumberSnapshot" integer NOT NULL,
    area varchar,
    shift varchar(10) NOT NULL,
    "articleCodeSnapshot" varchar,
    "articleRaw" varchar,
    "articleDescriptionSnapshot" varchar,
    "sizeSnapshot" varchar,
    "colorSnapshot" varchar,
    "plannedSeconds" integer,
    "plannedGoodSocks" integer,
    "plannedChangeSeconds" integer NOT NULL DEFAULT 0,
    "sourceFile" varchar,
    "sourcePage" integer,
    "matchStatus" varchar NOT NULL DEFAULT 'NEEDS_REVIEW',
    active boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS "IDX_production_schedule_line_machine"
    ON production_schedule_lines ("machineId", shift);

CREATE TABLE IF NOT EXISTS production_schedule_materials (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "scheduleLineId" uuid NOT NULL REFERENCES production_schedule_lines(id) ON DELETE CASCADE,
    "itemId" uuid REFERENCES items(id) ON DELETE SET NULL,
    "itemCodeSnapshot" varchar,
    "itemDescriptionSnapshot" varchar,
    role varchar NOT NULL,
    "colorSnapshot" varchar,
    "setupCones" integer NOT NULL DEFAULT 0,
    "coneWeightKg" numeric(10,3),
    "setupWeightKg" numeric(12,3),
    "consumptionGramsPerSock" numeric(10,3),
    "wastePct" numeric(6,2),
    "expectedConsumptionKg" numeric(12,3),
    "requiredKg" numeric(12,3),
    "mainStockSnapshotKg" numeric(12,3),
    "reserveStockSnapshotKg" numeric(12,3),
    "projectedMainKg" numeric(12,3),
    "replenishmentAlert" boolean NOT NULL DEFAULT false,
    "replenishmentVerified" boolean NOT NULL DEFAULT false,
    "replenishmentVerifiedAt" timestamp,
    "replenishmentVerifiedBy" varchar,
    "actualConsumptionKg" numeric(12,3),
    "actualConsumptionVerified" boolean NOT NULL DEFAULT false,
    "actualConsumptionVerifiedAt" timestamp,
    "actualConsumptionVerifiedBy" varchar
);

CREATE INDEX IF NOT EXISTS "IDX_production_schedule_material_item"
    ON production_schedule_materials ("itemId");

CREATE TABLE IF NOT EXISTS production_planned_changes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "scheduleId" uuid NOT NULL REFERENCES production_schedules(id) ON DELETE CASCADE,
    "scheduleLineId" uuid REFERENCES production_schedule_lines(id) ON DELETE SET NULL,
    "machineId" uuid,
    "machineNumberSnapshot" integer NOT NULL,
    "fromArticleId" uuid,
    "toArticleId" uuid,
    "fromArticleCodeSnapshot" varchar,
    "toArticleCodeSnapshot" varchar,
    "changeTypes" jsonb NOT NULL DEFAULT '[]'::jsonb,
    "scheduledAt" timestamp NOT NULL,
    "estimatedSeconds" integer NOT NULL DEFAULT 0,
    "historicalSampleCount" integer NOT NULL DEFAULT 0,
    status varchar NOT NULL DEFAULT 'PLANNED',
    "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_production_planned_change_machine"
    ON production_planned_changes ("machineId", "scheduledAt");

CREATE TABLE IF NOT EXISTS production_actual_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "recordDate" date NOT NULL,
    shift varchar(10) NOT NULL,
    "sectorCode" varchar NOT NULL DEFAULT '3000',
    "scheduleLineId" uuid REFERENCES production_schedule_lines(id) ON DELETE SET NULL,
    "resourceId" uuid REFERENCES production_resources(id) ON DELETE SET NULL,
    "machineId" uuid REFERENCES machines(id) ON DELETE SET NULL,
    "machineNumberSnapshot" integer NOT NULL,
    "articleId" uuid REFERENCES articulos(id) ON DELETE SET NULL,
    "articleCodeSnapshot" varchar,
    "employeeId" uuid REFERENCES employees(id) ON DELETE SET NULL,
    "employeeLegajoSnapshot" varchar,
    "employeeNameSnapshot" varchar,
    "goodSocks" integer NOT NULL DEFAULT 0,
    "secondSocks" integer NOT NULL DEFAULT 0,
    "secondMechanicalSocks" integer NOT NULL DEFAULT 0,
    "runSeconds" integer,
    "sourceType" varchar NOT NULL DEFAULT 'MANUAL',
    "sourceReference" varchar,
    status varchar NOT NULL DEFAULT 'CONFIRMED',
    "correctionOfId" uuid REFERENCES production_actual_entries(id) ON DELETE SET NULL,
    notes text,
    "createdBy" varchar,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_production_actual_date_machine"
    ON production_actual_entries ("recordDate", "machineId");

CREATE TABLE IF NOT EXISTS material_inventory_reviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "itemId" uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    status varchar NOT NULL DEFAULT 'TO_REVIEW',
    notes text,
    "reviewedBy" varchar,
    "reviewedAt" timestamp,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now(),
    CONSTRAINT "UQ_material_inventory_review_item" UNIQUE ("itemId")
);

COMMIT;
