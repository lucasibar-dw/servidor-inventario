import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { DepotEntity, PositionEntity } from '../../infrastructure/persistence/entities/depot.entity';

@Injectable()
export class DepotsService {
    constructor(
        @InjectRepository(DepotEntity)
        private readonly depotRepo: Repository<DepotEntity>,
        @InjectRepository(PositionEntity)
        private readonly positionRepo: Repository<PositionEntity>,
        private readonly dataSource: DataSource,
    ) { }

    private isAllowed(user: any, depotId: string): boolean {
        if (!user || !user.role) return false;
        if (user.role.toUpperCase() === 'ADMIN') return true;
        const allowed = user.allowedDepotIds || [];
        return allowed.includes(depotId);
    }

    async findAllDepots(user: any): Promise<DepotEntity[]> {
        const depots = await this.depotRepo.find({ relations: ['positions'] });

        // Filter based on allowedDepotIds if not ADMIN
        const isAdmin = user?.role?.toUpperCase() === 'ADMIN';
        const finalDepots = isAdmin 
            ? depots 
            : depots.filter(d => (user?.allowedDepotIds || []).includes(d.id));

        // Reparación automática: asegurar que cada depósito tenga su posición ENTRADA
        for (const d of depots) {
            if (!d.positions || !d.positions.find(p => p.codigo === 'ENTRADA')) {
                const p = this.positionRepo.create({
                    id: uuidv4(),
                    depositoId: d.id,
                    codigo: 'ENTRADA',
                    categoria: 'STORAGE',
                    meta: { system: true, description: 'Posición de recepción por defecto (auto-generada)' },
                });
                await this.positionRepo.save(p);
                // Actualizar la lista local para que el frontend lo vea de inmediato
                if (!d.positions) d.positions = [];
                d.positions.push(p);
            }
        }

        return finalDepots;
    }

    async findArchivedDepots(): Promise<DepotEntity[]> {
        return this.depotRepo.find({ where: { activo: false }, relations: ['positions'] });
    }

    async findOneDepot(id: string, user?: any): Promise<DepotEntity> {
        if (user && !this.isAllowed(user, id)) {
            throw new NotFoundException(`Depósito ${id} no encontrado o acceso denegado`);
        }
        const d = await this.depotRepo.findOne({ where: { id }, relations: ['positions'] });
        if (!d) throw new NotFoundException(`Depósito ${id} no encontrado`);

        // Reparación automática para vista individual
        if (!d.positions || !d.positions.find(p => p.codigo === 'ENTRADA')) {
            const p = this.positionRepo.create({
                id: uuidv4(),
                depositoId: d.id,
                codigo: 'ENTRADA',
                categoria: 'STORAGE',
                meta: { system: true, description: 'Posición de recepción por defecto (auto-generada)' },
            });
            await this.positionRepo.save(p);
            if (!d.positions) d.positions = [];
            d.positions.push(p);
        }

        return d;
    }

    async createDepot(dto: { nombre: string; planta?: string }): Promise<DepotEntity> {
        const depotId = uuidv4();

        await this.dataSource.transaction(async (manager: EntityManager) => {
             const d = manager.create(DepotEntity, {
                 id: depotId,
                 nombre: dto.nombre,
                 planta: dto.planta ?? null,
             });
             await manager.save(DepotEntity, d);

             // Crear posición por defecto "ENTRADA"
             const p = manager.create(PositionEntity, {
                 id: uuidv4(),
                 depositoId: depotId,
                 codigo: 'ENTRADA',
                 categoria: 'INPUT',
                 meta: {
                     system: true,
                     description: 'Posición de recepción obligatoria para auditoría y cuarentena',
                 },
             });
             await manager.save(PositionEntity, p);
         });

         return this.findOneDepot(depotId);
     }

     async updateDepot(id: string, dto: Partial<{ nombre: string; planta: string; activo: boolean }>): Promise<DepotEntity> {
         const d = await this.findOneDepot(id);
         Object.assign(d, dto);
         return this.depotRepo.save(d);
     }

    async removeDepot(id: string): Promise<void> {
        const d = await this.findOneDepot(id);
        d.activo = false;
        await this.depotRepo.save(d);
    }

    async restoreDepot(id: string): Promise<DepotEntity> {
        const d = await this.depotRepo.findOne({ where: { id }, relations: ['positions'] });
        if (!d) throw new NotFoundException(`Depot ${id} not found`);
        d.activo = true;
        return this.depotRepo.save(d);
    }

    async findOnePosition(id: string, user?: any): Promise<PositionEntity> {
        const p = await this.positionRepo.findOneBy({ id });
        if (!p) throw new NotFoundException(`Posición ${id} no encontrada`);
        
        if (user && !this.isAllowed(user, p.depositoId)) {
            throw new NotFoundException(`Acceso denegado a la posición en depósito ${p.depositoId}`);
        }
        return p;
    }

    async createPosition(depotId: string, dto: { codigo: string; categoria: string; categoriaPrincipal?: string | null; categoriaSecundaria?: string | null; metrosCubicos?: number; meta?: Record<string, any> }): Promise<PositionEntity> {
        await this.findOneDepot(depotId);
        const positionId = uuidv4();
        
        const p = this.positionRepo.create({
            id: positionId,
            depositoId: depotId,
            codigo: dto.codigo,
            categoria: dto.categoria,
            categoriaPrincipal: dto.categoriaPrincipal ?? null,
            categoriaSecundaria: dto.categoriaSecundaria ?? null,
            metrosCubicos: dto.metrosCubicos ?? null,
            meta: dto.meta ?? null,
        });
        return this.positionRepo.save(p);
    }

    async updatePosition(id: string, dto: Partial<{ codigo: string; categoria: string; categoriaPrincipal: string | null; categoriaSecundaria: string | null; metrosCubicos: number; activo: boolean; meta: Record<string, any> }>): Promise<PositionEntity> {
        const p = await this.findOnePosition(id);
        
        Object.assign(p, dto);
        return this.positionRepo.save(p);
    }

    async removePosition(id: string): Promise<void> {
        const p = await this.findOnePosition(id);
        p.activo = false;
        await this.positionRepo.save(p);
    }

    async renamePlant(oldName: string, newName: string): Promise<void> {
        await this.depotRepo.update({ planta: oldName }, { planta: newName });
    }

    async togglePlantStatus(planta: string, activo: boolean): Promise<void> {
        await this.depotRepo.update({ planta }, { activo });
    }
    /** Carga a granel de posiciones — ruta temporal para alta masiva */
    async bulkCreatePositions(depotId: string, codigos: string[]): Promise<PositionEntity[]> {
        await this.findOneDepot(depotId); // valida que exista

        return this.dataSource.transaction(async (manager: EntityManager) => {
            const positions = codigos.map(codigo =>
                manager.create(PositionEntity, {
                    id: uuidv4(),
                    depositoId: depotId,
                    codigo,
                    categoria: 'STORAGE',
                    activo: true,
                    metrosCubicos: 0.016, // 20cm × 20cm × 40cm
                    meta: null,
                }),
            );
            return manager.save(PositionEntity, positions);
        });
    }

    async findPositionsByDepot(depotId: string): Promise<PositionEntity[]> {
        const d = await this.findOneDepot(depotId);
        return d.positions ?? [];
    }
}
