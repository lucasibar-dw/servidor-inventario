import { Injectable, ConflictException, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmployeeEntity } from '../domain/entities/employee.entity';

@Injectable()
export class EmployeesService implements OnModuleInit {
    constructor(
        @InjectRepository(EmployeeEntity)
        private readonly employeeRepo: Repository<EmployeeEntity>,
    ) {}

    async onModuleInit() {
        try {
            await this.ensureSeedEmployees();
        } catch (err: any) {
            console.warn('[EmployeesService] Auto-seed skip or waiting for DB:', err?.message);
        }
    }

    async ensureSeedEmployees() {
        // Asegurar que existan Dilan (legajo 1, Hilado) y Diego (legajo 2, Packaging)
        const dilan = await this.employeeRepo.findOne({ where: { legajo: '1' } });
        if (!dilan) {
            await this.employeeRepo.save(this.employeeRepo.create({
                legajo: '1',
                fullName: 'Dilan',
                primarySectorCode: 'DEPOSITO',
                subSector: 'HILADO',
                active: true,
                source: 'SISTEMA',
            }));
        }
        const diego = await this.employeeRepo.findOne({ where: { legajo: '2' } });
        if (!diego) {
            await this.employeeRepo.save(this.employeeRepo.create({
                legajo: '2',
                fullName: 'Diego',
                primarySectorCode: 'DEPOSITO',
                subSector: 'PACKAGING',
                active: true,
                source: 'SISTEMA',
            }));
        }
    }

    async findAll(query?: { q?: string; active?: boolean; sector?: string }) {
        try {
            const count = await this.employeeRepo.count();
            if (count === 0) {
                await this.ensureSeedEmployees();
            }
        } catch {
            // DB might be offline or table pending
        }

        const qb = this.employeeRepo.createQueryBuilder('employee');
        if (query?.q) {
            qb.andWhere('(employee.legajo ILIKE :term OR employee.fullName ILIKE :term)', {
                term: `%${query.q.trim()}%`,
            });
        }
        if (query?.active !== undefined) {
            qb.andWhere('employee.active = :active', { active: query.active });
        }
        if (query?.sector) {
            const sec = query.sector.trim().toUpperCase();
            if (sec === 'DEPOSITO_HILADO' || sec === 'HILADO') {
                qb.andWhere('employee.primarySectorCode = :dep AND employee.subSector = :sub', { dep: 'DEPOSITO', sub: 'HILADO' });
            } else if (sec === 'DEPOSITO_PACKAGING' || sec === 'PACKAGING') {
                qb.andWhere('employee.primarySectorCode = :dep AND employee.subSector = :sub', { dep: 'DEPOSITO', sub: 'PACKAGING' });
            } else if (sec === 'TEJEDURIA' || sec === '3000' || sec === 'PRODUCCION') {
                qb.andWhere('employee.primarySectorCode IN (:...tejeduriaCodes)', { tejeduriaCodes: ['TEJEDURIA', '3000', 'PRODUCCION'] });
            } else {
                qb.andWhere('employee.primarySectorCode = :sector', { sector: sec });
            }
        }
        return qb.orderBy('employee.fullName', 'ASC', 'NULLS LAST').addOrderBy('employee.legajo', 'ASC').getMany();
    }

    async findById(id: string) {
        const emp = await this.employeeRepo.findOne({ where: { id } });
        if (!emp) throw new NotFoundException('Empleado no encontrado');
        return emp;
    }

    async getMetrics() {
        const total = await this.employeeRepo.count();
        const active = await this.employeeRepo.count({ where: { active: true } });
        const inactive = total - active;

        const sectorCounts = await this.employeeRepo
            .createQueryBuilder('employee')
            .select('employee.primarySectorCode', 'sector')
            .addSelect('employee.subSector', 'subSector')
            .addSelect('COUNT(employee.id)', 'count')
            .groupBy('employee.primarySectorCode')
            .addGroupBy('employee.subSector')
            .getRawMany();

        return {
            total,
            active,
            inactive,
            bySector: sectorCounts.map((s) => {
                let sectorName = s.sector || 'SIN_ASIGNAR';
                if (sectorName === 'DEPOSITO') {
                    sectorName = s.subSector === 'HILADO' ? 'DEPOSITO_HILADO' : s.subSector === 'PACKAGING' ? 'DEPOSITO_PACKAGING' : 'DEPOSITO';
                } else if (sectorName === '3000' || sectorName === 'PRODUCCION') {
                    sectorName = 'TEJEDURIA';
                }
                return {
                    sector: sectorName,
                    count: parseInt(s.count, 10) || 0,
                };
            }),
        };
    }

    private normalizeSectorFields(dto: { primarySectorCode?: string; sector?: string; subSector?: string }) {
        let primary = (dto.primarySectorCode || dto.sector || '').trim().toUpperCase();
        let sub = (dto.subSector || '').trim().toUpperCase();

        if (primary === 'DEPOSITO_HILADO') {
            primary = 'DEPOSITO';
            sub = 'HILADO';
        } else if (primary === 'DEPOSITO_PACKAGING') {
            primary = 'DEPOSITO';
            sub = 'PACKAGING';
        } else if (primary === '3000' || primary === 'PRODUCCION') {
            primary = 'TEJEDURIA';
        }

        return {
            primarySectorCode: primary || null,
            subSector: sub || null,
        };
    }

    async create(dto: { legajo: string; fullName?: string; primarySectorCode?: string; sector?: string; subSector?: string; active?: boolean; source?: string }) {
        const existing = await this.employeeRepo.findOne({ where: { legajo: dto.legajo.trim() } });
        if (existing) {
            throw new ConflictException(`Ya existe un empleado con el legajo ${dto.legajo}`);
        }
        const { primarySectorCode, subSector } = this.normalizeSectorFields(dto);

        const emp = this.employeeRepo.create({
            legajo: dto.legajo.trim(),
            fullName: dto.fullName?.trim() || null,
            primarySectorCode,
            subSector,
            active: dto.active !== undefined ? dto.active : true,
            source: dto.source || 'MANUAL',
        });
        return this.employeeRepo.save(emp);
    }

    async update(id: string, dto: { legajo?: string; fullName?: string; primarySectorCode?: string; sector?: string; subSector?: string; active?: boolean }) {
        const emp = await this.findById(id);
        if (dto.legajo && dto.legajo.trim() !== emp.legajo) {
            const existing = await this.employeeRepo.findOne({ where: { legajo: dto.legajo.trim() } });
            if (existing && existing.id !== id) {
                throw new ConflictException(`Ya existe un empleado con el legajo ${dto.legajo}`);
            }
            emp.legajo = dto.legajo.trim();
        }
        if (dto.fullName !== undefined) emp.fullName = dto.fullName?.trim() || null;
        
        if (dto.primarySectorCode !== undefined || dto.sector !== undefined || dto.subSector !== undefined) {
            const { primarySectorCode, subSector } = this.normalizeSectorFields({
                primarySectorCode: dto.primarySectorCode ?? emp.primarySectorCode ?? undefined,
                sector: dto.sector,
                subSector: dto.subSector ?? emp.subSector ?? undefined,
            });
            emp.primarySectorCode = primarySectorCode;
            emp.subSector = subSector;
        }

        if (dto.active !== undefined) emp.active = dto.active;
        return this.employeeRepo.save(emp);
    }

    async toggleActive(id: string) {
        const emp = await this.findById(id);
        emp.active = !emp.active;
        return this.employeeRepo.save(emp);
    }

    async delete(id: string) {
        const emp = await this.findById(id);
        return this.employeeRepo.remove(emp);
    }

    async getProductivity(query?: { from?: string; to?: string; shift?: string; legajo?: string }) {
        try {
            const params: any[] = [];
            let whereSql = ' WHERE 1=1 ';

            if (query?.from) {
                params.push(query.from);
                whereSql += ` AND p."recordDate" >= $${params.length} `;
            }
            if (query?.to) {
                params.push(query.to);
                whereSql += ` AND p."recordDate" <= $${params.length} `;
            }
            if (query?.shift) {
                params.push(query.shift);
                whereSql += ` AND p.shift = $${params.length} `;
            }
            if (query?.legajo) {
                params.push(query.legajo);
                whereSql += ` AND (p."employeeLegajoSnapshot" = $${params.length} OR e.legajo = $${params.length}) `;
            }

            const rawSql = `
                SELECT 
                    COALESCE(e.id, NULL) as "employeeId",
                    COALESCE(p."employeeLegajoSnapshot", e.legajo, 'S/L') as "legajo",
                    COALESCE(p."employeeNameSnapshot", e."fullName", 'Sin Nombre') as "fullName",
                    e."primarySectorCode" as "primarySectorCode",
                    COALESCE(e.active, true) as "active",
                    COUNT(p.id)::int as "totalJornadas",
                    COALESCE(SUM(p."goodSocks"), 0)::bigint as "totalGood",
                    COALESCE(SUM(p."secondSocks"), 0)::bigint as "totalSecond",
                    COALESCE(SUM(p."secondMechanicalSocks"), 0)::bigint as "totalMechanical",
                    COALESCE(SUM(p."runSeconds"), 0)::bigint as "totalRunSeconds",
                    COUNT(DISTINCT p."machineNumberSnapshot")::int as "distinctMachines"
                FROM production_actual_entries p
                LEFT JOIN employees e ON (e.legajo = p."employeeLegajoSnapshot" OR e.id = p."employeeId")
                ${whereSql}
                GROUP BY e.id, p."employeeLegajoSnapshot", e.legajo, p."employeeNameSnapshot", e."fullName", e."primarySectorCode", e.active
                ORDER BY "totalGood" DESC
            `;

            const rows = await this.employeeRepo.manager.query(rawSql, params);

            let totalGood = 0;
            let totalSecond = 0;
            let totalMechanical = 0;
            let totalRunSeconds = 0;

            const ranking = rows.map((r: any) => {
                const good = Number(r.totalGood) || 0;
                const second = Number(r.totalSecond) || 0;
                const mechanical = Number(r.totalMechanical) || 0;
                const totalPieces = good + second;
                const scrapPct = totalPieces > 0 ? Number(((second / totalPieces) * 100).toFixed(1)) : 0;
                const runHours = Number(((Number(r.totalRunSeconds) || 0) / 3600).toFixed(1));

                totalGood += good;
                totalSecond += second;
                totalMechanical += mechanical;
                totalRunSeconds += Number(r.totalRunSeconds) || 0;

                return {
                    employeeId: r.employeeId,
                    legajo: r.legajo,
                    fullName: r.fullName,
                    primarySectorCode: r.primarySectorCode === '3000' || r.primarySectorCode === 'PRODUCCION' ? 'TEJEDURIA' : r.primarySectorCode,
                    active: r.active,
                    totalJornadas: Number(r.totalJornadas) || 0,
                    totalGood: good,
                    totalSecond: second,
                    totalMechanical: mechanical,
                    totalRunSeconds: Number(r.totalRunSeconds) || 0,
                    runHours,
                    scrapPct,
                    qualityPct: Number((100 - scrapPct).toFixed(1)),
                    distinctMachines: Number(r.distinctMachines) || 0,
                };
            });

            const overallPieces = totalGood + totalSecond;
            const overallScrapPct = overallPieces > 0 ? Number(((totalSecond / overallPieces) * 100).toFixed(1)) : 0;

            return {
                summary: {
                    totalOperariosActivos: ranking.length,
                    totalGood,
                    totalSecond,
                    totalMechanical,
                    totalHours: Number((totalRunSeconds / 3600).toFixed(1)),
                    overallQualityPct: Number((100 - overallScrapPct).toFixed(1)),
                    overallScrapPct,
                },
                ranking,
            };
        } catch (err) {
            // Gracefully handle if table is empty or query fails
            return {
                summary: {
                    totalOperariosActivos: 0,
                    totalGood: 0,
                    totalSecond: 0,
                    totalMechanical: 0,
                    totalHours: 0,
                    overallQualityPct: 100,
                    overallScrapPct: 0,
                },
                ranking: [],
            };
        }
    }
}
