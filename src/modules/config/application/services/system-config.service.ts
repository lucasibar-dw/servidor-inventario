import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class SystemConfigService implements OnModuleInit {
    private readonly logger = new Logger(SystemConfigService.name);

    constructor(private readonly dataSource: DataSource) {}

    async onModuleInit() {
        try {
            await this.dataSource.query(`
                CREATE TABLE IF NOT EXISTS system_settings (
                    key VARCHAR(100) PRIMARY KEY,
                    value JSONB NOT NULL,
                    "updatedAt" TIMESTAMP DEFAULT NOW()
                );
                INSERT INTO system_settings (key, value)
                VALUES ('quarantine_enabled', 'false'::jsonb)
                ON CONFLICT (key) DO NOTHING;
            `);
            this.logger.log('system_settings table ensured and default quarantine_enabled initialized');
        } catch (error: any) {
            this.logger.warn(`Could not ensure system_settings table: ${error?.message}`);
        }
    }

    async get<T>(key: string, defaultValue: T): Promise<T> {
        try {
            const rows = await this.dataSource.query(
                `SELECT value FROM system_settings WHERE key = $1 LIMIT 1`,
                [key]
            );
            if (rows && rows.length > 0) {
                return rows[0].value as T;
            }
        } catch (error: any) {
            this.logger.warn(`Error reading system_settings key "${key}": ${error?.message}`);
        }
        return defaultValue;
    }

    async set(key: string, value: any): Promise<void> {
        await this.dataSource.query(
            `
            INSERT INTO system_settings (key, value, "updatedAt")
            VALUES ($1, $2, NOW())
            ON CONFLICT (key) DO UPDATE
            SET value = EXCLUDED.value, "updatedAt" = NOW()
            `,
            [key, JSON.stringify(value)]
        );
    }

    async isQuarantineEnabled(): Promise<boolean> {
        return this.get<boolean>('quarantine_enabled', false);
    }

    async setQuarantineEnabled(enabled: boolean): Promise<boolean> {
        await this.set('quarantine_enabled', Boolean(enabled));
        return Boolean(enabled);
    }
}
