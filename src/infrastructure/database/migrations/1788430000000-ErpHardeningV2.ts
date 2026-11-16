import { MigrationInterface, QueryRunner } from 'typeorm';

export class ErpHardeningV21788430000000 implements MigrationInterface {
    name = 'ErpHardeningV21788430000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

        for (const statement of [
            `ALTER TABLE IF EXISTS stock_balance ALTER COLUMN "qtyPrincipal" TYPE numeric(14,3), ALTER COLUMN "qtySecundaria" TYPE numeric(14,3)`,
            `ALTER TABLE IF EXISTS movimientos ALTER COLUMN "qtyPrincipal" TYPE numeric(14,3), ALTER COLUMN "qtySecundaria" TYPE numeric(14,3)`,
            `ALTER TABLE IF EXISTS purchase_order_lines ALTER COLUMN "qtyPedido" TYPE numeric(14,3), ALTER COLUMN "qtyRecibida" TYPE numeric(14,3), ALTER COLUMN "qtySecundaria" TYPE numeric(14,3), ALTER COLUMN "qtyRecibidaSecundaria" TYPE numeric(14,3)`,
            `ALTER TABLE IF EXISTS purchase_order_receipts ALTER COLUMN "qtyPrincipal" TYPE numeric(14,3), ALTER COLUMN "qtySecundaria" TYPE numeric(14,3)`,
            `ALTER TABLE IF EXISTS order_lines ALTER COLUMN "qtyPedido" TYPE numeric(14,3), ALTER COLUMN "qtySnapshot" TYPE numeric(14,3)`,
            `ALTER TABLE IF EXISTS tasks ALTER COLUMN qty TYPE numeric(14,3)`,
            `ALTER TABLE IF EXISTS inventory_check_items ALTER COLUMN "realQtyPrincipal" TYPE numeric(14,3), ALTER COLUMN "realQtySecundaria" TYPE numeric(14,3)`,
        ]) await queryRunner.query(statement);
        await queryRunner.query(`
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'CHK_stock_balance_nonnegative'
                      AND conrelid = 'stock_balance'::regclass
                ) THEN
                    ALTER TABLE stock_balance ADD CONSTRAINT "CHK_stock_balance_nonnegative"
                    CHECK ("qtyPrincipal" >= 0 AND ("qtySecundaria" IS NULL OR "qtySecundaria" >= 0)) NOT VALID;
                END IF;
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'CHK_movimientos_nonnegative_quantity'
                      AND conrelid = 'movimientos'::regclass
                ) THEN
                    ALTER TABLE movimientos ADD CONSTRAINT "CHK_movimientos_nonnegative_quantity"
                    CHECK ("qtyPrincipal" >= 0 AND ("qtySecundaria" IS NULL OR "qtySecundaria" >= 0)) NOT VALID;
                END IF;
            END $$
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_stock_balance_without_lot"
            ON stock_balance ("depositoId", "posicionId", "itemId")
            WHERE "lotId" IS NULL
        `);

        await queryRunner.query(`
            ALTER TABLE IF EXISTS batches
                ADD COLUMN IF NOT EXISTS "qualityStatus" varchar NOT NULL DEFAULT 'RELEASED',
                ADD COLUMN IF NOT EXISTS "qualityTestedAt" timestamp,
                ADD COLUMN IF NOT EXISTS "qualityTestedBy" varchar,
                ADD COLUMN IF NOT EXISTS "qualityNotes" text
        `);
        await queryRunner.query(`UPDATE batches SET "qualityStatus" = 'RELEASED' WHERE "qualityStatus" IS NULL`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_batch_quality_created" ON batches ("qualityStatus", "createdAt")`);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS system_audit_logs (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                method varchar(10) NOT NULL,
                path varchar(500) NOT NULL,
                action varchar(120) NOT NULL,
                resource varchar(120) NOT NULL,
                "resourceId" varchar(120),
                "actorId" uuid,
                "actorUsername" varchar(160),
                "actorRole" varchar(60),
                "actorSector" varchar(60),
                "statusCode" integer,
                success boolean NOT NULL DEFAULT true,
                "durationMs" integer NOT NULL DEFAULT 0,
                "ipAddress" varchar(80),
                "errorMessage" text,
                details jsonb,
                "createdAt" timestamp NOT NULL DEFAULT now()
            )
        `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_system_audit_created" ON system_audit_logs ("createdAt")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_system_audit_actor" ON system_audit_logs ("actorId", "createdAt")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_system_audit_resource" ON system_audit_logs (resource, "resourceId", "createdAt")`);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS production_material_requests (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "scheduleId" uuid NOT NULL REFERENCES production_schedules(id) ON DELETE RESTRICT,
                "sourceDepotId" uuid NOT NULL REFERENCES depots(id) ON DELETE RESTRICT,
                status varchar NOT NULL DEFAULT 'REQUESTED',
                "requestedBy" varchar,
                "reservedAt" timestamp,
                "reservedBy" varchar,
                "preparationStartedAt" timestamp,
                "preparationStartedBy" varchar,
                "readyAt" timestamp,
                "readyBy" varchar,
                "deliveredAt" timestamp,
                "deliveredBy" varchar,
                "consumedAt" timestamp,
                "consumedBy" varchar,
                "returnedAt" timestamp,
                "returnedBy" varchar,
                notes text,
                "createdAt" timestamp NOT NULL DEFAULT now(),
                "updatedAt" timestamp NOT NULL DEFAULT now()
            )
        `);
        await queryRunner.query(`ALTER TABLE production_material_requests ADD COLUMN IF NOT EXISTS "returnedAt" timestamp`);
        await queryRunner.query(`ALTER TABLE production_material_requests ADD COLUMN IF NOT EXISTS "returnedBy" varchar`);
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_production_material_request_schedule" ON production_material_requests ("scheduleId")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_production_material_request_status_created" ON production_material_requests (status, "createdAt")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_production_material_request_depot_status" ON production_material_requests ("sourceDepotId", status)`);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS production_material_request_lines (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "requestId" uuid NOT NULL REFERENCES production_material_requests(id) ON DELETE CASCADE,
                "scheduleMaterialId" uuid REFERENCES production_schedule_materials(id) ON DELETE SET NULL,
                "itemId" uuid NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
                "requestedKg" numeric(12,3) NOT NULL,
                "reservedKg" numeric(12,3) NOT NULL DEFAULT 0,
                "deliveredKg" numeric(12,3) NOT NULL DEFAULT 0,
                "consumedKg" numeric(12,3) NOT NULL DEFAULT 0,
                "pendingReturnKg" numeric(12,3) NOT NULL DEFAULT 0,
                "returnedKg" numeric(12,3) NOT NULL DEFAULT 0
            )
        `);
        await queryRunner.query(`ALTER TABLE production_material_request_lines ADD COLUMN IF NOT EXISTS "pendingReturnKg" numeric(12,3) NOT NULL DEFAULT 0`);
        await queryRunner.query(`ALTER TABLE production_material_request_lines ADD COLUMN IF NOT EXISTS "returnedKg" numeric(12,3) NOT NULL DEFAULT 0`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_production_request_line_item" ON production_material_request_lines ("itemId")`);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS production_material_allocations (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "requestLineId" uuid NOT NULL REFERENCES production_material_request_lines(id) ON DELETE CASCADE,
                "stockBalanceId" uuid REFERENCES stock_balance(id) ON DELETE SET NULL,
                "lotId" uuid NOT NULL REFERENCES batches(id) ON DELETE RESTRICT,
                "positionId" uuid NOT NULL REFERENCES positions(id) ON DELETE RESTRICT,
                "lotNumberSnapshot" varchar NOT NULL,
                "fifoDateSnapshot" date,
                "reservedKg" numeric(12,3) NOT NULL,
                "deliveredKg" numeric(12,3) NOT NULL DEFAULT 0,
                "createdAt" timestamp NOT NULL DEFAULT now()
            )
        `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_production_material_allocation_balance" ON production_material_allocations ("stockBalanceId")`);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS production_line_returns (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "sourceMovementId" uuid NOT NULL REFERENCES movimientos(id) ON DELETE RESTRICT,
                "sourceDocumentId" uuid NOT NULL REFERENCES documentos(id) ON DELETE RESTRICT,
                "requestLineId" uuid REFERENCES production_material_request_lines(id) ON DELETE SET NULL,
                "itemId" uuid NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
                "lotId" uuid NOT NULL REFERENCES batches(id) ON DELETE RESTRICT,
                "returnPositionId" uuid NOT NULL REFERENCES positions(id) ON DELETE RESTRICT,
                "destinationPositionId" uuid REFERENCES positions(id) ON DELETE SET NULL,
                quantity numeric(14,3) NOT NULL,
                status varchar NOT NULL DEFAULT 'DECLARED',
                "declaredBy" varchar,
                "declaredByUserId" uuid,
                "postedAt" timestamp,
                "postedBy" varchar,
                "stockMovementId" uuid REFERENCES movimientos(id) ON DELETE SET NULL,
                "cancelledAt" timestamp,
                "cancelledBy" varchar,
                "cancellationReason" text,
                "createdAt" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "CHK_production_line_return_quantity" CHECK (quantity > 0)
            )
        `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_production_line_return_status_created" ON production_line_returns (status, "createdAt")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_production_line_return_source_movement" ON production_line_returns ("sourceMovementId")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_production_line_return_request_line" ON production_line_returns ("requestLineId")`);
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_production_line_return_stock_movement" ON production_line_returns ("stockMovementId") WHERE "stockMovementId" IS NOT NULL`);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS production_output_lots (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "scheduleId" uuid NOT NULL REFERENCES production_schedules(id) ON DELETE RESTRICT,
                "articleId" uuid REFERENCES articulos(id) ON DELETE SET NULL,
                "articleCodeSnapshot" varchar NOT NULL,
                "lotNumber" varchar NOT NULL,
                "goodSocks" integer NOT NULL,
                "secondSocks" integer NOT NULL DEFAULT 0,
                "qualityStatus" varchar NOT NULL DEFAULT 'QUARANTINE',
                "qualityTestedAt" timestamp,
                "qualityTestedBy" varchar,
                "qualityNotes" text,
                "createdBy" varchar,
                "finishedItemId" uuid REFERENCES items(id) ON DELETE SET NULL,
                "secondItemId" uuid REFERENCES items(id) ON DELETE SET NULL,
                "finishedBatchId" uuid REFERENCES batches(id) ON DELETE SET NULL,
                "secondBatchId" uuid REFERENCES batches(id) ON DELETE SET NULL,
                "targetDepotId" uuid REFERENCES depots(id) ON DELETE SET NULL,
                "targetPositionId" uuid REFERENCES positions(id) ON DELETE SET NULL,
                "stockPostedAt" timestamp,
                "stockPostedBy" varchar,
                "createdAt" timestamp NOT NULL DEFAULT now()
            )
        `);
        for (const statement of [
            `ALTER TABLE production_output_lots ADD COLUMN IF NOT EXISTS "finishedItemId" uuid REFERENCES items(id) ON DELETE SET NULL`,
            `ALTER TABLE production_output_lots ADD COLUMN IF NOT EXISTS "secondItemId" uuid REFERENCES items(id) ON DELETE SET NULL`,
            `ALTER TABLE production_output_lots ADD COLUMN IF NOT EXISTS "finishedBatchId" uuid REFERENCES batches(id) ON DELETE SET NULL`,
            `ALTER TABLE production_output_lots ADD COLUMN IF NOT EXISTS "secondBatchId" uuid REFERENCES batches(id) ON DELETE SET NULL`,
            `ALTER TABLE production_output_lots ADD COLUMN IF NOT EXISTS "targetDepotId" uuid REFERENCES depots(id) ON DELETE SET NULL`,
            `ALTER TABLE production_output_lots ADD COLUMN IF NOT EXISTS "targetPositionId" uuid REFERENCES positions(id) ON DELETE SET NULL`,
            `ALTER TABLE production_output_lots ADD COLUMN IF NOT EXISTS "stockPostedAt" timestamp`,
            `ALTER TABLE production_output_lots ADD COLUMN IF NOT EXISTS "stockPostedBy" varchar`,
        ]) await queryRunner.query(statement);
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_production_output_schedule_article" ON production_output_lots ("scheduleId", "articleCodeSnapshot")`);
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_production_output_lot_number" ON production_output_lots ("lotNumber")`);

        await queryRunner.query(`
            DO $$ BEGIN
                IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'movimientos_tipo_enum') THEN
                    ALTER TYPE movimientos_tipo_enum ADD VALUE IF NOT EXISTS 'INGRESO_PRODUCCION';
                    ALTER TYPE movimientos_tipo_enum ADD VALUE IF NOT EXISTS 'ANULACION_INGRESO_PRODUCCION';
                    ALTER TYPE movimientos_tipo_enum ADD VALUE IF NOT EXISTS 'DEVOLUCION_LINEA';
                    ALTER TYPE movimientos_tipo_enum ADD VALUE IF NOT EXISTS 'ANULACION_DEVOLUCION_LINEA';
                END IF;
                IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'documentos_tipo_enum') THEN
                    ALTER TYPE documentos_tipo_enum ADD VALUE IF NOT EXISTS 'SOLICITUD_PRODUCCION';
                    ALTER TYPE documentos_tipo_enum ADD VALUE IF NOT EXISTS 'CIERRE_PRODUCCION';
                END IF;
            END $$
        `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_production_actual_history" ON production_actual_entries ("recordDate", "createdAt")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_production_actual_status_date" ON production_actual_entries (status, "recordDate")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_production_schedule_status_date" ON production_schedules (status, "planDate")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_purchase_order_status_expected" ON purchase_orders (estado, "fechaEntregaEsperada")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_purchase_order_depot_issued" ON purchase_orders ("depositoId", "fechaEmision")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_movimiento_status_date" ON movimientos (status, fecha)`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_movimiento_documento" ON movimientos ("documentoId")`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_9ea2fa9b87e80d9d442384a8c7"`);
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_documentos_tipo_numero_activo" ON documentos (tipo, numero) WHERE status = 'ACTIVO'`);
    }

    public async down(): Promise<void> {
        // Migración deliberadamente aditiva: no se eliminan tablas ni trazabilidad productiva automáticamente.
    }
}
