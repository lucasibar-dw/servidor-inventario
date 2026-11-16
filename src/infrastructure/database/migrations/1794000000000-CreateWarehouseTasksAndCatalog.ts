import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWarehouseTasksAndCatalog1794000000000 implements MigrationInterface {
    name = 'CreateWarehouseTasksAndCatalog1794000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Catálogo de Tipos de Tarea con Tiempos Estimados
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "task_type_catalog" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "codigo" character varying(50) NOT NULL,
                "nombre" character varying(150) NOT NULL,
                "descripcion" text,
                "depositoId" uuid,
                "tipoGeneral" character varying(50) NOT NULL DEFAULT 'EXTRAORDINARY',
                "tiempoEstimadoMinutos" integer NOT NULL DEFAULT 30,
                "activo" boolean NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_task_type_catalog_id" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_task_type_catalog_codigo" UNIQUE ("codigo"),
                CONSTRAINT "FK_task_type_catalog_deposito" FOREIGN KEY ("depositoId") REFERENCES "depots"("id") ON DELETE SET NULL
            );
        `);

        // 2. Modificaciones en tabla tasks para enriquecerla
        await queryRunner.query(`
            ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "depositoId" uuid REFERENCES "depots"("id") ON DELETE SET NULL;
            ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "taskTypeId" uuid REFERENCES "task_type_catalog"("id") ON DELETE SET NULL;
            ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "title" character varying(200);
            ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "description" text;
            ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "customerOrDestination" character varying(150);
            ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP;
            ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "originSector" character varying(50) DEFAULT 'DEPOSITO';
            ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "controlType" character varying(50);
            ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "controlFilter" character varying(150);
            ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP;
            ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "tiempoEstimadoMinutos" integer DEFAULT 30;
            ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "tiempoRealMinutos" integer;
            ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "assignedEmployeeId" uuid REFERENCES "employees"("id") ON DELETE SET NULL;
            ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "completedByEmployeeId" uuid REFERENCES "employees"("id") ON DELETE SET NULL;
            ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "resultStatus" character varying(50);
            ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "resultNotes" text;

            ALTER TABLE "tasks" ALTER COLUMN "itemId" DROP NOT NULL;
            ALTER TABLE "tasks" ALTER COLUMN "sourcePositionId" DROP NOT NULL;
            ALTER TABLE "tasks" ALTER COLUMN "targetPositionId" DROP NOT NULL;
            ALTER TABLE "tasks" ALTER COLUMN "qty" DROP NOT NULL;
        `);

        // 3. Modificaciones en tabla employees
        await queryRunner.query(`
            ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "depositoId" uuid REFERENCES "depots"("id") ON DELETE SET NULL;
            ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "subSector" character varying(100);
        `);

        // 4. Semillas estándar de tipos de tarea
        await queryRunner.query(`
            INSERT INTO "task_type_catalog" ("id", "codigo", "nombre", "descripcion", "tipoGeneral", "tiempoEstimadoMinutos", "activo")
            VALUES 
                ('a0000001-0000-0000-0000-000000000001', 'PREP_HILADO_CLIENTE', 'Armado y pesaje de hilado para cliente/planta', 'Preparación de conos, pesaje y embalaje para despacho (Catamarca, San Martín, etc.)', 'CUSTOMER_ORDER', 60, true),
                ('a0000001-0000-0000-0000-000000000002', 'CONTROL_CATEGORIA_GOMA', 'Control y cotejo de categoría (Goma / Elastómero)', 'Revisión física completa del stock de goma y posiciones', 'INVENTORY_CONTROL', 45, true),
                ('a0000001-0000-0000-0000-000000000003', 'CONTROL_POSICIONES_VACIAS', 'Verificación de posiciones vacías', 'Auditar que las posiciones teóricamente vacías estén libres y limpias', 'INVENTORY_CONTROL', 30, true),
                ('a0000001-0000-0000-0000-000000000004', 'CONTROL_POSICION_FISICA', 'Auditoría de posición física específica', 'Conteo y confirmación de bultos en posición puntual', 'INVENTORY_CONTROL', 20, true),
                ('a0000001-0000-0000-0000-000000000005', 'CONTROL_PRE_ARRIBO_COLOR', 'Chequeo preventivo de espacio para color entrante', 'Verificar stock actual y liberar huecos para recepción de hilado teñido', 'INVENTORY_CONTROL', 25, true),
                ('a0000001-0000-0000-0000-000000000006', 'PUTAWAY_REMITO', 'Acomodo de mercadería recibida a estantería', 'Traslado desde zona de entrada a ubicación final asignada', 'PUTAWAY', 20, true),
                ('a0000001-0000-0000-0000-000000000007', 'DESCARGA_CAMION', 'Descarga y recepción física de camión', 'Bajada de pallets/cajas de proveedor al muelle de descarga', 'EXTRAORDINARY', 90, true),
                ('a0000001-0000-0000-0000-000000000008', 'ORDEN_LIMPIEZA_PASILLO', 'Orden, limpieza y acondicionamiento de pasillos', 'Mantenimiento del orden físico y despeje de vías de circulación', 'EXTRAORDINARY', 45, true)
            ON CONFLICT ("codigo") DO NOTHING;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "task_type_catalog" CASCADE;`);
    }
}
