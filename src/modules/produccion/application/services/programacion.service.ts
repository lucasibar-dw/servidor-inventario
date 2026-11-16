import { Injectable, NotFoundException, BadRequestException, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ProgramacionMaquinaEntity, EstadoBloqueProgramacion } from '../../domain/entities/programacion-maquina.entity';
import { MachineEntity } from '../../../maintenance/domain/entities/machine.entity';
import { BalancePedidoVentaEntity } from '../../../ventas/infrastructure/persistence/entities/balance-pedido-venta.entity';
import { ArticuloMachineTypeEntity } from '../../../articulos/infrastructure/persistence/entities/articulo-machine-type.entity';
import { ArticuloEntity } from '../../../articulos/infrastructure/persistence/entities/articulo.entity';

export interface AsignarBloqueDto {
    tipoPlan?: 'REAL' | 'IDEAL';
    pedidoId?: string;
    numeroPedido: string;
    cliente: string;
    articuloCodigo: string;
    articuloDescripcion?: string;
    talle?: string;
    maquinaId: string;
    fechaInicio: string;
    fechaFin: string;
    cantidadProgramadaPacks: number;
    colorIdentificador?: string;
    observaciones?: string;
}

export interface MoverBloqueDto {
    nuevaMaquinaId?: string;
    nuevaFechaInicio: string;
    nuevaFechaFin: string;
}

export interface SplitBloqueDto {
    cantidadLoteOriginal: number;
    cantidadNuevoLote: number;
    nuevaMaquinaId?: string;
    nuevaFechaInicio?: string;
    nuevaFechaFin?: string;
}

export interface GenerarPlanIdealDto {
    fechaInicio: string;
    dias?: number;
    cliente?: string;
}

export interface PromoverPlanDto {
    maquinaId?: string;
    desde: string;
}

@Injectable()
export class ProgramacionService implements OnModuleInit {
    private readonly logger = new Logger(ProgramacionService.name);
    private schemaInitialized = false;

    constructor(
        @InjectRepository(ProgramacionMaquinaEntity)
        private readonly programacionRepo: Repository<ProgramacionMaquinaEntity>,
        @InjectRepository(MachineEntity)
        private readonly machineRepo: Repository<MachineEntity>,
        @InjectRepository(BalancePedidoVentaEntity)
        private readonly pedidoRepo: Repository<BalancePedidoVentaEntity>,
        @InjectRepository(ArticuloMachineTypeEntity)
        private readonly articuloMachineTypeRepo: Repository<ArticuloMachineTypeEntity>,
        @InjectRepository(ArticuloEntity)
        private readonly articuloRepo: Repository<ArticuloEntity>,
        private readonly dataSource: DataSource,
    ) { }

    async onModuleInit() {
        await this.ensureSchema();
    }

    /**
     * Asegura la existencia de la tabla e índices en PostgreSQL
     */
    async ensureSchema() {
        if (this.schemaInitialized) return;
        try {
            await this.dataSource.query(`
                CREATE TABLE IF NOT EXISTS programacion_maquinas (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    tipo_plan VARCHAR(20) NOT NULL DEFAULT 'REAL',
                    pedido_id UUID REFERENCES balance_pedidos_ventas(id) ON DELETE SET NULL,
                    numero_pedido VARCHAR(100) NOT NULL,
                    cliente VARCHAR(120) NOT NULL,
                    articulo_codigo VARCHAR(100) NOT NULL,
                    articulo_descripcion VARCHAR(255),
                    talle VARCHAR(30),
                    
                    maquina_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
                    maquina_numero INTEGER NOT NULL,
                    
                    fecha_inicio TIMESTAMPTZ NOT NULL,
                    fecha_fin TIMESTAMPTZ NOT NULL,
                    
                    cantidad_programada_packs NUMERIC(14,2) NOT NULL,
                    cantidad_producida_packs NUMERIC(14,2) NOT NULL DEFAULT 0,
                    
                    bloque_padre_id UUID REFERENCES programacion_maquinas(id) ON DELETE SET NULL,
                    es_fraccion BOOLEAN NOT NULL DEFAULT FALSE,
                    numero_fraccion INTEGER DEFAULT 1,
                    
                    estado VARCHAR(30) NOT NULL DEFAULT 'PROGRAMADO',
                    color_identificador VARCHAR(30),
                    observaciones TEXT,
                    
                    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );

                ALTER TABLE programacion_maquinas ADD COLUMN IF NOT EXISTS tipo_plan VARCHAR(20) NOT NULL DEFAULT 'REAL';

                CREATE INDEX IF NOT EXISTS idx_prog_maquina_fechas ON programacion_maquinas (tipo_plan, maquina_id, fecha_inicio, fecha_fin);
                CREATE INDEX IF NOT EXISTS idx_prog_pedido ON programacion_maquinas (pedido_id);
                CREATE INDEX IF NOT EXISTS idx_prog_estado ON programacion_maquinas (estado);
            `);
            this.schemaInitialized = true;
            this.logger.log('Tabla programacion_maquinas asegurada correctamente.');
        } catch (err: any) {
            this.logger.error(`Error asegurando tabla programacion_maquinas: ${err.message}`);
        }
    }

    /**
     * Obtiene todas las máquinas y los bloques programados en un rango de fechas y tipo de plan
     */
    async getTimeline(desdeStr: string, hastaStr: string, tipoPlan: 'REAL' | 'IDEAL' = 'REAL') {
        await this.ensureSchema();

        const desde = new Date(desdeStr);
        const hasta = new Date(hastaStr);

        // Traer máquinas ordenadas por número
        const maquinas = await this.machineRepo.find({
            relations: ['plant', 'type'],
            order: { number: 'ASC' },
        });

        // Traer bloques correspondientes al tipo de plan
        const bloques = await this.programacionRepo.createQueryBuilder('b')
            .leftJoinAndSelect('b.pedido', 'pedido')
            .where('b.tipo_plan = :tipoPlan', { tipoPlan })
            .andWhere('b.fecha_inicio <= :hasta AND b.fecha_fin >= :desde', { desde, hasta })
            .andWhere('b.estado != :cancelado', { cancelado: EstadoBloqueProgramacion.CANCELADO })
            .orderBy('b.fecha_inicio', 'ASC')
            .getMany();

        return {
            maquinas,
            bloques,
            tipoPlan,
            rango: { desde, hasta },
        };
    }

    /**
     * Obtiene el backlog de pedidos de venta con saldo pendiente por tejer
     */
    async getBacklog(cliente?: string, search?: string) {
        await this.ensureSchema();

        const qb = this.pedidoRepo.createQueryBuilder('p')
            .leftJoinAndSelect('p.articulo', 'art')
            .where('p.packs_pedidas > p.packs_tejidas')
            .andWhere('p.estado NOT IN (:...estadosExcluidos)', {
                estadosExcluidos: ['CANCELADO', 'DESPACHADO'],
            });

        if (cliente && cliente !== 'TODOS') {
            qb.andWhere('UPPER(p.cliente) = :cliente', { cliente: cliente.toUpperCase().trim() });
        }

        if (search && search.trim()) {
            const term = `%${search.trim().toLowerCase()}%`;
            qb.andWhere(
                '(LOWER(p.numeroPedido) LIKE :term OR LOWER(p.articuloCodigo) LIKE :term OR LOWER(COALESCE(p.articuloDescripcion, \'\')) LIKE :term)',
                { term },
            );
        }

        qb.orderBy('p.prioridad = \'URGENTE\'', 'DESC')
            .addOrderBy('p.prioridad = \'ALTA\'', 'DESC')
            .addOrderBy('p.fechaEntrega', 'ASC', 'NULLS LAST');

        const pedidos = await qb.getMany();

        // Calcular cuánto ya está asignado en bloques REALES
        const pedidosConSaldos = await Promise.all(
            pedidos.map(async (ped) => {
                const progSum = await this.programacionRepo.createQueryBuilder('b')
                    .select('SUM(b.cantidad_programada_packs)', 'totalProg')
                    .where('b.pedido_id = :pid AND b.tipo_plan = \'REAL\'', { pid: ped.id })
                    .andWhere('b.estado != :cancelado', { cancelado: EstadoBloqueProgramacion.CANCELADO })
                    .getRawOne();

                const totalYaProgramado = Number(progSum?.totalProg) || 0;
                const saldoRealTejido = Math.max(0, Number(ped.packsPedidas) - Number(ped.packsTejidas));
                const saldoPendienteProgramar = Math.max(0, saldoRealTejido - totalYaProgramado);

                return {
                    ...ped,
                    totalYaProgramado,
                    saldoPendienteProgramar,
                };
            }),
        );

        return pedidosConSaldos;
    }

    /**
     * Asigna un pedido a una máquina creando un bloque de programación
     */
    async asignarBloque(dto: AsignarBloqueDto) {
        await this.ensureSchema();

        const maquina = await this.machineRepo.findOne({ where: { id: dto.maquinaId } });
        if (!maquina) {
            throw new NotFoundException(`Máquina con ID ${dto.maquinaId} no encontrada`);
        }

        let pedido: BalancePedidoVentaEntity | null = null;
        if (dto.pedidoId) {
            pedido = await this.pedidoRepo.findOne({ where: { id: dto.pedidoId } });
        }

        const bloque = this.programacionRepo.create({
            tipoPlan: dto.tipoPlan || 'REAL',
            pedidoId: dto.pedidoId || null,
            numeroPedido: dto.numeroPedido,
            cliente: dto.cliente,
            articuloCodigo: dto.articuloCodigo,
            articuloDescripcion: dto.articuloDescripcion || pedido?.articuloDescripcion || null,
            talle: dto.talle || pedido?.talle || null,
            maquinaId: dto.maquinaId,
            maquinaNumero: maquina.number,
            fechaInicio: new Date(dto.fechaInicio),
            fechaFin: new Date(dto.fechaFin),
            cantidadProgramadaPacks: Number(dto.cantidadProgramadaPacks),
            cantidadProducidaPacks: 0,
            colorIdentificador: dto.colorIdentificador || null,
            observaciones: dto.observaciones || null,
            estado: EstadoBloqueProgramacion.PROGRAMADO,
        });

        return await this.programacionRepo.save(bloque);
    }

    /**
     * Mueve un bloque en el tiempo o a otra máquina
     */
    async moverBloque(id: string, dto: MoverBloqueDto) {
        await this.ensureSchema();

        const bloque = await this.programacionRepo.findOne({ where: { id } });
        if (!bloque) {
            throw new NotFoundException(`Bloque de programación con ID ${id} no encontrado`);
        }

        if (dto.nuevaMaquinaId && dto.nuevaMaquinaId !== bloque.maquinaId) {
            const nuevaMaquina = await this.machineRepo.findOne({ where: { id: dto.nuevaMaquinaId } });
            if (!nuevaMaquina) {
                throw new NotFoundException(`Máquina destino no encontrada`);
            }
            bloque.maquinaId = dto.nuevaMaquinaId;
            bloque.maquinaNumero = nuevaMaquina.number;
        }

        bloque.fechaInicio = new Date(dto.nuevaFechaInicio);
        bloque.fechaFin = new Date(dto.nuevaFechaFin);

        return await this.programacionRepo.save(bloque);
    }

    /**
     * Divide un bloque de producción en 2 partes (Split de lote)
     */
    async splitBloque(id: string, dto: SplitBloqueDto) {
        await this.ensureSchema();

        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const bloqueOriginal = await queryRunner.manager.findOne(ProgramacionMaquinaEntity, { where: { id } });
            if (!bloqueOriginal) {
                throw new NotFoundException(`Bloque con ID ${id} no encontrado`);
            }

            const cantOriginal = Number(dto.cantidadLoteOriginal);
            const cantNueva = Number(dto.cantidadNuevoLote);

            if (cantOriginal <= 0 || cantNueva <= 0) {
                throw new BadRequestException('Las cantidades de los lotes deben ser mayores a cero.');
            }

            const totalMs = new Date(bloqueOriginal.fechaFin).getTime() - new Date(bloqueOriginal.fechaInicio).getTime();
            const duracion1Ms = Math.round((totalMs * cantOriginal) / (cantOriginal + cantNueva));
            const duracion2Ms = Math.max(1800000, totalMs - duracion1Ms);

            const nuevaFechaFinOriginal = new Date(new Date(bloqueOriginal.fechaInicio).getTime() + duracion1Ms);

            bloqueOriginal.cantidadProgramadaPacks = cantOriginal;
            bloqueOriginal.fechaFin = nuevaFechaFinOriginal;
            await queryRunner.manager.save(bloqueOriginal);

            const destinoMaquinaId = dto.nuevaMaquinaId || bloqueOriginal.maquinaId;
            const maquinaDestino = await queryRunner.manager.findOne(MachineEntity, { where: { id: destinoMaquinaId } });
            const maquinaNumero = maquinaDestino ? maquinaDestino.number : bloqueOriginal.maquinaNumero;

            const nuevaFechaInicioHijo = dto.nuevaFechaInicio ? new Date(dto.nuevaFechaInicio) : nuevaFechaFinOriginal;
            const nuevaFechaFinHijo = dto.nuevaFechaFin
                ? new Date(dto.nuevaFechaFin)
                : new Date(nuevaFechaInicioHijo.getTime() + duracion2Ms);

            const bloqueHijo = queryRunner.manager.create(ProgramacionMaquinaEntity, {
                tipoPlan: bloqueOriginal.tipoPlan,
                pedidoId: bloqueOriginal.pedidoId,
                numeroPedido: bloqueOriginal.numeroPedido,
                cliente: bloqueOriginal.cliente,
                articuloCodigo: bloqueOriginal.articuloCodigo,
                articuloDescripcion: bloqueOriginal.articuloDescripcion,
                talle: bloqueOriginal.talle,
                maquinaId: destinoMaquinaId,
                maquinaNumero: maquinaNumero,
                fechaInicio: nuevaFechaInicioHijo,
                fechaFin: nuevaFechaFinHijo,
                cantidadProgramadaPacks: cantNueva,
                cantidadProducidaPacks: 0,
                bloquePadreId: bloqueOriginal.id,
                esFraccion: true,
                numeroFraccion: (bloqueOriginal.numeroFraccion || 1) + 1,
                colorIdentificador: bloqueOriginal.colorIdentificador,
                estado: EstadoBloqueProgramacion.PROGRAMADO,
                observaciones: `Fracción creada a partir del bloque #${bloqueOriginal.numeroPedido}`,
            });

            const savedHijo = await queryRunner.manager.save(bloqueHijo);

            await queryRunner.commitTransaction();

            return {
                bloqueOriginal,
                bloqueHijo: savedHijo,
            };
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * MOTOR "PLANIFICAME": Genera un plan ideal optimizado considerando
     * - Compatibilidad de tipos de máquina (articulo_machine_types)
     * - Cadencia de ciclo (cycleTimeSeconds)
     * - Minimización de tiempos de cambio (setups)
     * - Prioridades y fechas de entrega del cliente
     */
    async generarPlanIdeal(dto: GenerarPlanIdealDto) {
        await this.ensureSchema();

        const startTime = new Date(dto.fechaInicio || new Date());
        startTime.setMinutes(0, 0, 0);

        const dias = dto.dias || 7;
        const endTime = new Date(startTime.getTime() + dias * 24 * 3600 * 1000);

        this.logger.log(`Generando Plan Ideal desde ${startTime.toISOString()} hasta ${endTime.toISOString()}`);

        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // 1. Limpiar bloques 'IDEAL' existentes en esta ventana
            await queryRunner.manager.createQueryBuilder()
                .delete()
                .from(ProgramacionMaquinaEntity)
                .where('tipo_plan = \'IDEAL\' AND fecha_inicio >= :startTime', { startTime })
                .execute();

            // 2. Cargar máquinas disponibles (excluir PARADA)
            const maquinas = await queryRunner.manager.find(MachineEntity, {
                relations: ['type'],
                order: { number: 'ASC' },
            });
            const maquinasActivas = maquinas.filter((m) => m.status !== 'PARADA');

            if (maquinasActivas.length === 0) {
                throw new BadRequestException('No hay máquinas activas disponibles para planificar.');
            }

            // 3. Cargar matriz de compatibilidad y cadencia
            const articulosMachineTypes = await queryRunner.manager.find(ArticuloMachineTypeEntity, {
                relations: ['articulo', 'machineType'],
            });

            const compatibilidadPorArticulo = new Map<string, ArticuloMachineTypeEntity[]>();
            articulosMachineTypes.forEach((amt) => {
                const cod = (amt.articulo?.codigo || '').toUpperCase().trim();
                if (cod) {
                    const list = compatibilidadPorArticulo.get(cod) || [];
                    list.push(amt);
                    compatibilidadPorArticulo.set(cod, list);
                }
            });

            // 4. Cargar pedidos con saldo pendiente de tejeduría
            const qbPedidos = queryRunner.manager.createQueryBuilder(BalancePedidoVentaEntity, 'p')
                .where('p.packs_pedidas > p.packs_tejidas')
                .andWhere('p.estado NOT IN (\'CANCELADO\', \'DESPACHADO\')');

            if (dto.cliente && dto.cliente !== 'TODOS') {
                qbPedidos.andWhere('UPPER(p.cliente) = :cliente', { cliente: dto.cliente.toUpperCase().trim() });
            }

            qbPedidos
                .orderBy('p.prioridad = \'URGENTE\'', 'DESC')
                .addOrderBy('p.prioridad = \'ALTA\'', 'DESC')
                .addOrderBy('p.fechaEntrega', 'ASC', 'NULLS LAST');

            const pedidos = await qbPedidos.getMany();

            if (pedidos.length === 0) {
                await queryRunner.commitTransaction();
                return { mensaje: 'No hay pedidos con saldo pendiente para planificar.', bloquesGenerados: 0 };
            }

            // 5. Estado de la simulación de máquinas
            const maquinaTimeTracker = new Map<string, number>();
            const maquinaUltimoArticulo = new Map<string, string>();

            maquinasActivas.forEach((m) => {
                maquinaTimeTracker.set(m.id, startTime.getTime());
                maquinaUltimoArticulo.set(m.id, '');
            });

            const bloquesCreados: ProgramacionMaquinaEntity[] = [];

            // 6. Asignación heurística por pedido
            for (const ped of pedidos) {
                const saldoPacks = Number(ped.packsPedidas) - Number(ped.packsTejidas);
                if (saldoPacks <= 0) continue;

                const artCod = (ped.articuloCodigo || '').toUpperCase().trim();
                const compatList = compatibilidadPorArticulo.get(artCod) || [];

                let candidatas = maquinasActivas;
                if (compatList.length > 0) {
                    const typeIdsPermitidos = new Set(compatList.map((c) => c.machineTypeId));
                    const filtradas = maquinasActivas.filter((m) => m.typeId && typeIdsPermitidos.has(m.typeId));
                    if (filtradas.length > 0) {
                        candidatas = filtradas;
                    }
                }

                let mejorMaquina = candidatas[0];
                let mejorFechaInicio = Infinity;
                let mejorFechaFin = Infinity;

                for (const maq of candidatas) {
                    const tiempoLibre = maquinaTimeTracker.get(maq.id) || startTime.getTime();
                    const ultimoArt = maquinaUltimoArticulo.get(maq.id) || '';

                    const esMismoArticulo = ultimoArt && ultimoArt === artCod;
                    const setupMs = esMismoArticulo ? 0 : 90 * 60 * 1000;

                    let cycleSeconds = 120;
                    const matchAmt = compatList.find((c) => c.machineTypeId === maq.typeId);
                    if (matchAmt && matchAmt.cycleTimeSeconds) {
                        cycleSeconds = Number(matchAmt.cycleTimeSeconds);
                    }

                    const paresPorPack = ped.paresPorPack || 1;
                    const totalPares = saldoPacks * paresPorPack;
                    const duracionMs = Math.max(2 * 3600 * 1000, totalPares * cycleSeconds * 1000);

                    const fechaInicioPropuesta = tiempoLibre + setupMs;
                    const fechaFinPropuesta = fechaInicioPropuesta + duracionMs;

                    if (fechaFinPropuesta < mejorFechaFin) {
                        mejorMaquina = maq;
                        mejorFechaInicio = fechaInicioPropuesta;
                        mejorFechaFin = fechaFinPropuesta;
                    }
                }

                if (mejorFechaInicio >= endTime.getTime()) {
                    continue;
                }

                const bloque = queryRunner.manager.create(ProgramacionMaquinaEntity, {
                    tipoPlan: 'IDEAL',
                    pedidoId: ped.id,
                    numeroPedido: ped.numeroPedido,
                    cliente: ped.cliente,
                    articuloCodigo: ped.articuloCodigo,
                    articuloDescripcion: ped.articuloDescripcion,
                    talle: ped.talle,
                    maquinaId: mejorMaquina.id,
                    maquinaNumero: mejorMaquina.number,
                    fechaInicio: new Date(mejorFechaInicio),
                    fechaFin: new Date(mejorFechaFin),
                    cantidadProgramadaPacks: saldoPacks,
                    cantidadProducidaPacks: 0,
                    estado: EstadoBloqueProgramacion.PROGRAMADO,
                    observaciones: `Plan Ideal automático. Cadencia optimizada.`,
                });

                bloquesCreados.push(bloque);

                maquinaTimeTracker.set(mejorMaquina.id, mejorFechaFin);
                maquinaUltimoArticulo.set(mejorMaquina.id, artCod);
            }

            await queryRunner.manager.save(bloquesCreados);
            await queryRunner.commitTransaction();

            this.logger.log(`Plan Ideal generado exitosamente con ${bloquesCreados.length} bloques.`);

            return {
                mensaje: `Plan Ideal generado con ${bloquesCreados.length} bloques programados.`,
                bloquesGenerados: bloquesCreados.length,
            };
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * PROMOVER PLAN IDEAL A PLAN GUÍA REAL
     */
    async promoverPlanIdeal(dto: PromoverPlanDto) {
        await this.ensureSchema();

        const desde = new Date(dto.desde || new Date());

        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const qbDelete = queryRunner.manager.createQueryBuilder()
                .delete()
                .from(ProgramacionMaquinaEntity)
                .where('tipo_plan = \'REAL\' AND fecha_inicio >= :desde', { desde });

            const qbSelect = queryRunner.manager.createQueryBuilder(ProgramacionMaquinaEntity, 'b')
                .where('b.tipo_plan = \'IDEAL\' AND b.fecha_inicio >= :desde', { desde });

            if (dto.maquinaId) {
                qbDelete.andWhere('maquina_id = :mid', { mid: dto.maquinaId });
                qbSelect.andWhere('b.maquina_id = :mid', { mid: dto.maquinaId });
            }

            // 1. Eliminar bloques reales futuros que van a ser reemplazados
            await qbDelete.execute();

            // 2. Obtener bloques ideales
            const bloquesIdeales = await qbSelect.getMany();

            if (bloquesIdeales.length === 0) {
                await queryRunner.commitTransaction();
                return {
                    mensaje: 'No había bloques en el plan ideal para promover.',
                    promovidos: 0,
                };
            }

            // 3. Clonar cada bloque ideal en el plan real
            const nuevosReales = bloquesIdeales.map((b) => {
                return queryRunner.manager.create(ProgramacionMaquinaEntity, {
                    tipoPlan: 'REAL',
                    pedidoId: b.pedidoId,
                    numeroPedido: b.numeroPedido,
                    cliente: b.cliente,
                    articuloCodigo: b.articuloCodigo,
                    articuloDescripcion: b.articuloDescripcion,
                    talle: b.talle,
                    maquinaId: b.maquinaId,
                    maquinaNumero: b.maquinaNumero,
                    fechaInicio: b.fechaInicio,
                    fechaFin: b.fechaFin,
                    cantidadProgramadaPacks: b.cantidadProgramadaPacks,
                    cantidadProducidaPacks: 0,
                    estado: EstadoBloqueProgramacion.PROGRAMADO,
                    colorIdentificador: b.colorIdentificador,
                    observaciones: `Promovido desde Plan Ideal`,
                });
            });

            await queryRunner.manager.save(nuevosReales);
            await queryRunner.commitTransaction();

            return {
                mensaje: dto.maquinaId
                    ? `Máquina promovida exitosamente con ${nuevosReales.length} bloques al Plan Real.`
                    : `Todo el Plan Ideal (${nuevosReales.length} bloques) fue aplicado al Plan Real.`,
                promovidos: nuevosReales.length,
            };
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Elimina un bloque de programación
     */
    async eliminarBloque(id: string) {
        await this.ensureSchema();

        const bloque = await this.programacionRepo.findOne({ where: { id } });
        if (!bloque) {
            throw new NotFoundException(`Bloque con ID ${id} no encontrado`);
        }
        await this.programacionRepo.remove(bloque);
        return { success: true, message: 'Bloque eliminado correctamente' };
    }

    /**
     * Actualiza el estado de un bloque
     */
    async actualizarEstado(id: string, estado: string) {
        await this.ensureSchema();

        const bloque = await this.programacionRepo.findOne({ where: { id } });
        if (!bloque) {
            throw new NotFoundException(`Bloque con ID ${id} no encontrado`);
        }
        bloque.estado = estado;
        return await this.programacionRepo.save(bloque);
    }
}
