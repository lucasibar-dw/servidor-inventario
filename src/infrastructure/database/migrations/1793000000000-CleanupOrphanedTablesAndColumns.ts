import { MigrationInterface, QueryRunner } from 'typeorm';

export class CleanupOrphanedTablesAndColumns1793000000000 implements MigrationInterface {
    name = 'CleanupOrphanedTablesAndColumns1793000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Eliminar tablas huérfanas de staging y módulos antiguos
        await queryRunner.query(`DROP TABLE IF EXISTS "stg_articulos" CASCADE;`);
        await queryRunner.query(`DROP TABLE IF EXISTS "stg_totvs" CASCADE;`);
        await queryRunner.query(`DROP TABLE IF EXISTS "stg_sb1" CASCADE;`);
        await queryRunner.query(`DROP TABLE IF EXISTS "stg_sg1" CASCADE;`);
        await queryRunner.query(`DROP TABLE IF EXISTS "articulo_item_refs" CASCADE;`);
        await queryRunner.query(`DROP TABLE IF EXISTS "articulo_categorias" CASCADE;`);
        await queryRunner.query(`DROP TYPE IF EXISTS "articulo_item_refs_rol_enum" CASCADE;`);

        // 2. Eliminar columnas obsoletas de TOTVS en articulos
        await queryRunner.query(`
            ALTER TABLE IF EXISTS "articulos"
                DROP COLUMN IF EXISTS "almacen",
                DROP COLUMN IF EXISTS "grupo",
                DROP COLUMN IF EXISTS "segundaUnidadMedida",
                DROP COLUMN IF EXISTS "factorConversion",
                DROP COLUMN IF EXISTS "tipoConversion",
                DROP COLUMN IF EXISTS "usaLote",
                DROP COLUMN IF EXISTS "usaUbicacion",
                DROP COLUMN IF EXISTS "ctdEmbalaje",
                DROP COLUMN IF EXISTS "puntoPedido",
                DROP COLUMN IF EXISTS "stockSeguridad",
                DROP COLUMN IF EXISTS "plazoEntrega",
                DROP COLUMN IF EXISTS "tipoPlazo",
                DROP COLUMN IF EXISTS "loteEconomico",
                DROP COLUMN IF EXISTS "tipoDecOP",
                DROP COLUMN IF EXISTS "entraMrp",
                DROP COLUMN IF EXISTS "stockMaximo",
                DROP COLUMN IF EXISTS "atiendeNe",
                DROP COLUMN IF EXISTS "tipoCC",
                DROP COLUMN IF EXISTS "detalleFalla";
        `);

        // 3. Eliminar columnas obsoletas de TOTVS en articulo_estructuras
        await queryRunner.query(`
            ALTER TABLE IF EXISTS "articulo_estructuras"
                DROP COLUMN IF EXISTS "posicion",
                DROP COLUMN IF EXISTS "secuencia",
                DROP COLUMN IF EXISTS "fechaInicio",
                DROP COLUMN IF EXISTS "fechaFin",
                DROP COLUMN IF EXISTS "tipoFijoVariable",
                DROP COLUMN IF EXISTS "revisionInicial",
                DROP COLUMN IF EXISTS "revisionFinal",
                DROP COLUMN IF EXISTS "detalleFalla",
                DROP COLUMN IF EXISTS "componenteAnterior";
        `);

        // 4. Limpiar los 3 depósitos ficticios inyectados anteriormente (si existen y no tienen stock)
        await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'positions') THEN
                    DELETE FROM "positions" 
                    WHERE "depositoId" IN ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333')
                      AND "id" NOT IN (SELECT DISTINCT "posicionId" FROM "stock_balance" WHERE "posicionId" IS NOT NULL);
                END IF;

                IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'depots') THEN
                    DELETE FROM "depots" 
                    WHERE "id" IN ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333')
                      AND "id" NOT IN (SELECT DISTINCT "depositoId" FROM "stock_balance" WHERE "depositoId" IS NOT NULL);
                END IF;
            END $$;
        `);
    }

    public async down(_queryRunner: QueryRunner): Promise<void> {
        // No-op ya que las tablas y columnas eliminadas eran obsoletas y no se revierten
    }
}
