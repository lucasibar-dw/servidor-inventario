import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeEndTimeNullableInMachineChanges1788500000000 implements MigrationInterface {
    name = 'MakeEndTimeNullableInMachineChanges1788500000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE machine_changes ALTER COLUMN "endTime" DROP NOT NULL;`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE machine_changes ALTER COLUMN "endTime" SET NOT NULL;`);
    }
}
