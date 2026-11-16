import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual, Not, DataSource, In } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { PlantEntity } from '../domain/entities/plant.entity';
import { MachineTypeEntity } from '../domain/entities/machine-type.entity';
import { MachineEntity, MachineStatus } from '../domain/entities/machine.entity';
import { MaintenanceLogEntity } from '../domain/entities/maintenance-log.entity';
import { DepotEntity } from 'src/modules/warehouse/infrastructure/persistence/entities/depot.entity';
import { MachineChangeEntity, ChangeType } from '../domain/entities/machine-change.entity';

@Injectable()
export class MaintenanceService implements OnModuleInit {
    private readonly logger = new Logger(MaintenanceService.name);

    constructor(
        @InjectRepository(PlantEntity)
        private readonly plantRepo: Repository<PlantEntity>,
        @InjectRepository(MachineTypeEntity)
        private readonly typeRepo: Repository<MachineTypeEntity>,
        @InjectRepository(MachineEntity)
        private readonly machineRepo: Repository<MachineEntity>,
        @InjectRepository(MaintenanceLogEntity)
        private readonly logRepo: Repository<MaintenanceLogEntity>,
        @InjectRepository(DepotEntity)
        private readonly depotRepo: Repository<DepotEntity>,
        @InjectRepository(MachineChangeEntity)
        private readonly changeRepo: Repository<MachineChangeEntity>,
        private readonly dataSource: DataSource,
    ) { }

    async onModuleInit() {
        await this.syncEnums();
        await this.ensureSchema();
        await this.seed();
        await this.syncDepotPlants();
        await this.syncAllMachines();
    }

    private async ensureSchema() {
        try {
            await this.dataSource.query(`ALTER TABLE IF EXISTS machine_changes ALTER COLUMN "endTime" DROP NOT NULL;`);
            this.logger.log('Verified and ensured machine_changes.endTime is nullable');
        } catch (err: any) {
            this.logger.warn(`Could not alter machine_changes.endTime nullability: ${err?.message}`);
        }
    }

    private async syncEnums() {
        this.logger.log('Checking and syncing MachineStatus enums in database...');
        const statuses = Object.values(MachineStatus);
        
        try {
            // Check for both tables that use the enum
            const tables = ['machines', 'maintenance_logs'];
            const columns = ['status', 'fromStatus', 'toStatus']; // fromStatus/toStatus are in logs

            for (const status of statuses) {
                // Postgres doesn't allow adding enum values inside a transaction in some versions, 
                // but TypeORM usually handles this or we can use raw SQL with IF NOT EXISTS logic
                try {
                    // Try to add the value to the type. Note: ALTER TYPE cannot be run in a transaction block in some PG versions.
                    // We use a try-catch for each to ignore "already exists" errors.
                    await this.dataSource.query(`ALTER TYPE "public"."machines_status_enum" ADD VALUE IF NOT EXISTS '${status}'`);
                } catch (e) {
                    // Ignore if already exists or if type doesn't exist yet
                }
            }
        } catch (error) {
            this.logger.warn('Could not sync enums automatically. This is normal if using a non-Postgres DB or if enums are handled differently.');
        }
    }

    private async syncDepotPlants() {
        this.logger.log('Syncing existing depots with formal plant relations...');
        const dwPlant = await this.plantRepo.findOneBy({ name: 'Der Will' });
        const roPlant = await this.plantRepo.findOneBy({ name: 'Rocotex' });

        if (dwPlant) {
            await this.depotRepo.createQueryBuilder()
                .update()
                .set({ plantId: dwPlant.id } as any)
                .where('planta = :name', { name: 'Der Will' })
                .execute();
        }

        if (roPlant) {
            await this.depotRepo.createQueryBuilder()
                .update()
                .set({ plantId: roPlant.id } as any)
                .where('planta = :name', { name: 'Rocotex' })
                .execute();
        }
    }

    async seed() {
        this.logger.log('Starting Maintenance/Production seeding...');

        // 1. Seed Plants
        const plants = [
            { name: 'Der Will', location: 'Buenos Aires' },
            { name: 'Rocotex', location: 'Catamarca' }
        ];

        for (const p of plants) {
            const exists = await this.plantRepo.findOneBy({ name: p.name });
            if (!exists) {
                await this.plantRepo.save(this.plantRepo.create({ ...p, id: uuidv4() }));
            }
        }

        // 2. Seed Machine Types
        const types = ['Tejeduría', 'Costura', 'Planchas', 'Apiladoras'];
        for (const t of types) {
            const exists = await this.typeRepo.findOneBy({ name: t });
            if (!exists) {
                await this.typeRepo.save(this.typeRepo.create({ name: t, id: uuidv4() }));
            }
        }

        // 3. Seed Machines
        const dwPlant = await this.plantRepo.findOneBy({ name: 'Der Will' });
        const roPlant = await this.plantRepo.findOneBy({ name: 'Rocotex' });
        const tejType = await this.typeRepo.findOneBy({ name: 'Tejeduría' });
        const cosType = await this.typeRepo.findOneBy({ name: 'Costura' });
        const plaType = await this.typeRepo.findOneBy({ name: 'Planchas' });
        const apiType = await this.typeRepo.findOneBy({ name: 'Apiladoras' });

        if (dwPlant && roPlant && tejType && cosType && plaType && apiType) {
            await this.seedMachinesForPlant(dwPlant.id, tejType.id, 190);
            await this.seedMachinesForPlant(dwPlant.id, cosType.id, 20);
            await this.seedMachinesForPlant(dwPlant.id, plaType.id, 4);
            await this.seedMachinesForPlant(dwPlant.id, apiType.id, 4);
            await this.seedMachinesForPlant(roPlant.id, tejType.id, 84);
        }

        this.logger.log('Maintenance/Production seeding completed.');
    }

    private async seedMachinesForPlant(plantId: string, typeId: string, count: number) {
        const existingCount = await this.machineRepo.countBy({ plantId });
        if (existingCount < count) {
            const machines = [];
            for (let i = existingCount + 1; i <= count; i++) {
                machines.push(this.machineRepo.create({
                    id: uuidv4(),
                    plantId,
                    typeId,
                    number: i,
                    codigoInterno: i.toString(),
                    nombre: i.toString(),
                    status: MachineStatus.ACTIVA
                }));
            }
            await this.machineRepo.save(machines);
        }
    }

    async getPlants() {
        return this.plantRepo.find();
    }

    async getMachineTypes(detailed: boolean = false) {
        if (detailed) {
            return this.typeRepo.find({ order: { name: 'ASC' } });
        }
        // Retornar los tipos base (los que no tienen modelo específico o los 4 sectores base)
        const allTypes = await this.typeRepo.find({ order: { name: 'ASC' } });
        const baseTypes = allTypes.filter(t => !t.modelo && !t.marca);
        return baseTypes.length > 0 ? baseTypes : allTypes;
    }

    /**
     * Resuelve un typeId dado a todos los typeIds asociados (si es un tipo base/categoría,
     * incluye tanto el base como todos los subtipos técnicos que comparten esa categoría).
     */
    private async resolveTypeIds(typeId?: string): Promise<string[] | null> {
        if (!typeId || typeId === 'ALL') return null;

        const targetType = await this.typeRepo.findOneBy({ id: typeId });
        if (!targetType) return [typeId];

        // Determinar categoría por category o por name base (ej. 'Tejeduría' o 'TEJEDURIA')
        const category = targetType.category || (
            targetType.name.toLowerCase().includes('tejedur') ? 'TEJEDURIA' :
            targetType.name.toLowerCase().includes('costur') ? 'COSTURA' :
            targetType.name.toLowerCase().includes('plancha') ? 'PLANCHAS' :
            targetType.name.toLowerCase().includes('apilador') ? 'APILADORAS' : null
        );

        if (category) {
            const relatedTypes = await this.typeRepo.find({
                where: { category }
            });
            const ids = new Set<string>(relatedTypes.map(t => t.id));
            ids.add(targetType.id);
            return Array.from(ids);
        }

        return [typeId];
    }

        async getMachines(plantId?: string, typeId?: string) {
        const resolvedTypeIds = await this.resolveTypeIds(typeId);
        const qb = this.machineRepo.createQueryBuilder('m')
            .leftJoinAndSelect('m.plant', 'plant')
            .leftJoinAndSelect('m.type', 'type');

        if (plantId && plantId !== 'ALL' && plantId !== 'undefined') {
            qb.andWhere('m.plantId = :plantId', { plantId });
        }

        if (resolvedTypeIds && resolvedTypeIds.length > 0) {
            qb.andWhere('m.typeId IN (:...typeIds)', { typeIds: resolvedTypeIds });
        }

        const machines = await qb.orderBy('m.number', 'ASC').getMany();

        if (machines.length === 0) return [];

        // Query active changes for these machines (where endTime is NULL)
        const activeChangesQb = this.changeRepo.createQueryBuilder('c')
            .innerJoin('c.machine', 'm')
            .where('c.endTime IS NULL')
            .select(['c.id', 'c.machineId', 'c.changeTypes', 'c.startTime', 'c.observation', 'c.generatedBy']);

        if (plantId && plantId !== 'ALL' && plantId !== 'undefined') {
            activeChangesQb.andWhere('m.plantId = :plantId', { plantId });
        }

        const activeChanges = await activeChangesQb.getMany();

        const activeChangesMap = new Map(activeChanges.map(c => [c.machineId, c]));

        // Fetch logs for all these machines to calculate individual KPIs
        const logs = await this.logRepo.find({
            where: machines.map(m => ({ machineId: m.id })),
            order: { timestamp: 'ASC' }
        });

        const logsByMachine: Record<string, MaintenanceLogEntity[]> = {};
        for (const log of logs) {
            if (!logsByMachine[log.machineId]) logsByMachine[log.machineId] = [];
            logsByMachine[log.machineId].push(log);
        }

        const now = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(now.getDate() - 30);

        return machines.map(machine => {
            const mLogs = logsByMachine[machine.id] || [];
            const kpis = this.calculateKPIs(mLogs, thirtyDaysAgo, now);
            const activeChange = activeChangesMap.get(machine.id);
            
            // Extract numerical values for sorting in frontend
            // mtbfMs and mttrMs are in ms, we can convert to days/hours or just send ms
            return {
                ...machine,
                activeChange: activeChange ? {
                    id: activeChange.id,
                    changeTypes: activeChange.changeTypes,
                    startTime: activeChange.startTime,
                    observation: activeChange.observation,
                    generatedBy: activeChange.generatedBy
                } : null,
                originalStatus: machine.status,
                status: activeChange ? 'CAMBIO' : machine.status,
                mtbf: Math.round(kpis.mtbfMs / (1000 * 60 * 60 * 24) * 10) / 10, // Days
                mttr: Math.round(kpis.mttrMs / (1000 * 60 * 60) * 10) / 10,     // Hours
            };
        });
    }

    async updateMachineStatus(id: string, dto: {
        status: MachineStatus;
        observation?: string;
        generatedBy: string;
        failureType?: string;
        timestamp?: string;
        isBatch?: boolean;
    }) {
        return await this.dataSource.transaction(async (manager) => {
            const machineRepo = manager.getRepository(MachineEntity);
            const logRepo = manager.getRepository(MaintenanceLogEntity);

            const machine = await machineRepo.findOneBy({ id });
            if (!machine) throw new Error('Machine not found');

            const statusChangeDate = dto.timestamp ? new Date(dto.timestamp) : new Date();

            // 1. Si viene desde la carga por Lotes (Histórica/Multiregistro)
            if (dto.isBatch) {
                // Buscamos cuál era el estado real de la máquina justo antes de esta fecha/hora cargada
                const prevLog = await logRepo.findOne({
                    where: {
                        machineId: machine.id,
                        timestamp: LessThanOrEqual(statusChangeDate)
                    },
                    order: { timestamp: 'DESC' }
                });
                const fromStatus = prevLog ? prevLog.toStatus : MachineStatus.ACTIVA;

                // Siempre insertamos el registro histórico en los logs
                const log = logRepo.create({
                    id: uuidv4(),
                    machineId: machine.id,
                    fromStatus,
                    toStatus: dto.status,
                    failureType: dto.failureType,
                    observation: dto.observation,
                    generatedBy: dto.generatedBy,
                    timestamp: statusChangeDate
                });
                await logRepo.save(log);

                // Recalculamos el estado en vivo de la máquina basándonos en el log absolutamente más nuevo.
                // Así, si se insertó un registro de ayer, no le altera el estado físico real de hoy.
                const latestLogOverall = await logRepo.findOne({
                    where: { machineId: machine.id },
                    order: { timestamp: 'DESC' }
                });

                if (latestLogOverall) {
                    machine.status = latestLogOverall.toStatus;
                    machine.lastObservation = latestLogOverall.observation ?? '';
                    machine.lastChangeBy = latestLogOverall.generatedBy;
                    machine.lastFailureType = latestLogOverall.failureType ?? null;
                    machine.lastStatusChange = latestLogOverall.timestamp;
                }
                await machineRepo.save(machine);
                return machine;
            }

            // 2. Comportamiento Estándar (En vivo desde el Dashboard / Tarjetas)
            const fromStatus = machine.status;

            // Si el estado es el mismo, el usuario solo está modificando/enriqueciendo los datos del parte actual
            if (fromStatus === dto.status) {
                const latestLog = await logRepo.findOne({
                    where: { machineId: machine.id },
                    order: { timestamp: 'DESC' }
                });

                if (latestLog) {
                    if (dto.failureType !== undefined) latestLog.failureType = dto.failureType;
                    if (dto.observation !== undefined) latestLog.observation = dto.observation;
                    latestLog.generatedBy = dto.generatedBy;
                    if (dto.timestamp) {
                        latestLog.timestamp = statusChangeDate;
                    }
                    await logRepo.save(latestLog);

                    if (dto.observation !== undefined) machine.lastObservation = dto.observation;
                    machine.lastChangeBy = dto.generatedBy;
                    if (dto.failureType !== undefined) machine.lastFailureType = dto.failureType;
                    if (dto.timestamp) {
                        machine.lastStatusChange = statusChangeDate;
                    }
                    await machineRepo.save(machine);
                    return machine;
                }
            }

            // Si hay un cambio de estado real en vivo, se genera un nuevo registro
            machine.status = dto.status;
            machine.lastObservation = dto.observation ?? '';
            machine.lastChangeBy = dto.generatedBy;
            machine.lastFailureType = dto.failureType ?? null;
            machine.lastStatusChange = statusChangeDate;
            await machineRepo.save(machine);

            const log = logRepo.create({
                id: uuidv4(),
                machineId: machine.id,
                fromStatus,
                toStatus: dto.status,
                failureType: dto.failureType,
                observation: dto.observation,
                generatedBy: dto.generatedBy,
                timestamp: statusChangeDate
            });
            await logRepo.save(log);

            return machine;
        });
    }

    async getMetrics(plantId: string, typeId?: string) {
        const resolvedTypeIds = await this.resolveTypeIds(typeId);

        const totalQb = this.machineRepo.createQueryBuilder('m')
            .where('m.plantId = :plantId', { plantId });
        if (resolvedTypeIds && resolvedTypeIds.length > 0) {
            totalQb.andWhere('m.typeId IN (:...typeIds)', { typeIds: resolvedTypeIds });
        }
        const total = await totalQb.getCount();

        // Query active changes (open machine changes where endTime IS NULL)
        const activeChangesQb = this.changeRepo.createQueryBuilder('c')
            .innerJoin('c.machine', 'm')
            .where('c.endTime IS NULL')
            .andWhere('m.plantId = :plantId', { plantId });

        if (resolvedTypeIds && resolvedTypeIds.length > 0) {
            activeChangesQb.andWhere('m.typeId IN (:...typeIds)', { typeIds: resolvedTypeIds });
        }

        const activeChanges = await activeChangesQb.select(['c.machineId', 'm.status']).getRawMany();
        const activeChangeMachineIds = new Set(activeChanges.map(a => a.c_machineId || a.machineId));
        const activeChangesCount = activeChangeMachineIds.size;
        
        const failuresQuery = this.machineRepo.createQueryBuilder('m')
            .where('m.plantId = :plantId', { plantId })
            .andWhere('m.status != :status', { status: MachineStatus.ACTIVA });

        if (resolvedTypeIds && resolvedTypeIds.length > 0) {
            failuresQuery.andWhere('m.typeId IN (:...typeIds)', { typeIds: resolvedTypeIds });
        }

        const baseFailures = await failuresQuery.getCount();

        const byStatusQuery = this.machineRepo.createQueryBuilder('m')
            .select('m.status', 'status')
            .addSelect('COUNT(*)', 'count')
            .where('m.plantId = :plantId', { plantId });

        if (resolvedTypeIds && resolvedTypeIds.length > 0) {
            byStatusQuery.andWhere('m.typeId IN (:...typeIds)', { typeIds: resolvedTypeIds });
        }

        const rawByStatus = await byStatusQuery
            .groupBy('m.status')
            .getRawMany();

        // Adjust byStatus: machines in active change are deducted from their raw status and added to 'CAMBIO'
        const statusMap: Record<string, number> = {};
        for (const row of rawByStatus) {
            statusMap[row.status] = parseInt(row.count, 10) || 0;
        }

        let activeToCambioDeduction = 0;
        for (const ac of activeChanges) {
            const rawStatus = ac.m_status || ac.status;
            if (rawStatus && statusMap[rawStatus] && statusMap[rawStatus] > 0) {
                statusMap[rawStatus]--;
                if (rawStatus === MachineStatus.ACTIVA) {
                    activeToCambioDeduction++;
                }
            }
        }
        if (activeChangesCount > 0) {
            statusMap['CAMBIO'] = activeChangesCount;
        }

        const byStatus = Object.entries(statusMap)
            .filter(([_, count]) => count > 0)
            .map(([status, count]) => ({ status, count: String(count) }));

        const failures = baseFailures + activeToCambioDeduction;

        return {
            total,
            running: Math.max(0, total - failures),
            failed: failures,
            byStatus
        };
    }

    async getMachineKPIs(id: string, startDate?: Date, endDate?: Date) {
        const machine = await this.machineRepo.findOneBy({ id });
        if (!machine) throw new Error('Machine not found');

        const logs = await this.logRepo.find({
            where: { machineId: id },
            order: { timestamp: 'ASC' }
        });

        // Filter logs by date range if provided
        let filteredLogs = logs;
        if (startDate && endDate) {
            filteredLogs = logs.filter(l => l.timestamp >= startDate && l.timestamp <= endDate);
        }

        return this.calculateKPIs(filteredLogs, startDate || logs[0]?.timestamp || machine.createdAt, endDate || new Date());
    }

    async getPlantKPIs(plantId: string, startDate?: Date, endDate?: Date, typeId?: string) {
        const resolvedTypeIds = await this.resolveTypeIds(typeId);
        const qb = this.machineRepo.createQueryBuilder('m')
            .where('m.plantId = :plantId', { plantId });
        if (resolvedTypeIds && resolvedTypeIds.length > 0) {
            qb.andWhere('m.typeId IN (:...typeIds)', { typeIds: resolvedTypeIds });
        }
        const machines = await qb.getMany();
        const machineIds = machines.map(m => m.id);
        
        const logs = await this.logRepo.find({
            where: machineIds.length > 0 ? machineIds.map(id => ({ machineId: id })) : [],
            order: { timestamp: 'ASC' }
        });

        let filteredLogs = logs;
        if (startDate && endDate) {
            filteredLogs = logs.filter(l => l.timestamp >= startDate && l.timestamp <= endDate);
        }

        // Group logs by machine
        const logsByMachine: Record<string, MaintenanceLogEntity[]> = {};
        for (const log of filteredLogs) {
            if (!logsByMachine[log.machineId]) logsByMachine[log.machineId] = [];
            logsByMachine[log.machineId].push(log);
        }

        let totalUptimeMs = 0;
        let totalDowntimeMs = 0;
        let totalFailures = 0;
        let totalRepairs = 0;
        let totalTimeToRepairMs = 0;
        let maxPlantUptimeMs = 0;

        for (const machine of machines) {
            const mLogs = logsByMachine[machine.id] || [];
            const machineStartDate = startDate || mLogs[0]?.timestamp || machine.createdAt || new Date();
            const machineEndDate = endDate || new Date();
            
            const mKPIs = this.calculateRawKPIs(mLogs, machineStartDate, machineEndDate);
            
            totalUptimeMs += mKPIs.uptimeMs;
            totalDowntimeMs += mKPIs.downtimeMs;
            totalFailures += mKPIs.failures;
            totalRepairs += mKPIs.repairs;
            totalTimeToRepairMs += mKPIs.totalTimeToRepairMs;
            
            maxPlantUptimeMs += (machineEndDate.getTime() - machineStartDate.getTime());
        }

        const availability = maxPlantUptimeMs > 0 ? (totalUptimeMs / maxPlantUptimeMs) * 100 : 100;
        const mtbfMs = totalFailures > 0 ? totalUptimeMs / totalFailures : totalUptimeMs;
        const mttrMs = totalRepairs > 0 ? totalTimeToRepairMs / totalRepairs : (totalDowntimeMs > 0 ? totalDowntimeMs : 0);

        return {
            availability: availability.toFixed(2) + '%',
            mtbf: this.formatDuration(mtbfMs),
            mttr: this.formatDuration(mttrMs),
            failures: totalFailures,
            repairs: totalRepairs,
            oee: '0%', // Temporalmente en 0% hasta tener carga de producción
        };
    }

    private isActiveStatus(status: MachineStatus): boolean {
        return [
            MachineStatus.ACTIVA,
            MachineStatus.REVISAR,
            MachineStatus.VELOCIDAD_REDUCIDA,
            MachineStatus.FALTA_COSTURA,
            MachineStatus.MUESTRAS
        ].includes(status);
    }

    public calculateRawKPIs(logs: MaintenanceLogEntity[], startDate: Date, endDate: Date) {
        let uptimeMs = 0;
        let downtimeMs = 0;
        let failures = 0;
        let repairs = 0;
        let totalTimeToRepairMs = 0;
        let totalTimeToFailureMs = 0;

        const effectiveStartDate = startDate;
        const effectiveEndDate = endDate;

        let currentStatus = MachineStatus.ACTIVA;
        let lastTime = effectiveStartDate.getTime();
        let currentDowntimeStart: number | null = null;
        let currentUptimeStart: number | null = effectiveStartDate.getTime();

        for (const log of logs) {
            const logTime = log.timestamp.getTime();
            
            if (logTime < effectiveStartDate.getTime()) {
                currentStatus = log.toStatus;
                if (!this.isActiveStatus(currentStatus)) {
                    currentDowntimeStart = effectiveStartDate.getTime();
                    currentUptimeStart = null;
                } else {
                    currentDowntimeStart = null;
                    currentUptimeStart = effectiveStartDate.getTime();
                }
                continue;
            }
            if (logTime > effectiveEndDate.getTime()) break;

            const duration = logTime - lastTime;
            const wasActive = this.isActiveStatus(currentStatus);
            const isNowActive = this.isActiveStatus(log.toStatus);

            if (wasActive) {
                uptimeMs += duration;
                if (!isNowActive) {
                    failures++;
                    if (currentUptimeStart !== null) {
                        totalTimeToFailureMs += (logTime - currentUptimeStart);
                    }
                    currentDowntimeStart = logTime;
                    currentUptimeStart = null;
                }
            } else {
                downtimeMs += duration;
                if (isNowActive) {
                    repairs++;
                    if (currentDowntimeStart !== null) {
                        totalTimeToRepairMs += (logTime - currentDowntimeStart);
                    }
                    currentUptimeStart = logTime;
                    currentDowntimeStart = null;
                }
            }

            currentStatus = log.toStatus;
            lastTime = logTime;
        }

        const finalDuration = effectiveEndDate.getTime() - lastTime;
        if (this.isActiveStatus(currentStatus)) {
            uptimeMs += finalDuration;
            if (currentUptimeStart !== null) {
                totalTimeToFailureMs += (effectiveEndDate.getTime() - currentUptimeStart);
            }
        } else {
            downtimeMs += finalDuration;
            if (currentDowntimeStart !== null) {
                totalTimeToRepairMs += (effectiveEndDate.getTime() - currentDowntimeStart);
            }
        }

        return { uptimeMs, downtimeMs, failures, repairs, totalTimeToRepairMs, totalTimeToFailureMs };
    }

    public calculateKPIs(logs: MaintenanceLogEntity[], startDate: Date, endDate: Date) {
        const raw = this.calculateRawKPIs(logs, startDate, endDate);
        const totalPeriodTime = endDate.getTime() - startDate.getTime();

        const availability = totalPeriodTime > 0 ? (raw.uptimeMs / totalPeriodTime) * 100 : 100;
        const mtbf = raw.failures > 0 ? raw.totalTimeToFailureMs / raw.failures : raw.uptimeMs;
        const mttr = raw.repairs > 0 ? raw.totalTimeToRepairMs / raw.repairs : (raw.downtimeMs > 0 ? raw.downtimeMs : 0);

        return {
            uptime: this.formatDuration(raw.uptimeMs),
            downtime: this.formatDuration(raw.downtimeMs),
            availability: availability.toFixed(2) + '%',
            mtbf: this.formatDuration(mtbf),
            mttr: this.formatDuration(mttr),
            mttf: this.formatDuration(mtbf),
            failures: raw.failures,
            repairs: raw.repairs,
            uptimeMs: raw.uptimeMs,
            downtimeMs: raw.downtimeMs,
            mtbfMs: mtbf,
            mttrMs: mttr,
            oee: '0%', // Temporalmente en 0% hasta tener carga de producción
            history: logs.slice(-10).reverse()
        };
    }

    async findAllLogs(query: { plantId?: string; machineId?: string; startDate?: string; endDate?: string; status?: string; machineNumber?: string; simplified?: boolean }) {
        const qb = this.logRepo.createQueryBuilder('log');

        if (query.simplified) {
            qb.select(['log.id', 'log.timestamp', 'log.fromStatus', 'log.toStatus']);
            if (query.plantId) {
                qb.leftJoin('log.machine', 'machine')
                  .andWhere('machine.plantId = :plantId', { plantId: query.plantId });
            }
        } else {
            qb.leftJoinAndSelect('log.machine', 'machine')
              .leftJoinAndSelect('machine.plant', 'plant');
            if (query.plantId) {
                qb.andWhere('machine.plantId = :plantId', { plantId: query.plantId });
            }
        }

        qb.orderBy('log.timestamp', 'ASC'); // Order by ASC to calculate durations correctly

        if (query.machineId) {
            qb.andWhere('log.machineId = :machineId', { machineId: query.machineId });
        }

        if (query.machineNumber) {
            if (query.simplified && !query.plantId) {
                qb.leftJoin('log.machine', 'machine');
            }
            qb.andWhere('machine.number = :machineNumber', { machineNumber: query.machineNumber });
        }

        if (query.status) {
            qb.andWhere('log.toStatus = :status', { status: query.status });
        }

        if (query.startDate) {
            qb.andWhere('log.timestamp >= :start', { start: new Date(`${query.startDate}T00:00:00.000-03:00`) });
        }

        let endBoundary: Date | null = null;
        if (query.endDate) {
            endBoundary = new Date(`${query.endDate}T23:59:59.999-03:00`);
            qb.andWhere('log.timestamp <= :endBoundary', { endBoundary });
        }

        const logs = await qb.getMany();

        if (query.simplified) {
            return logs;
        }

        // Map each log (except the last one for each machine in the fetched range)
        // to its chronological next log in the same list.
        const nextLogMap = new Map<string, MaintenanceLogEntity>();
        const currentActiveLogPerMachine = new Map<string, MaintenanceLogEntity>();
        const lastLogPerMachine = new Map<string, MaintenanceLogEntity>();

        for (const log of logs) {
            const prevLog = currentActiveLogPerMachine.get(log.machineId);
            if (prevLog) {
                nextLogMap.set(prevLog.id, log);
            }
            currentActiveLogPerMachine.set(log.machineId, log);
            lastLogPerMachine.set(log.machineId, log);
        }

        // For the last log of each machine in the range, check if there is a next log
        // in the database outside our date range.
        const machineIds = Array.from(lastLogPerMachine.keys());
        const nextSubsequentLogMap = new Map<string, MaintenanceLogEntity>();

        if (endBoundary && machineIds.length > 0) {
            const subsequentLogs = await this.logRepo.createQueryBuilder('log')
                .where('log.machineId IN (:...machineIds)', { machineIds })
                .andWhere('log.timestamp > :endBoundary', { endBoundary })
                .orderBy('log.machineId', 'ASC')
                .addOrderBy('log.timestamp', 'ASC')
                .getMany();

            for (const log of subsequentLogs) {
                const lastLog = lastLogPerMachine.get(log.machineId);
                if (lastLog) {
                    if (!nextSubsequentLogMap.has(lastLog.id)) {
                        nextSubsequentLogMap.set(lastLog.id, log);
                    }
                }
            }
        }

        const nowMs = new Date().getTime();
        const enrichedLogs = logs.map((log) => {
            const nextLog = nextLogMap.get(log.id) || nextSubsequentLogMap.get(log.id);
            const durationMs = nextLog 
                ? nextLog.timestamp.getTime() - log.timestamp.getTime() 
                : nowMs - log.timestamp.getTime();

            return {
                ...log,
                durationMs,
                durationFormatted: this.formatDuration(durationMs),
                isResolved: !!nextLog
            };
        });

        return enrichedLogs.reverse(); // Return in DESC order for the UI
    }

    async getMaintenanceStats(query: { 
        startDate: string; 
        endDate: string; 
        startTime?: string; 
        endTime?: string;
        plantId?: string;
    }) {
        const start = new Date(`${query.startDate}T00:00:00.000-03:00`);
        const end = new Date(`${query.endDate}T23:59:59.999-03:00`);

        const logs = await this.logRepo.createQueryBuilder('log')
            .leftJoinAndSelect('log.machine', 'machine')
            .where('log.timestamp BETWEEN :start AND :end', { start, end })
            .orderBy('log.timestamp', 'ASC')
            .getMany();

        // Filter by time of day if provided (HH:mm)
        let filteredLogs = logs;
        if (query.startTime && query.endTime) {
            const startT = parseInt(query.startTime.replace(':', ''));
            const endT = parseInt(query.endTime.replace(':', ''));
            
            filteredLogs = logs.filter(log => {
                const time = log.timestamp.getHours() * 100 + log.timestamp.getMinutes();
                
                if (startT <= endT) {
                    return time >= startT && time <= endT;
                } else {
                    // Over midnight (e.g., 18:00 to 06:00)
                    return time >= startT || time <= endT;
                }
            });
        }

        // Count machines that went to a stopped status
        const stoppedLogs = filteredLogs.filter(log => !this.isActiveStatus(log.toStatus));
        const uniqueMachinesStopped = new Set(stoppedLogs.map(l => l.machineId)).size;

        // Calculate general KPIs
        const machines = await this.machineRepo.find({ 
            where: query.plantId ? { plantId: query.plantId } : {} 
        });

        let totalMTTR = 0;
        let totalMTBF = 0;
        let machinesWithRepairs = 0;
        let machinesWithFailures = 0;

        for (const machine of machines) {
            const machineLogs = await this.logRepo.find({
                where: { machineId: machine.id },
                order: { timestamp: 'ASC' }
            });
            const kpis = this.calculateKPIs(machineLogs, start, end);
            
            if (kpis.repairs > 0) {
                totalMTTR += kpis.mttrMs;
                machinesWithRepairs++;
            }
            if (kpis.failures > 0) {
                totalMTBF += kpis.mtbfMs;
                machinesWithFailures++;
            }
        }

        return {
            totalLogs: filteredLogs.length,
            stoppedEvents: stoppedLogs.length,
            uniqueMachinesStopped,
            avgMTTR: machinesWithRepairs > 0 ? this.formatDuration(totalMTTR / machinesWithRepairs) : '0s',
            avgMTBF: machinesWithFailures > 0 ? this.formatDuration(totalMTBF / machinesWithFailures) : '0s',
            stoppedLogs: stoppedLogs.slice(-20).reverse() // Latest stopped events
        };
    }

    async updateLog(id: string, dto: { observation?: string; failureType?: string; toStatus?: string; generatedBy?: string; timestamp?: string }) {
        const log = await this.logRepo.findOne({ where: { id } });
        if (!log) throw new Error('Log not found');
        
        if (dto.observation !== undefined) log.observation = dto.observation;
        if (dto.failureType !== undefined) log.failureType = dto.failureType;
        if (dto.toStatus !== undefined) log.toStatus = dto.toStatus as MachineStatus;
        if (dto.generatedBy !== undefined) log.generatedBy = dto.generatedBy;
        if (dto.timestamp !== undefined) log.timestamp = new Date(dto.timestamp);
        
        await this.logRepo.save(log);

        // Always sync after an update that could affect chronological order or status
        await this.syncMachineStatus(log.machineId);

        return log;
    }

    async deleteLog(id: string) {
        const log = await this.logRepo.findOneBy({ id });
        if (!log) throw new Error('Log not found');

        const machineId = log.machineId;
        await this.logRepo.remove(log);
        
        // Recalculate status based on the new "latest" log
        await this.syncMachineStatus(machineId);
        
        return log;
    }

    async syncAllMachines() {
        this.logger.log('Synchronizing all machines with their latest logs...');
        const machines = await this.machineRepo.find();
        for (const machine of machines) {
            await this.syncMachineStatus(machine.id);
        }
        this.logger.log('Synchronization completed.');
    }

    private async syncMachineStatus(machineId: string) {
        const machine = await this.machineRepo.findOneBy({ id: machineId });
        if (!machine) return;

        // Find the latest log by timestamp, and then by created order if timestamps are identical
        const latestLog = await this.logRepo.findOne({
            where: { machineId },
            order: { 
                timestamp: 'DESC',
                // Assuming there's a createdAt or we can use the ID if it's sequential (uuid isn't, but we can't do much more without a sequence)
            }
        });

        if (latestLog) {
            machine.status = latestLog.toStatus;
            machine.lastObservation = latestLog.observation ?? '';
            machine.lastChangeBy = latestLog.generatedBy;
            machine.lastFailureType = latestLog.failureType ?? null;
            machine.lastStatusChange = latestLog.timestamp;
        } else {
            // Default to ACTIVA if no logs exist
            machine.status = MachineStatus.ACTIVA;
            machine.lastObservation = '';
            machine.lastChangeBy = '';
            machine.lastFailureType = null;
            machine.lastStatusChange = null;
        }
        await this.machineRepo.save(machine);
    }

    private formatDuration(ms: number): string {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }

    private calculateMedian(values: number[]): number {
        if (!values || values.length === 0) return 0;
        const sorted = [...values].sort((a, b) => a - b);
        const half = Math.floor(sorted.length / 2);
        if (sorted.length % 2 !== 0) {
            return sorted[half];
        }
        return Math.round((sorted[half - 1] + sorted[half]) / 2);
    }

    // ===== MACHINE CHANGES (Cambios de Artículos) =====

    async createMachineChange(dto: {
        machineId: string;
        changeTypes: string[];
        startTime: string;
        endTime?: string | null;
        observation?: string;
        generatedBy: string;
    }) {
        const machine = await this.machineRepo.findOneBy({ id: dto.machineId });
        if (!machine) throw new Error('Machine not found');

        const change = this.changeRepo.create({
            id: uuidv4(),
            machineId: dto.machineId,
            changeTypes: dto.changeTypes,
            startTime: new Date(dto.startTime),
            endTime: dto.endTime ? new Date(dto.endTime) : null,
            observation: dto.observation || null,
            generatedBy: dto.generatedBy,
        });
        await this.changeRepo.save(change);

        return this.changeRepo.findOne({
            where: { id: change.id },
            relations: ['machine'],
        });
    }

    async createMachineChangesBulk(items: Array<{
        machineId: string;
        changeTypes: string[];
        startTime: string;
        endTime?: string | null;
        observation?: string;
        generatedBy: string;
    }>) {
        if (!items || items.length === 0) throw new Error('No changes provided');

        // Validate all machines exist upfront
        const machineIds = [...new Set(items.map(i => i.machineId))];
        const machines = await this.machineRepo.findByIds(machineIds);
        if (machines.length !== machineIds.length) {
            const found = new Set(machines.map(m => m.id));
            const missing = machineIds.filter(id => !found.has(id));
            throw new Error(`Machines not found: ${missing.join(', ')}`);
        }

        // Save all in a single transaction
        const savedIds: string[] = [];
        await this.dataSource.transaction(async (manager) => {
            const changeRepo = manager.getRepository(MachineChangeEntity);
            for (const dto of items) {
                const change = changeRepo.create({
                    id: uuidv4(),
                    machineId: dto.machineId,
                    changeTypes: dto.changeTypes,
                    startTime: new Date(dto.startTime),
                    endTime: dto.endTime ? new Date(dto.endTime) : null,
                    observation: dto.observation || null,
                    generatedBy: dto.generatedBy,
                });
                await changeRepo.save(change);
                savedIds.push(change.id);
            }
        });

        return this.changeRepo.find({
            where: savedIds.map(id => ({ id })),
            relations: ['machine'],
        });
    }

    async getMachineChanges(query: {
        plantId?: string;
        startDate?: string;
        endDate?: string;
        machineNumber?: string;
        changeType?: string;
        generatedBy?: string;
        search?: string;
    }) {
        const qb = this.changeRepo.createQueryBuilder('change')
            .leftJoinAndSelect('change.machine', 'machine')
            .leftJoinAndSelect('machine.plant', 'plant')
            .orderBy('change.startTime', 'DESC');

        if (query.plantId) {
            qb.andWhere('machine.plantId = :plantId', { plantId: query.plantId });
        }

        if (query.machineNumber) {
            qb.andWhere('machine.number = :machineNumber', { machineNumber: query.machineNumber });
        }

        if (query.startDate) {
            qb.andWhere('change.startTime >= :start', { start: new Date(`${query.startDate}T00:00:00.000-03:00`) });
        }

        if (query.endDate) {
            qb.andWhere('change.startTime <= :end', { end: new Date(`${query.endDate}T23:59:59.999-03:00`) });
        }

        if (query.changeType) {
            qb.andWhere('change.changeTypes ::jsonb @> :changeType', { changeType: JSON.stringify([query.changeType]) });
        }

        if (query.generatedBy) {
            qb.andWhere('change.generatedBy ILIKE :generatedBy', { generatedBy: `%${query.generatedBy}%` });
        }

        if (query.search) {
            const trimmedSearch = query.search.trim();
            const isNumericSearch = /^\d+$/.test(trimmedSearch);
            if (isNumericSearch) {
                qb.andWhere(
                    '(change.observation ILIKE :search OR change.generatedBy ILIKE :search OR machine.number = :searchNum)',
                    { search: `%${trimmedSearch}%`, searchNum: parseInt(trimmedSearch, 10) }
                );
            } else {
                qb.andWhere(
                    '(change.observation ILIKE :search OR change.generatedBy ILIKE :search)',
                    { search: `%${trimmedSearch}%` }
                );
            }
        }

        const changes = await qb.getMany();

        return changes.map(c => {
            const isOngoing = !c.endTime;
            const durationMs = isOngoing
                ? Date.now() - new Date(c.startTime).getTime()
                : new Date(c.endTime!).getTime() - new Date(c.startTime).getTime();

            return {
                ...c,
                durationMs: isOngoing ? null : durationMs,
                durationFormatted: isOngoing ? 'En curso' : this.formatDuration(durationMs),
                isOngoing,
            };
        });
    }

    async updateMachineChange(id: string, dto: {
        machineId?: string;
        changeTypes?: string[];
        startTime?: string;
        endTime?: string | null;
        observation?: string;
        generatedBy?: string;
    }) {
        const change = await this.changeRepo.findOne({ where: { id } });
        if (!change) throw new Error('Machine change not found');

        if (dto.machineId !== undefined) {
            const machine = await this.machineRepo.findOneBy({ id: dto.machineId });
            if (!machine) throw new Error('Machine not found');
            change.machineId = dto.machineId;
        }
        if (dto.changeTypes !== undefined) change.changeTypes = dto.changeTypes;
        if (dto.startTime !== undefined) change.startTime = new Date(dto.startTime);
        if (dto.endTime !== undefined) {
            change.endTime = dto.endTime ? new Date(dto.endTime) : null;
        }
        if (dto.observation !== undefined) change.observation = dto.observation;
        if (dto.generatedBy !== undefined) change.generatedBy = dto.generatedBy;

        await this.changeRepo.save(change);

        // Sync machine status so the live monitor reflects the correct state
        // after editing a change (e.g. when endTime is set, the change is no longer "active"
        // and machine.status must reflect the latest maintenance log).
        await this.syncMachineStatus(change.machineId);

        return this.changeRepo.findOne({
            where: { id },
            relations: ['machine', 'machine.plant'],
        });
    }

    async deleteMachineChange(id: string) {
        const change = await this.changeRepo.findOneBy({ id });
        if (!change) throw new Error('Machine change not found');
        await this.changeRepo.remove(change);
        return { message: 'Cambio eliminado correctamente' };
    }

    async getMachineChangeReport(query: {
        plantId?: string;
        startDate?: string;
        endDate?: string;
        typeId?: string;
    }) {
        const qb = this.changeRepo.createQueryBuilder('change')
            .leftJoinAndSelect('change.machine', 'machine')
            .leftJoinAndSelect('machine.plant', 'plant')
            .orderBy('change.startTime', 'ASC');

        if (query.plantId) {
            qb.andWhere('machine.plantId = :plantId', { plantId: query.plantId });
        }

        const resolvedTypeIds = await this.resolveTypeIds(query.typeId);
        if (resolvedTypeIds && resolvedTypeIds.length > 0) {
            qb.andWhere('machine.typeId IN (:...typeIds)', { typeIds: resolvedTypeIds });
        }

        if (query.startDate) {
            qb.andWhere('change.startTime >= :start', { start: new Date(`${query.startDate}T00:00:00.000-03:00`) });
        }

        if (query.endDate) {
            qb.andWhere('change.startTime <= :end', { end: new Date(`${query.endDate}T23:59:59.999-03:00`) });
        }

        const changes = await qb.getMany();

        // Group by combination (sorted changeTypes joined as key)
        const groups: Record<string, {
            combination: string[];
            combinationLabel: string;
            totalDurationMs: number;
            count: number;
            minDurationMs: number;
            maxDurationMs: number;
            details: {
                id: string;
                machineNumber: number;
                machineName: string;
                plantName: string;
                startTime: Date;
                endTime: Date | null;
                durationMs: number;
                durationFormatted: string;
                observation: string | null;
                generatedBy: string;
                changeTypes: string[];
            }[];
        }> = {};

        for (const c of changes) {
            const sorted = [...c.changeTypes].sort();
            const key = sorted.join('+');
            const isOngoing = !c.endTime;
            const durationMs = isOngoing ? 0 : (new Date(c.endTime!).getTime() - new Date(c.startTime).getTime());

            if (!groups[key]) {
                groups[key] = {
                    combination: sorted,
                    combinationLabel: sorted.join(' + '),
                    totalDurationMs: 0,
                    count: 0,
                    minDurationMs: Infinity,
                    maxDurationMs: 0,
                    details: [],
                };
            }

            groups[key].count += 1;
            if (!isOngoing) {
                groups[key].totalDurationMs += durationMs;
                groups[key].minDurationMs = Math.min(groups[key].minDurationMs, durationMs);
                groups[key].maxDurationMs = Math.max(groups[key].maxDurationMs, durationMs);
            }

            groups[key].details.push({
                id: c.id,
                machineNumber: c.machine?.number ?? 0,
                machineName: c.machine?.nombre ?? '',
                plantName: c.machine?.plant?.name ?? '',
                startTime: c.startTime,
                endTime: c.endTime,
                durationMs: isOngoing ? 0 : durationMs,
                durationFormatted: isOngoing ? 'En curso' : this.formatDuration(durationMs),
                observation: c.observation,
                generatedBy: c.generatedBy,
                changeTypes: c.changeTypes,
            });
        }

        const totalChanges = changes.length;

        const allDurations = changes
            .filter(c => !!c.endTime)
            .map(c => new Date(c.endTime!).getTime() - new Date(c.startTime).getTime());
        const totalMedianDurationMs = this.calculateMedian(allDurations);

        const report = Object.values(groups).map(g => {
            const groupDurations = g.details.filter(d => d.durationFormatted !== 'En curso').map(d => d.durationMs);
            const medianMs = this.calculateMedian(groupDurations);
            const finishedCount = groupDurations.length || 1;
            return {
                combination: g.combination,
                combinationLabel: g.combinationLabel,
                count: g.count,
                percentage: totalChanges > 0 ? parseFloat(((g.count / totalChanges) * 100).toFixed(1)) : 0,
                avgDurationMs: groupDurations.length > 0 ? Math.round(g.totalDurationMs / finishedCount) : 0,
                avgDurationFormatted: groupDurations.length > 0 ? this.formatDuration(Math.round(g.totalDurationMs / finishedCount)) : 'En curso',
                medianDurationMs: medianMs,
                medianDurationFormatted: this.formatDuration(medianMs),
                minDurationMs: g.minDurationMs === Infinity ? 0 : g.minDurationMs,
                minDurationFormatted: this.formatDuration(g.minDurationMs === Infinity ? 0 : g.minDurationMs),
                maxDurationMs: g.maxDurationMs,
                maxDurationFormatted: this.formatDuration(g.maxDurationMs),
                details: g.details,
            };
        }).sort((a, b) => b.count - a.count);

        return {
            totalChanges,
            totalMedianDurationMs,
            totalMedianDurationFormatted: this.formatDuration(totalMedianDurationMs),
            report,
        };
    }

    async getAvailabilityDashboard(query: {
        plantId: string;
        typeId?: string;
        startDate?: string;
        endDate?: string;
    }) {
        const { plantId, typeId } = query;
        const now = new Date();

        const parseDate = (dStr?: string, isEnd = false): Date => {
            if (!dStr) {
                if (isEnd) return now;
                return new Date(now.getFullYear(), now.getMonth(), 1);
            }
            if (dStr.includes('T')) {
                const parsed = new Date(dStr);
                if (!isNaN(parsed.getTime())) return parsed;
            }
            const dateOnly = dStr.split('T')[0];
            const timePart = isEnd ? '23:59:59.999-03:00' : '00:00:00.000-03:00';
            const parsed = new Date(`${dateOnly}T${timePart}`);
            if (!isNaN(parsed.getTime())) return parsed;
            return isEnd ? now : new Date(now.getFullYear(), now.getMonth(), 1);
        };

        const periodStart = parseDate(query.startDate, false);
        const periodEnd = parseDate(query.endDate, true);
        
        const nowMs = now.getTime();
        const window24hEnd = now;
        const window24hStart = new Date(nowMs - 24 * 60 * 60 * 1000);

        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = now;

        // Fetch machines
        const resolvedTypeIds = await this.resolveTypeIds(typeId);
        const qb = this.machineRepo.createQueryBuilder('m')
            .where('m.plantId = :plantId', { plantId });

        if (resolvedTypeIds && resolvedTypeIds.length > 0) {
            qb.andWhere('m.typeId IN (:...typeIds)', { typeIds: resolvedTypeIds });
        }

        const machines = await qb.orderBy('m.number', 'ASC').getMany();
        const machineIds = machines.map(m => m.id);

        if (machineIds.length === 0) {
            return {
                summary: {
                    totalMachines: 0, activeMachines: 0, stoppedMachines: 0,
                    avgAvailabilityPeriod: "0%", avgAvailability24h: "0%", avgAvailabilityMonth: "0%",
                    totalDowntimeNovedadesFormatted: "0h 0m", totalDowntimeChangesFormatted: "0h 0m",
                    totalStopsNovedades: 0, totalChanges: 0,
                    avgStopDurationFormatted: "0h 0m", avgChangeDurationFormatted: "0h 0m"
                },
                machines: [],
                topProblematic: [], topPerformers: [],
                byShift: { day: { availability: 0, stops: 0, changes: 0 }, night: { availability: 0, stops: 0, changes: 0 } },
                dailyTrend: []
            };
        }

        // Fetch logs and changes up to the maximum end date
        const maxEnd = periodEnd.getTime() > monthEnd.getTime() ? periodEnd : monthEnd;

        const logs = await this.logRepo.find({
            where: {
                machineId: In(machineIds),
                timestamp: LessThanOrEqual(maxEnd)
            },
            order: { timestamp: 'ASC' }
        });

        const changes = await this.changeRepo.find({
            where: {
                machineId: In(machineIds),
                startTime: LessThanOrEqual(maxEnd)
            }
        });

        const logsByMachine: Record<string, MaintenanceLogEntity[]> = {};
        const changesByMachine: Record<string, MachineChangeEntity[]> = {};
        machineIds.forEach(id => { logsByMachine[id] = []; changesByMachine[id] = []; });
        logs.forEach(l => { if (logsByMachine[l.machineId]) logsByMachine[l.machineId].push(l); });
        changes.forEach(c => { if (changesByMachine[c.machineId]) changesByMachine[c.machineId].push(c); });

        const calculatePeriod = (start: Date, end: Date, machineLogs: MaintenanceLogEntity[], machineChanges: MachineChangeEntity[]) => {
            const kpis = this.calculateRawKPIs(machineLogs, start, end);
            
            let downtimeChangesMs = 0;
            let changesCount = 0;

            const periodStartMs = start.getTime();
            const periodEndMs = end.getTime();

            for (const c of machineChanges) {
                const cStart = c.startTime.getTime();
                const cEnd = c.endTime ? c.endTime.getTime() : Math.min(Date.now(), periodEndMs);
                
                if (cEnd < periodStartMs || cStart > periodEndMs) continue;

                const actualStart = Math.max(cStart, periodStartMs);
                const actualEnd = Math.min(cEnd, periodEndMs);
                
                downtimeChangesMs += (actualEnd - actualStart);
                changesCount++;
            }

            const totalPeriodMs = periodEndMs - periodStartMs;
            const totalDowntimeMs = kpis.downtimeMs + downtimeChangesMs;
            let availability = totalPeriodMs > 0 ? ((totalPeriodMs - totalDowntimeMs) / totalPeriodMs) * 100 : 100;
            if (availability < 0) availability = 0;
            if (availability > 100) availability = 100;

            return {
                availability,
                downtimeNovedadesMs: kpis.downtimeMs,
                downtimeChangesMs,
                totalDowntimeMs,
                uptimeMs: Math.max(0, totalPeriodMs - totalDowntimeMs),
                failureCount: kpis.failures,
                changeCount: changesCount
            };
        };

        const machinesData = machines.map(m => {
            const mLogs = logsByMachine[m.id];
            const mChanges = changesByMachine[m.id];

            const statPeriod = calculatePeriod(periodStart, periodEnd, mLogs, mChanges);
            const stat24h = calculatePeriod(window24hStart, window24hEnd, mLogs, mChanges);
            const statMonth = calculatePeriod(monthStart, monthEnd, mLogs, mChanges);

            return {
                machineId: m.id,
                number: m.number,
                nombre: m.nombre,
                currentStatus: m.status,
                availability: Number(statPeriod.availability.toFixed(2)),
                availability24h: Number(stat24h.availability.toFixed(2)),
                availabilityMonth: Number(statMonth.availability.toFixed(2)),
                downtimeNovedadesMs: statPeriod.downtimeNovedadesMs,
                downtimeChangesMs: statPeriod.downtimeChangesMs,
                totalDowntimeMs: statPeriod.totalDowntimeMs,
                uptimeMs: statPeriod.uptimeMs,
                failureCount: statPeriod.failureCount,
                changeCount: statPeriod.changeCount
            };
        });

        let activeMachines = 0;
        let stoppedMachines = 0;
        let totalDowntimeNovedadesMs = 0;
        let totalDowntimeChangesMs = 0;
        let totalStopsNovedades = 0;
        let totalChanges = 0;
        let totalAvailPeriod = 0;
        let totalAvail24h = 0;
        let totalAvailMonth = 0;

        for (const md of machinesData) {
            if (this.isActiveStatus(md.currentStatus as MachineStatus)) {
                activeMachines++;
            } else {
                stoppedMachines++;
            }
            totalDowntimeNovedadesMs += md.downtimeNovedadesMs;
            totalDowntimeChangesMs += md.downtimeChangesMs;
            totalStopsNovedades += md.failureCount;
            totalChanges += md.changeCount;
            totalAvailPeriod += md.availability;
            totalAvail24h += md.availability24h;
            totalAvailMonth += md.availabilityMonth;
        }

        const avgAvailabilityPeriod = machinesData.length > 0 ? (totalAvailPeriod / machinesData.length).toFixed(1) + '%' : "0%";
        const avgAvailability24h = machinesData.length > 0 ? (totalAvail24h / machinesData.length).toFixed(1) + '%' : "0%";
        const avgAvailabilityMonth = machinesData.length > 0 ? (totalAvailMonth / machinesData.length).toFixed(1) + '%' : "0%";

        const avgStopDuration = totalStopsNovedades > 0 ? Math.round(totalDowntimeNovedadesMs / totalStopsNovedades) : 0;
        const avgChangeDuration = totalChanges > 0 ? Math.round(totalDowntimeChangesMs / totalChanges) : 0;

        const sortedByAvail = [...machinesData].sort((a, b) => a.availability - b.availability);
        
        const topProblematic = sortedByAvail.slice(0, 5).map(m => ({
            machineId: m.machineId,
            number: m.number,
            nombre: m.nombre,
            availability24h: m.availability, // using current selected period availability
            failureCount: m.failureCount,
            currentStatus: m.currentStatus
        }));

        const topPerformers = [...machinesData]
            .sort((a, b) => b.availability - a.availability)
            .slice(0, 5)
            .map(m => ({
                machineId: m.machineId,
                number: m.number,
                nombre: m.nombre,
                availability24h: m.availability, // using current selected period availability
                failureCount: m.failureCount,
                currentStatus: m.currentStatus
            }));

        // Shift calculations for selected period
        let dayStops = 0, nightStops = 0;
        let dayChanges = 0, nightChanges = 0;

        const periodLogs = logs.filter(l => l.timestamp >= periodStart && l.timestamp <= periodEnd);
        const periodChanges = changes.filter(c => c.startTime >= periodStart && c.startTime <= periodEnd);
        
        for (const l of periodLogs) {
            const h = l.timestamp.getHours();
            if (h >= 6 && h < 18) dayStops++;
            else nightStops++;
        }

        for (const c of periodChanges) {
            const h = c.startTime.getHours();
            if (h >= 6 && h < 18) dayChanges++;
            else nightChanges++;
        }

        const daysInPeriod = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)) || 1;
        const totalShiftMs = daysInPeriod * 12 * 60 * 60 * 1000 * machines.length;
        
        let dayDowntimeMs = 0;
        let nightDowntimeMs = 0;

        if (totalStopsNovedades > 0 || totalChanges > 0) {
            const dayStopRatio = totalStopsNovedades > 0 ? dayStops / totalStopsNovedades : 0;
            const dayChangeRatio = totalChanges > 0 ? dayChanges / totalChanges : 0;
            
            dayDowntimeMs = (dayStopRatio * totalDowntimeNovedadesMs) + (dayChangeRatio * totalDowntimeChangesMs);
            nightDowntimeMs = totalDowntimeNovedadesMs + totalDowntimeChangesMs - dayDowntimeMs;
        }

        let dayAvailability = totalShiftMs > 0 ? ((totalShiftMs - dayDowntimeMs) / totalShiftMs) * 100 : 100;
        let nightAvailability = totalShiftMs > 0 ? ((totalShiftMs - nightDowntimeMs) / totalShiftMs) * 100 : 100;
        dayAvailability = Math.max(0, Math.min(100, dayAvailability));
        nightAvailability = Math.max(0, Math.min(100, nightAvailability));

        // Daily trend across selected period
        const dailyTrend = [];
        const trendStartMs = periodStart.getTime();
        const trendEndMs = periodEnd.getTime();
        const ONE_DAY = 24 * 60 * 60 * 1000;

        for (let t = trendStartMs; t <= trendEndMs; t += ONE_DAY) {
            const dayStart = new Date(t);
            const dayEnd = new Date(Math.min(t + ONE_DAY - 1, trendEndMs));
            const dateStr = dayStart.toISOString().split('T')[0];

            let dayTotalDowntimeMs = 0;
            let dayStopsCount = 0;
            let dayChangesCount = 0;

            for (const m of machines) {
                const kpis = this.calculateRawKPIs(logsByMachine[m.id], dayStart, dayEnd);
                let dayDowntimeChangesMs = 0;

                for (const c of changesByMachine[m.id]) {
                    const cStart = c.startTime.getTime();
                    const cEnd = c.endTime ? c.endTime.getTime() : Math.min(Date.now(), dayEnd.getTime());
                    if (cEnd < dayStart.getTime() || cStart > dayEnd.getTime()) continue;
                    
                    const actualStart = Math.max(cStart, dayStart.getTime());
                    const actualEnd = Math.min(cEnd, dayEnd.getTime());
                    dayDowntimeChangesMs += (actualEnd - actualStart);
                    dayChangesCount++;
                }

                dayTotalDowntimeMs += (kpis.downtimeMs + dayDowntimeChangesMs);
                dayStopsCount += kpis.failures;
            }

            const dayTotalMs = (dayEnd.getTime() - dayStart.getTime() + 1) * machines.length;
            let dayAvail = dayTotalMs > 0 ? ((dayTotalMs - dayTotalDowntimeMs) / dayTotalMs) * 100 : 100;
            if (dayAvail < 0) dayAvail = 0;
            if (dayAvail > 100) dayAvail = 100;

            dailyTrend.push({
                date: dateStr,
                availability: Number(dayAvail.toFixed(2)),
                stops: dayStopsCount,
                changes: dayChangesCount
            });
        }

        return {
            summary: {
                totalMachines: machines.length,
                activeMachines,
                stoppedMachines,
                avgAvailabilityPeriod,
                avgAvailability24h,
                avgAvailabilityMonth,
                totalDowntimeNovedadesFormatted: this.formatDuration(totalDowntimeNovedadesMs),
                totalDowntimeChangesFormatted: this.formatDuration(totalDowntimeChangesMs),
                totalStopsNovedades,
                totalChanges,
                avgStopDurationFormatted: this.formatDuration(avgStopDuration),
                avgChangeDurationFormatted: this.formatDuration(avgChangeDuration)
            },
            machines: machinesData,
            topProblematic,
            topPerformers,
            byShift: {
                day: { availability: Number(dayAvailability.toFixed(2)), stops: dayStops, changes: dayChanges },
                night: { availability: Number(nightAvailability.toFixed(2)), stops: nightStops, changes: nightChanges }
            },
            dailyTrend
        };
    }

    async getAvailabilityTimeline(query: {
        plantId: string;
        typeId?: string;
        period?: string;
        startDate?: string;
        endDate?: string;
    }) {
        const { plantId, typeId, period = '24h' } = query;
        const now = new Date();

        let periodStart: Date;
        let periodEnd: Date = now;

        if (query.startDate && query.endDate) {
            const pStart = query.startDate.includes('T') ? new Date(query.startDate) : new Date(`${query.startDate.split('T')[0]}T00:00:00.000-03:00`);
            const pEnd = query.endDate.includes('T') ? new Date(query.endDate) : new Date(`${query.endDate.split('T')[0]}T23:59:59.999-03:00`);
            periodStart = isNaN(pStart.getTime()) ? new Date(now.getTime() - 24 * 60 * 60 * 1000) : pStart;
            periodEnd = isNaN(pEnd.getTime()) ? now : pEnd;
        } else {
            if (period === '24h') {
                periodStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            } else if (period === 'week') {
                periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            } else if (period === 'fortnight') {
                periodStart = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
            } else {
                periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
            }
        }

        const startMs = periodStart.getTime();
        const endMs = periodEnd.getTime();
        const totalPeriodMs = Math.max(1, endMs - startMs);

        // Fetch machines
        const resolvedTypeIds = await this.resolveTypeIds(typeId);
        const qb = this.machineRepo.createQueryBuilder('m')
            .where('m.plantId = :plantId', { plantId });

        if (resolvedTypeIds && resolvedTypeIds.length > 0) {
            qb.andWhere('m.typeId IN (:...typeIds)', { typeIds: resolvedTypeIds });
        }

        const machines = await qb.orderBy('m.number', 'ASC').getMany();
        const machineIds = machines.map(m => m.id);

        if (machineIds.length === 0) {
            return {
                summary: {
                    totalMachines: 0, activeMachines: 0, stoppedMachines: 0, avgAvailability: "0%",
                    totalUptimeFormatted: "0h 0m", totalNovedadesFormatted: "0h 0m",
                    totalChangesFormatted: "0h 0m", totalReducedFormatted: "0h 0m", totalNoDataFormatted: "0h 0m"
                },
                timeMarkers: [],
                shiftMarkers: [],
                machines: []
            };
        }

        // Generate time markers for timeline header
        const timeMarkers: Array<{ label: string; pct: number }> = [];
        const numMarkers = 6;
        for (let i = 0; i <= numMarkers; i++) {
            const pct = (i / numMarkers) * 100;
            const tMs = startMs + (pct / 100) * totalPeriodMs;
            const d = new Date(tMs);
            let label = '';
            if (totalPeriodMs <= 24 * 60 * 60 * 1000) {
                const hh = String(d.getHours()).padStart(2, '0');
                const mm = String(d.getMinutes()).padStart(2, '0');
                label = `${hh}:${mm}`;
            } else {
                const dd = String(d.getDate()).padStart(2, '0');
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const hh = String(d.getHours()).padStart(2, '0');
                label = `${dd}/${mm} ${hh}h`;
            }
            timeMarkers.push({ label, pct: Number(pct.toFixed(2)) });
        }

        // Shift markers (06:00 and 18:00)
        const shiftMarkers: Array<{ label: string; pct: number }> = [];
        const ONE_DAY = 24 * 60 * 60 * 1000;
        for (let t = startMs; t <= endMs; t += ONE_DAY) {
            const dayBase = new Date(t);
            const shift6 = new Date(dayBase.getFullYear(), dayBase.getMonth(), dayBase.getDate(), 6, 0, 0).getTime();
            if (shift6 >= startMs && shift6 <= endMs) {
                const pct = ((shift6 - startMs) / totalPeriodMs) * 100;
                shiftMarkers.push({ label: 'Cambio Turno 6am', pct: Number(pct.toFixed(2)) });
            }
            const shift18 = new Date(dayBase.getFullYear(), dayBase.getMonth(), dayBase.getDate(), 18, 0, 0).getTime();
            if (shift18 >= startMs && shift18 <= endMs) {
                const pct = ((shift18 - startMs) / totalPeriodMs) * 100;
                shiftMarkers.push({ label: 'Cambio Turno 6pm', pct: Number(pct.toFixed(2)) });
            }
        }

        // Fetch logs and changes
        const logs = await this.logRepo.find({
            where: {
                machineId: In(machineIds),
                timestamp: LessThanOrEqual(periodEnd)
            },
            order: { timestamp: 'ASC' }
        });

        const changes = await this.changeRepo.find({
            where: {
                machineId: In(machineIds),
                startTime: LessThanOrEqual(periodEnd)
            }
        });

        const logsByMachine: Record<string, MaintenanceLogEntity[]> = {};
        const changesByMachine: Record<string, MachineChangeEntity[]> = {};
        machineIds.forEach(id => { logsByMachine[id] = []; changesByMachine[id] = []; });
        logs.forEach(l => { if (logsByMachine[l.machineId]) logsByMachine[l.machineId].push(l); });
        changes.forEach(c => { if (changesByMachine[c.machineId]) changesByMachine[c.machineId].push(c); });

        const getStatusType = (status: string): 'active' | 'reduced' | 'stopped' => {
            if (status === MachineStatus.ACTIVA) return 'active';
            if ([MachineStatus.REVISAR, MachineStatus.VELOCIDAD_REDUCIDA, MachineStatus.FALTA_COSTURA, MachineStatus.MUESTRAS].includes(status as any)) {
                return 'reduced';
            }
            return 'stopped';
        };

        const machinesData = machines.map(m => {
            const mLogs = logsByMachine[m.id] || [];
            const mChanges = changesByMachine[m.id] || [];

            let currentStatus = MachineStatus.ACTIVA;
            let statusLogIndex = 0;

            for (let i = 0; i < mLogs.length; i++) {
                const logTime = mLogs[i].timestamp.getTime();
                if (logTime <= startMs) {
                    currentStatus = mLogs[i].toStatus;
                    statusLogIndex = i + 1;
                } else {
                    break;
                }
            }

            const rawSegments: Array<{
                start: number;
                end: number;
                status: string;
                type: 'active' | 'reduced' | 'stopped' | 'nodata';
                failureType?: string;
                observation?: string;
            }> = [];

            let currTime = startMs;
            let currStat = currentStatus;
            const firstLogTime = mLogs.length > 0 ? mLogs[0].timestamp.getTime() : null;
            const createdAtMs = m.createdAt ? new Date(m.createdAt).getTime() : startMs;

            for (let i = statusLogIndex; i < mLogs.length; i++) {
                const lTime = mLogs[i].timestamp.getTime();
                if (lTime > endMs) break;

                if (lTime > currTime) {
                    const type = (firstLogTime && firstLogTime > currTime && currTime < createdAtMs) 
                        ? 'nodata' 
                        : getStatusType(currStat);

                    rawSegments.push({
                        start: currTime,
                        end: lTime,
                        status: currStat,
                        type,
                        failureType: mLogs[i - 1]?.failureType || undefined,
                        observation: mLogs[i - 1]?.observation || undefined
                    });
                }
                currTime = lTime;
                currStat = mLogs[i].toStatus;
            }

            if (currTime < endMs) {
                const type = (firstLogTime && firstLogTime > currTime && currTime < createdAtMs) 
                    ? 'nodata' 
                    : getStatusType(currStat);

                rawSegments.push({
                    start: currTime,
                    end: endMs,
                    status: currStat,
                    type,
                    failureType: mLogs[mLogs.length - 1]?.failureType || undefined,
                    observation: mLogs[mLogs.length - 1]?.observation || undefined
                });
            }

            // Overlay machine_changes
            const finalSegments: Array<{
                startMs: number;
                endMs: number;
                startPct: number;
                endPct: number;
                durationMs: number;
                durationFormatted: string;
                type: 'active' | 'reduced' | 'stopped' | 'change' | 'nodata';
                label: string;
                observation?: string;
            }> = [];

            for (const seg of rawSegments) {
                const segChanges = mChanges.filter(c => {
                    const cS = c.startTime.getTime();
                    const cE = c.endTime ? c.endTime.getTime() : Math.min(Date.now(), seg.end);
                    return cE > seg.start && cS < seg.end;
                });

                if (segChanges.length === 0) {
                    const dur = seg.end - seg.start;
                    const startPct = ((seg.start - startMs) / totalPeriodMs) * 100;
                    const endPct = ((seg.end - startMs) / totalPeriodMs) * 100;
                    
                    const label = seg.type === 'active' ? 'Activa' 
                        : seg.type === 'reduced' ? `Reducida (${seg.status})` 
                        : seg.type === 'stopped' ? `Parada (${seg.failureType || seg.status})` 
                        : 'Sin Datos';

                    finalSegments.push({
                        startMs: seg.start,
                        endMs: seg.end,
                        startPct: Number(startPct.toFixed(2)),
                        endPct: Number(endPct.toFixed(2)),
                        durationMs: dur,
                        durationFormatted: this.formatDuration(dur),
                        type: seg.type,
                        label,
                        observation: seg.observation
                    });
                } else {
                    let subStart = seg.start;
                    for (const change of segChanges) {
                        const cStart = Math.max(seg.start, change.startTime.getTime());
                        const cEnd = Math.min(seg.end, change.endTime ? change.endTime.getTime() : Math.min(Date.now(), seg.end));

                        if (cStart > subStart) {
                            const dur = cStart - subStart;
                            const startPct = ((subStart - startMs) / totalPeriodMs) * 100;
                            const endPct = ((cStart - startMs) / totalPeriodMs) * 100;
                            finalSegments.push({
                                startMs: subStart, endMs: cStart,
                                startPct: Number(startPct.toFixed(2)), endPct: Number(endPct.toFixed(2)),
                                durationMs: dur, durationFormatted: this.formatDuration(dur),
                                type: seg.type,
                                label: seg.type === 'active' ? 'Activa' : seg.type === 'reduced' ? `Reducida (${seg.status})` : `Parada (${seg.failureType || seg.status})`,
                                observation: seg.observation
                            });
                        }

                        if (cEnd > cStart) {
                            const dur = cEnd - cStart;
                            const startPct = ((cStart - startMs) / totalPeriodMs) * 100;
                            const endPct = ((cEnd - startMs) / totalPeriodMs) * 100;
                            const typesLabel = change.changeTypes ? change.changeTypes.join('+') : 'Artículo';
                            finalSegments.push({
                                startMs: cStart, endMs: cEnd,
                                startPct: Number(startPct.toFixed(2)), endPct: Number(endPct.toFixed(2)),
                                durationMs: dur, durationFormatted: this.formatDuration(dur),
                                type: 'change',
                                label: `Cambio: ${typesLabel}`,
                                observation: change.observation || undefined
                            });
                        }
                        subStart = Math.max(subStart, cEnd);
                    }

                    if (subStart < seg.end) {
                        const dur = seg.end - subStart;
                        const startPct = ((subStart - startMs) / totalPeriodMs) * 100;
                        const endPct = ((seg.end - startMs) / totalPeriodMs) * 100;
                        finalSegments.push({
                            startMs: subStart, endMs: seg.end,
                            startPct: Number(startPct.toFixed(2)), endPct: Number(endPct.toFixed(2)),
                            durationMs: dur, durationFormatted: this.formatDuration(dur),
                            type: seg.type,
                            label: seg.type === 'active' ? 'Activa' : seg.type === 'reduced' ? `Reducida (${seg.status})` : `Parada (${seg.failureType || seg.status})`,
                            observation: seg.observation
                        });
                    }
                }
            }

            let uptimeMs = 0;
            let reducedMs = 0;
            let downtimeNovedadesMs = 0;
            let downtimeChangesMs = 0;
            let nodataMs = 0;

            for (const s of finalSegments) {
                if (s.type === 'active') uptimeMs += s.durationMs;
                else if (s.type === 'reduced') reducedMs += s.durationMs;
                else if (s.type === 'stopped') downtimeNovedadesMs += s.durationMs;
                else if (s.type === 'change') downtimeChangesMs += s.durationMs;
                else if (s.type === 'nodata') nodataMs += s.durationMs;
            }

            const totalActiveUptime = uptimeMs + reducedMs;
            const totalValidPeriod = Math.max(1, totalPeriodMs - nodataMs);
            let availability = (totalActiveUptime / totalValidPeriod) * 100;
            availability = Math.max(0, Math.min(100, availability));

            return {
                machineId: m.id,
                number: m.number,
                nombre: m.nombre,
                currentStatus: m.status,
                availability: Number(availability.toFixed(2)),
                stats: {
                    uptimeMs, uptimeFormatted: this.formatDuration(uptimeMs),
                    reducedMs, reducedFormatted: this.formatDuration(reducedMs),
                    downtimeNovedadesMs, downtimeNovedadesFormatted: this.formatDuration(downtimeNovedadesMs),
                    downtimeChangesMs, downtimeChangesFormatted: this.formatDuration(downtimeChangesMs),
                    nodataMs, nodataFormatted: this.formatDuration(nodataMs)
                },
                segments: finalSegments
            };
        });

        let totalUptimeMs = 0;
        let totalReducedMs = 0;
        let totalNovedadesMs = 0;
        let totalChangesMs = 0;
        let totalNoDataMs = 0;
        let activeCount = 0;
        let stoppedCount = 0;
        let sumAvail = 0;

        for (const m of machinesData) {
            if (this.isActiveStatus(m.currentStatus as MachineStatus)) activeCount++;
            else stoppedCount++;

            totalUptimeMs += m.stats.uptimeMs;
            totalReducedMs += m.stats.reducedMs;
            totalNovedadesMs += m.stats.downtimeNovedadesMs;
            totalChangesMs += m.stats.downtimeChangesMs;
            totalNoDataMs += m.stats.nodataMs;
            sumAvail += m.availability;
        }

        const avgAvailability = machinesData.length > 0 ? (sumAvail / machinesData.length).toFixed(1) + '%' : '0%';

        return {
            summary: {
                totalMachines: machinesData.length,
                activeMachines: activeCount,
                stoppedMachines: stoppedCount,
                avgAvailability,
                totalUptimeFormatted: this.formatDuration(totalUptimeMs),
                totalReducedFormatted: this.formatDuration(totalReducedMs),
                totalNovedadesFormatted: this.formatDuration(totalNovedadesMs),
                totalChangesFormatted: this.formatDuration(totalChangesMs),
                totalNoDataFormatted: this.formatDuration(totalNoDataMs)
            },
            timeMarkers,
            shiftMarkers,
            machines: machinesData
        };
    }
}
