import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateModuloArticulos1788600000000 implements MigrationInterface {
    name = 'CreateModuloArticulos1788600000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Tabla de Artículos
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "articulos" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "codigo" character varying(50) NOT NULL,
                "descripcion" character varying(255) NOT NULL,
                "tipo" character varying(10) NOT NULL,
                "unidadMedida" character varying(10) NOT NULL,
                "almacen" character varying(20),
                "grupo" character varying(30),
                "segundaUnidadMedida" character varying(10),
                "factorConversion" numeric(12,4),
                "tipoConversion" character varying(2),
                "usaLote" character varying(5),
                "usaUbicacion" character varying(5),
                "ctdEmbalaje" numeric(12,3),
                "puntoPedido" numeric(14,3),
                "stockSeguridad" numeric(14,3),
                "plazoEntrega" numeric(10,2),
                "tipoPlazo" character varying(5),
                "loteEconomico" numeric(14,3),
                "tipoDecOP" character varying(5),
                "entraMrp" character varying(5),
                "stockMaximo" numeric(14,3),
                "atiendeNe" character varying(5),
                "tipoCC" character varying(5),
                "tipoArticulo" character varying(50),
                "articuloGenerico" character varying(50),
                "marca" character varying(50),
                "talle" character varying(20),
                "unidades" integer,
                "pesoU" numeric(10,4),
                "detalleFalla" text,
                "codigoAnterior" character varying(100),
                "estadoRevision" character varying(20) DEFAULT 'VERDE',
                "fuenteControl" text,
                "detalleRevision" text,
                "activo" boolean NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_articulos_id" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_articulos_codigo" UNIQUE ("codigo")
            );

            CREATE INDEX IF NOT EXISTS "IDX_articulos_tipo" ON "articulos" ("tipo");
            CREATE INDEX IF NOT EXISTS "IDX_articulos_marca" ON "articulos" ("marca");
            CREATE INDEX IF NOT EXISTS "IDX_articulos_talle" ON "articulos" ("talle");
            CREATE INDEX IF NOT EXISTS "IDX_articulos_tipoArticulo" ON "articulos" ("tipoArticulo");
            CREATE INDEX IF NOT EXISTS "IDX_articulos_articuloGenerico" ON "articulos" ("articuloGenerico");
            CREATE INDEX IF NOT EXISTS "IDX_articulos_estadoRevision" ON "articulos" ("estadoRevision");
        `);

        // 2. Tipos Enum para Movimientos de Artículos
        await queryRunner.query(`
            DO $$ BEGIN
                CREATE TYPE "tipo_movimiento_articulo_enum" AS ENUM (
                    'ENTRADA',
                    'SALIDA',
                    'AJUSTE_SUMA',
                    'AJUSTE_RESTA',
                    'SACADA_SEGUNDA',
                    'RECHAZO',
                    'ANULACION_ENTRADA',
                    'ANULACION_SALIDA',
                    'ANULACION_AJUSTE_SUMA',
                    'ANULACION_AJUSTE_RESTA',
                    'ANULACION_SACADA_SEGUNDA',
                    'ANULACION_RECHAZO'
                );
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;

            DO $$ BEGIN
                CREATE TYPE "movimiento_articulo_status_enum" AS ENUM (
                    'ACTIVO',
                    'ANULADO'
                );
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `);

        // 3. Tabla de Movimientos de Artículos (Histórico)
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "movimientos_articulos" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "tipo" "tipo_movimiento_articulo_enum" NOT NULL,
                "articuloId" uuid NOT NULL,
                "deposito" character varying(50) NOT NULL DEFAULT 'TERMINADO',
                "cantidad" numeric(14,3) NOT NULL,
                "lote" character varying(100),
                "documentoReferencia" character varying(100),
                "observaciones" text,
                "fecha" date NOT NULL,
                "userId" character varying(100),
                "status" "movimiento_articulo_status_enum" NOT NULL DEFAULT 'ACTIVO',
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_movimientos_articulos_id" PRIMARY KEY ("id"),
                CONSTRAINT "FK_movimientos_articulos_articulo" FOREIGN KEY ("articuloId") REFERENCES "articulos"("id") ON DELETE RESTRICT
            );

            CREATE INDEX IF NOT EXISTS "IDX_movimientos_articulos_articuloId" ON "movimientos_articulos" ("articuloId");
            CREATE INDEX IF NOT EXISTS "IDX_movimientos_articulos_deposito" ON "movimientos_articulos" ("deposito");
            CREATE INDEX IF NOT EXISTS "IDX_movimientos_articulos_tipo" ON "movimientos_articulos" ("tipo");
            CREATE INDEX IF NOT EXISTS "IDX_movimientos_articulos_fecha" ON "movimientos_articulos" ("fecha");
            CREATE INDEX IF NOT EXISTS "IDX_movimientos_articulos_status_date" ON "movimientos_articulos" ("status", "fecha");
        `);

        // 4. Tabla de Balance de Stock de Artículos (Consulta Rápida)
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "balance_stock_articulos" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "articuloId" uuid NOT NULL,
                "deposito" character varying(50) NOT NULL DEFAULT 'TERMINADO',
                "stockActual" numeric(14,3) NOT NULL DEFAULT 0,
                "totalEntradas" numeric(14,3) NOT NULL DEFAULT 0,
                "totalSalidas" numeric(14,3) NOT NULL DEFAULT 0,
                "totalSegunda" numeric(14,3) NOT NULL DEFAULT 0,
                "totalRechazos" numeric(14,3) NOT NULL DEFAULT 0,
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_balance_stock_articulos_id" PRIMARY KEY ("id"),
                CONSTRAINT "FK_balance_stock_articulos_articulo" FOREIGN KEY ("articuloId") REFERENCES "articulos"("id") ON DELETE CASCADE,
                CONSTRAINT "UQ_balance_stock_articulos_articulo_deposito" UNIQUE ("articuloId", "deposito")
            );
        `);

        // 5. Creación opcional de depósitos sugeridos (TERMINADO, COCIDO, TEJIDO) con 1 posición c/u si la tabla depots existe
        await queryRunner.query(`
            DO $$
            DECLARE
                dep_term_id uuid := '11111111-1111-1111-1111-111111111111';
                dep_coc_id uuid := '22222222-2222-2222-2222-222222222222';
                dep_tej_id uuid := '33333333-3333-3333-3333-333333333333';
            BEGIN
                IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'depots') THEN
                    INSERT INTO "depots" ("id", "nombre", "activo")
                    VALUES
                        (dep_term_id, 'PRODUCTO TERMINADO', true),
                        (dep_coc_id, 'COSTURA / COCIDO', true),
                        (dep_tej_id, 'TEJEDURIA / TEJIDO', true)
                    ON CONFLICT ("id") DO UPDATE SET "nombre" = EXCLUDED."nombre";

                    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'positions') THEN
                        INSERT INTO "positions" ("id", "depositoId", "codigo", "categoria", "activo")
                        VALUES
                            ('11111111-1111-1111-1111-111111111112', dep_term_id, 'TERM-01', 'TERMINADO', true),
                            ('22222222-2222-2222-2222-222222222223', dep_coc_id, 'COC-01', 'COCIDO', true),
                            ('33333333-3333-3333-3333-333333333334', dep_tej_id, 'TEJ-01', 'TEJIDO', true)
                        ON CONFLICT ("id") DO UPDATE SET "codigo" = EXCLUDED."codigo";
                    END IF;
                END IF;
            END $$;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "balance_stock_articulos";`);
        await queryRunner.query(`DROP TABLE IF EXISTS "movimientos_articulos";`);
        await queryRunner.query(`DROP TYPE IF EXISTS "tipo_movimiento_articulo_enum";`);
        await queryRunner.query(`DROP TYPE IF EXISTS "movimiento_articulo_status_enum";`);
        await queryRunner.query(`DROP TABLE IF EXISTS "articulos";`);
    }
}
