import 'dotenv/config';
import { join } from 'path';
import { DataSource } from 'typeorm';

export default new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT || 5432),
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    entities: [join(__dirname, '../../**/*.entity{.ts,.js}')],
    migrations: [join(__dirname, 'migrations/*{.ts,.js}')],
    migrationsTableName: 'typeorm_migrations',
    synchronize: false,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});
