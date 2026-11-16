import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { TaskPersistenceEntity } from '../../infrastructure/persistence/entities/task.entity';
import { TaskTypeCatalogEntity } from '../../infrastructure/persistence/entities/task-type-catalog.entity';
import { PositionEntity, DepotEntity } from '../../infrastructure/persistence/entities/depot.entity';
import { StockBalanceEntity } from '../../infrastructure/persistence/entities/stock-balance.entity';
import { EmployeeEntity } from '../../../hr/domain/entities/employee.entity';
import { MovimientosService } from './movimientos.service';
import { TipoMovimiento } from '../../infrastructure/persistence/entities/movimiento.entity';
import { TaskStatus, TaskType } from 'src/modules/warehouse/domain/entities/task.entity';
import { v4 as uuidv4 } from 'uuid';

export interface CreateTaskDto {
    type: TaskType | string;
    depositoId?: string | null;
    taskTypeId?: string | null;
    title: string;
    description?: string | null;
    customerOrDestination?: string | null;
    dueDate?: string | Date | null;
    originSector?: string;
    controlType?: string | null;
    controlFilter?: string | null;
    itemId?: string | null;
    batchId?: string | null;
    sourcePositionId?: string | null;
    targetPositionId?: string | null;
    qty?: number | null;
    priority?: number;
    assignedEmployeeId?: string | null;
    tiempoEstimadoMinutos?: number | null;
}

export interface CompleteTaskDto {
    actualTargetPositionId?: string | null;
    actualQty?: number | null;
    tiempoRealMinutos?: number | null;
    completedByEmployeeId?: string | null;
    resultStatus?: 'CONFORME' | 'DISCREPANCIA' | 'PARCIAL' | string;
    resultNotes?: string | null;
}

@Injectable()
export class TasksService {
    constructor(
        @InjectRepository(TaskPersistenceEntity)
        private readonly taskRepo: Repository<TaskPersistenceEntity>,
        @InjectRepository(TaskTypeCatalogEntity)
        private readonly taskTypeRepo: Repository<TaskTypeCatalogEntity>,
        @InjectRepository(PositionEntity)
        private readonly positionRepo: Repository<PositionEntity>,
        @InjectRepository(StockBalanceEntity)
        private readonly stockBalanceRepo: Repository<StockBalanceEntity>,
        @InjectRepository(EmployeeEntity)
        private readonly employeeRepo: Repository<EmployeeEntity>,
        private readonly movimientosService: MovimientosService,
    ) {}

    async findAll(query?: {
        depositoId?: string;
        status?: string;
        type?: string;
        employeeId?: string;
        q?: string;
        from?: string;
        to?: string;
    }) {
        const qb = this.taskRepo.createQueryBuilder('task')
            .leftJoinAndSelect('task.deposito', 'deposito')
            .leftJoinAndSelect('task.taskType', 'taskType')
            .leftJoinAndSelect('task.item', 'item')
            .leftJoinAndSelect('task.batch', 'batch')
            .leftJoinAndSelect('task.sourcePosition', 'sourcePosition')
            .leftJoinAndSelect('task.targetPosition', 'targetPosition')
            .leftJoinAndSelect('task.assignedEmployee', 'assignedEmployee')
            .leftJoinAndSelect('task.completedByEmployee', 'completedByEmployee');

        if (query?.depositoId) {
            qb.andWhere('task.depositoId = :depositoId', { depositoId: query.depositoId });
        }

        if (query?.status) {
            qb.andWhere('task.status = :status', { status: query.status });
        }

        if (query?.type) {
            qb.andWhere('task.type = :type', { type: query.type });
        }

        if (query?.employeeId) {
            qb.andWhere('(task.assignedEmployeeId = :empId OR task.completedByEmployeeId = :empId)', { empId: query.employeeId });
        }

        if (query?.q) {
            const term = `%${query.q.trim()}%`;
            qb.andWhere(
                '(task.title ILIKE :term OR task.description ILIKE :term OR task.customerOrDestination ILIKE :term OR item.descripcion ILIKE :term OR item.codigo ILIKE :term)',
                { term }
            );
        }

        if (query?.from) {
            qb.andWhere('task.createdAt >= :from', { from: new Date(query.from) });
        }
        if (query?.to) {
            const toDate = new Date(query.to);
            toDate.setHours(23, 59, 59, 999);
            qb.andWhere('task.createdAt <= :to', { to: toDate });
        }

        return qb.orderBy('task.priority', 'ASC')
            .addOrderBy('task.createdAt', 'DESC')
            .getMany();
    }

    async findPending(depositoId?: string) {
        const qb = this.taskRepo.createQueryBuilder('task')
            .leftJoinAndSelect('task.deposito', 'deposito')
            .leftJoinAndSelect('task.taskType', 'taskType')
            .leftJoinAndSelect('task.item', 'item')
            .leftJoinAndSelect('task.batch', 'batch')
            .leftJoinAndSelect('task.sourcePosition', 'sourcePosition')
            .leftJoinAndSelect('task.targetPosition', 'targetPosition')
            .leftJoinAndSelect('task.assignedEmployee', 'assignedEmployee')
            .where('task.status IN (:...statuses)', { statuses: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] });

        if (depositoId) {
            qb.andWhere('task.depositoId = :depositoId', { depositoId });
        }

        return qb.orderBy('task.priority', 'ASC')
            .addOrderBy('task.dueDate', 'ASC', 'NULLS LAST')
            .addOrderBy('task.createdAt', 'ASC')
            .getMany();
    }

    async createTask(data: CreateTaskDto) {
        let estimatedMinutes = data.tiempoEstimadoMinutos;

        // Si no especificó minutos pero eligió un tipo de catálogo, tomar el estimado estándar
        if (!estimatedMinutes && data.taskTypeId) {
            const catalogType = await this.taskTypeRepo.findOne({ where: { id: data.taskTypeId } });
            if (catalogType) {
                estimatedMinutes = catalogType.tiempoEstimadoMinutos;
            }
        }

        const task = this.taskRepo.create({
            id: uuidv4(),
            type: data.type,
            depositoId: data.depositoId || null,
            taskTypeId: data.taskTypeId || null,
            title: data.title,
            description: data.description || null,
            customerOrDestination: data.customerOrDestination || null,
            dueDate: data.dueDate ? new Date(data.dueDate) : null,
            originSector: data.originSector || 'DEPOSITO',
            controlType: data.controlType || null,
            controlFilter: data.controlFilter || null,
            itemId: data.itemId || null,
            batchId: data.batchId || null,
            sourcePositionId: data.sourcePositionId || null,
            targetPositionId: data.targetPositionId || null,
            qty: data.qty != null ? Number(data.qty) : null,
            status: TaskStatus.PENDING,
            priority: data.priority || 2,
            assignedEmployeeId: data.assignedEmployeeId || null,
            tiempoEstimadoMinutos: estimatedMinutes || 30,
        });

        return this.taskRepo.save(task);
    }

    async startTask(taskId: string, employeeId?: string) {
        const task = await this.taskRepo.findOne({ where: { id: taskId } });
        if (!task) throw new NotFoundException('Tarea no encontrada');

        task.status = TaskStatus.IN_PROGRESS;
        task.startedAt = new Date();
        if (employeeId) {
            task.assignedEmployeeId = employeeId;
        }

        return this.taskRepo.save(task);
    }

    async completeTask(taskId: string, dto: CompleteTaskDto, userId?: string) {
        const task = await this.taskRepo.findOne({
            where: { id: taskId },
            relations: ['sourcePosition', 'targetPosition', 'item', 'batch', 'deposito']
        });
        if (!task) throw new NotFoundException('Tarea no encontrada');

        const completedAt = new Date();
        task.status = TaskStatus.COMPLETED;
        task.completedAt = completedAt;
        if (userId) task.assignedUserId = userId;
        if (dto.completedByEmployeeId) task.completedByEmployeeId = dto.completedByEmployeeId;

        // Calcular tiempo real
        if (dto.tiempoRealMinutos != null) {
            task.tiempoRealMinutos = Math.max(1, Math.round(dto.tiempoRealMinutos));
        } else if (task.startedAt) {
            const diffMs = completedAt.getTime() - new Date(task.startedAt).getTime();
            task.tiempoRealMinutos = Math.max(1, Math.round(diffMs / 60000));
        } else {
            // Si nunca se inició formalmente con startTask, asumir el tiempo estimado
            task.tiempoRealMinutos = task.tiempoEstimadoMinutos || 30;
        }

        task.resultStatus = dto.resultStatus || 'CONFORME';
        task.resultNotes = dto.resultNotes || null;

        // Posición final confirmada
        const targetPosId = dto.actualTargetPositionId || task.targetPositionId;
        if (targetPosId) {
            task.targetPositionId = targetPosId;
        }

        // Si la tarea implica movimiento de stock (PUTAWAY, REPLENISHMENT o PICKING) y tiene origen y destino
        if (task.sourcePositionId && targetPosId && task.itemId && task.qty && task.sourcePositionId !== targetPosId) {
            const moveQty = dto.actualQty != null ? Number(dto.actualQty) : Number(task.qty);
            try {
                await this.movimientosService.registrar({
                    tipo: TipoMovimiento.MOVE_INTERNO,
                    posicionId: targetPosId,
                    itemId: task.itemId,
                    lotId: task.batchId,
                    qtyPrincipal: moveQty,
                    fecha: new Date().toISOString().split('T')[0],
                    userId: userId || null,
                    observaciones: `Movimiento generado por Tarea #${task.title || task.id.substring(0, 8)}`,
                });
            } catch (err) {
                console.error('Error registrando movimiento de stock de la tarea:', err);
                // No bloqueamos el completado de la tarea si falla el movimiento, pero dejamos nota
                task.resultNotes = (task.resultNotes ? task.resultNotes + ' | ' : '') + `Aviso: El movimiento automático de stock no se completó: ${err.message}`;
            }
        }

        return this.taskRepo.save(task);
    }

    async cancelTask(taskId: string, reason?: string) {
        const task = await this.taskRepo.findOne({ where: { id: taskId } });
        if (!task) throw new NotFoundException('Tarea no encontrada');

        task.status = TaskStatus.CANCELLED;
        task.completedAt = new Date();
        if (reason) {
            task.resultNotes = `Cancelada: ${reason}`;
        }
        return this.taskRepo.save(task);
    }

    /**
     * Actualiza atributos de planificación de una tarea: prioridad, responsable, fecha límite, posición, etc.
     */
    async updateTask(id: string, dto: {
        priority?: number;
        assignedEmployeeId?: string | null;
        dueDate?: string | Date | null;
        targetPositionId?: string | null;
        sourcePositionId?: string | null;
        status?: TaskStatus | string;
        title?: string;
        description?: string;
        tiempoEstimadoMinutos?: number;
    }) {
        const task = await this.taskRepo.findOne({
            where: { id },
            relations: ['sourcePosition', 'targetPosition', 'item', 'batch', 'deposito', 'assignedEmployee']
        });
        if (!task) throw new NotFoundException('Tarea no encontrada');

        if (dto.priority !== undefined) task.priority = dto.priority;
        if (dto.assignedEmployeeId !== undefined) task.assignedEmployeeId = dto.assignedEmployeeId || null;
        if (dto.dueDate !== undefined) task.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
        if (dto.targetPositionId !== undefined) task.targetPositionId = dto.targetPositionId || null;
        if (dto.sourcePositionId !== undefined) task.sourcePositionId = dto.sourcePositionId || null;
        if (dto.status !== undefined) task.status = dto.status;
        if (dto.title !== undefined) task.title = dto.title;
        if (dto.description !== undefined) task.description = dto.description;
        if (dto.tiempoEstimadoMinutos !== undefined) task.tiempoEstimadoMinutos = dto.tiempoEstimadoMinutos;

        return this.taskRepo.save(task);
    }

    /**
     * Reordena el orden de ejecución de un conjunto de tareas para el planificador
     */
    async reorderTasks(taskIdsInOrder: string[]) {
        for (let i = 0; i < taskIdsInOrder.length; i++) {
            const id = taskIdsInOrder[i];
            await this.taskRepo.update(id, { priority: i + 1 });
        }
        return { success: true, count: taskIdsInOrder.length };
    }

    /**
     * Posiciones sin stock o con saldo cero para facilitar controles de posiciones vacías.
     */
    async getEmptyPositions(depositoId?: string) {
        const posQb = this.positionRepo.createQueryBuilder('p')
            .where('p.activo = true');

        if (depositoId) {
            posQb.andWhere('p.depositoId = :depositoId', { depositoId });
        }

        const allPositions = await posQb.getMany();
        if (allPositions.length === 0) return [];

        const positionIds = allPositions.map(p => p.id);
        const occupied = await this.stockBalanceRepo.createQueryBuilder('sb')
            .select('sb.posicionId')
            .where('sb.posicionId IN (:...positionIds)', { positionIds })
            .andWhere('sb.qtyPrincipal > 0')
            .groupBy('sb.posicionId')
            .getRawMany();

        const occupiedIds = new Set(occupied.map(o => o.sb_posicionId));
        return allPositions.filter(p => !occupiedIds.has(p.id));
    }

    /**
     * Métodos del Catálogo de Tipos de Tareas
     */
    async getTaskTypes(depositoId?: string) {
        const qb = this.taskTypeRepo.createQueryBuilder('tt')
            .where('tt.activo = true');

        if (depositoId) {
            qb.andWhere('(tt.depositoId = :depositoId OR tt.depositoId IS NULL)', { depositoId });
        }

        return qb.orderBy('tt.tipoGeneral', 'ASC')
            .addOrderBy('tt.nombre', 'ASC')
            .getMany();
    }

    async createTaskType(dto: Partial<TaskTypeCatalogEntity>) {
        if (!dto.nombre) throw new BadRequestException('El nombre del tipo de tarea es obligatorio');
        const codigo = dto.codigo || dto.nombre.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');

        const existing = await this.taskTypeRepo.findOne({ where: { codigo } });
        if (existing) throw new BadRequestException(`Ya existe un tipo de tarea con el código ${codigo}`);

        const type = this.taskTypeRepo.create({
            id: uuidv4(),
            codigo,
            nombre: dto.nombre,
            descripcion: dto.descripcion || null,
            depositoId: dto.depositoId || null,
            tipoGeneral: dto.tipoGeneral || 'EXTRAORDINARY',
            tiempoEstimadoMinutos: dto.tiempoEstimadoMinutos || 30,
            activo: true,
        });

        return this.taskTypeRepo.save(type);
    }

    async updateTaskType(id: string, dto: Partial<TaskTypeCatalogEntity>) {
        const type = await this.taskTypeRepo.findOne({ where: { id } });
        if (!type) throw new NotFoundException('Tipo de tarea no encontrado');

        Object.assign(type, dto);
        return this.taskTypeRepo.save(type);
    }

    /**
     * Sugiere posición de destino basada en la categoría del ítem
     */
    async suggestPosition(itemId: string, itemCategoria: string): Promise<string | null> {
        const positions = await this.positionRepo.find({
            where: { activo: true },
            order: { metrosCubicos: 'DESC' }
        });

        const validPositions = positions.filter(p => !p.codigo.toLowerCase().includes('entrada'));
        if (validPositions.length === 0) return null;

        const targetCat = (itemCategoria || '').trim().toLowerCase();

        const matchingCatPos = validPositions.find(p => {
            const catP = (p.categoriaPrincipal || '').trim().toLowerCase();
            const catS = (p.categoriaSecundaria || '').trim().toLowerCase();
            return (catP && catP === targetCat) || (catS && catS === targetCat);
        });

        if (matchingCatPos) return matchingCatPos.id;

        const freePos = validPositions.find(p => !p.categoriaPrincipal && !p.categoriaSecundaria);
        if (freePos) return freePos.id;

        return validPositions[0].id;
    }

    /**
     * INFORME RRHH: Reporte Integral por Sector de Depósito
     * Tareas estándar, cumplimiento del plan, métricas por colaborador y log de tareas.
     */
    async getRRHHProductivity(query: { from?: string; to?: string; depositoId?: string; employeeId?: string; sector?: string; subSector?: string }) {
        const sectorNormalized = (query.sector || query.subSector || '').toUpperCase();

        // 1. Obtener empleados del sector
        const empQb = this.employeeRepo.createQueryBuilder('e')
            .where('e.active = true')
            .andWhere("(e.primarySectorCode = 'DEPOSITO' OR e.primarySectorCode ILIKE '%DEPOSITO%')");

        if (sectorNormalized === 'HILADO' || sectorNormalized === 'DEPOSITO_HILADO') {
            empQb.andWhere("(e.subSector = 'HILADO' OR e.primarySectorCode = 'DEPOSITO_HILADO')");
        } else if (sectorNormalized === 'PACKAGING' || sectorNormalized === 'DEPOSITO_PACKAGING') {
            empQb.andWhere("(e.subSector = 'PACKAGING' OR e.primarySectorCode = 'DEPOSITO_PACKAGING')");
        }
        const sectorEmployees = await empQb.orderBy('e.legajo', 'ASC').getMany();

        // Si no hay empleados, asegurar semillas
        if (sectorEmployees.length === 0 && (!sectorNormalized || sectorNormalized === 'HILADO' || sectorNormalized === 'PACKAGING')) {
            const dilan = await this.employeeRepo.findOne({ where: { legajo: '1' } });
            if (dilan && (!sectorNormalized || sectorNormalized === 'HILADO')) sectorEmployees.push(dilan);
            const diego = await this.employeeRepo.findOne({ where: { legajo: '2' } });
            if (diego && (!sectorNormalized || sectorNormalized === 'PACKAGING')) sectorEmployees.push(diego);
        }

        // 2. Query de todas las tareas del período (para medir cumplimiento del plan)
        const qb = this.taskRepo.createQueryBuilder('task')
            .leftJoinAndSelect('task.completedByEmployee', 'completedByEmployee')
            .leftJoinAndSelect('task.assignedEmployee', 'assignedEmployee')
            .leftJoinAndSelect('task.deposito', 'deposito')
            .leftJoinAndSelect('task.taskType', 'taskType');

        if (query.depositoId) {
            qb.andWhere('task.depositoId = :depId', { depId: query.depositoId });
        } else if (sectorNormalized === 'HILADO' || sectorNormalized === 'DEPOSITO_HILADO') {
            qb.andWhere("(deposito.nombre ILIKE '%HILADO%' OR task.originSector = 'HILADO' OR assignedEmployee.subSector = 'HILADO' OR completedByEmployee.subSector = 'HILADO')");
        } else if (sectorNormalized === 'PACKAGING' || sectorNormalized === 'DEPOSITO_PACKAGING') {
            qb.andWhere("(deposito.nombre ILIKE '%PACKAGING%' OR deposito.nombre ILIKE '%INSUMO%' OR task.originSector = 'PACKAGING' OR assignedEmployee.subSector = 'PACKAGING' OR completedByEmployee.subSector = 'PACKAGING')");
        }

        if (query.employeeId) {
            qb.andWhere('(task.completedByEmployeeId = :empId OR task.assignedEmployeeId = :empId)', { empId: query.employeeId });
        }

        if (query.from) {
            qb.andWhere('(task.createdAt >= :from OR task.completedAt >= :from)', { from: new Date(query.from) });
        }
        if (query.to) {
            const toDate = new Date(query.to);
            toDate.setHours(23, 59, 59, 999);
            qb.andWhere('(task.createdAt <= :to OR task.completedAt <= :to)', { to: toDate });
        }

        const allPeriodTasks = await qb.orderBy('task.createdAt', 'DESC').getMany();

        // 3. Métricas de Cumplimiento del Plan
        const totalPlanificadas = allPeriodTasks.length;
        const completadas = allPeriodTasks.filter(t => t.status === TaskStatus.COMPLETED);
        const pendientes = allPeriodTasks.filter(t => t.status === TaskStatus.PENDING);
        const enProgreso = allPeriodTasks.filter(t => t.status === TaskStatus.IN_PROGRESS);
        const canceladas = allPeriodTasks.filter(t => t.status === TaskStatus.CANCELLED);

        const now = new Date();
        const vencidas = allPeriodTasks.filter(t => {
            if (t.status === TaskStatus.COMPLETED || t.status === TaskStatus.CANCELLED) return false;
            return t.dueDate && new Date(t.dueDate) < now;
        });

        const porcentajeCumplimientoPlan = totalPlanificadas > 0
            ? Math.round((completadas.length / totalPlanificadas) * 100)
            : 100;

        // Pedidos a clientes y entregas
        const pedidosClientes = allPeriodTasks.filter(t => t.type === TaskType.CUSTOMER_ORDER);
        const pedidosCompletados = pedidosClientes.filter(t => t.status === TaskStatus.COMPLETED);
        const pedidosPuntuales = pedidosCompletados.filter(t => {
            if (!t.dueDate || !t.completedAt) return true;
            return new Date(t.completedAt) <= new Date(t.dueDate);
        });
        const tasaPuntualidad = pedidosClientes.length > 0
            ? Math.round((pedidosPuntuales.length / Math.max(1, pedidosCompletados.length)) * 100)
            : 100;

        // Controles de inventario y discrepancias
        const controlesStock = allPeriodTasks.filter(t => t.type === TaskType.INVENTORY_CONTROL && t.status === TaskStatus.COMPLETED);
        const controlesConDiscrepancia = controlesStock.filter(t => t.resultStatus === 'DISCREPANCIA');

        // 4. Catálogo de Tareas Estándar y tiempos de ejecución
        const taskTypes = await this.taskTypeRepo.find({ where: { activo: true }, order: { tipoGeneral: 'ASC', nombre: 'ASC' } });
        const catalogStats = taskTypes.map(tt => {
            const matchingExecuted = completadas.filter(t => t.taskTypeId === tt.id || t.type === tt.tipoGeneral);
            const vecesRealizada = matchingExecuted.length;
            const totalRealMin = matchingExecuted.reduce((acc, t) => acc + (Number(t.tiempoRealMinutos) || tt.tiempoEstimadoMinutos), 0);
            const tiempoPromedioReal = vecesRealizada > 0 ? Math.round(totalRealMin / vecesRealizada) : tt.tiempoEstimadoMinutos;
            const desvioMinutos = tiempoPromedioReal - tt.tiempoEstimadoMinutos;
            const cumplimientoEstandarPct = tiempoPromedioReal > 0 ? Math.round((tt.tiempoEstimadoMinutos / tiempoPromedioReal) * 100) : 100;

            return {
                id: tt.id,
                codigo: tt.codigo,
                nombre: tt.nombre,
                tipoGeneral: tt.tipoGeneral,
                tiempoEstimadoMinutos: tt.tiempoEstimadoMinutos,
                vecesRealizada,
                tiempoPromedioReal,
                desvioMinutos,
                cumplimientoEstandarPct,
            };
        });

        // 5. Agrupación por empleado del sector
        const empMap = new Map<string, {
            employeeId: string;
            legajo: string;
            fullName: string;
            depositoNombre: string;
            subSector: string;
            totalTareasCompletadas: number;
            totalTareasAsignadas: number;
            tiempoEstimadoMinutos: number;
            tiempoRealMinutos: number;
            tareasPorTipo: Record<string, { count: number; minutos: number }>;
            ultimasTareas: any[];
            discrepanciasDetectadas: number;
        }>();

        // Inicializar empleados del sector aunque aún no tengan tareas completadas
        for (const emp of sectorEmployees) {
            empMap.set(emp.id, {
                employeeId: emp.id,
                legajo: emp.legajo,
                fullName: emp.fullName || `Legajo ${emp.legajo}`,
                depositoNombre: emp.subSector === 'HILADO' ? 'Depósito Hilado' : emp.subSector === 'PACKAGING' ? 'Depósito Packaging' : 'Depósito General',
                subSector: emp.subSector || 'GENERAL',
                totalTareasCompletadas: 0,
                totalTareasAsignadas: 0,
                tiempoEstimadoMinutos: 0,
                tiempoRealMinutos: 0,
                tareasPorTipo: {},
                ultimasTareas: [],
                discrepanciasDetectadas: 0,
            });
        }

        // Asignar tareas asignadas totales (plan individual)
        for (const t of allPeriodTasks) {
            if (t.assignedEmployeeId && empMap.has(t.assignedEmployeeId)) {
                empMap.get(t.assignedEmployeeId)!.totalTareasAsignadas += 1;
            }
        }

        let totalHorasEstimadasGlobal = 0;
        let totalHorasRealesGlobal = 0;

        for (const t of completadas) {
            const emp = t.completedByEmployee || t.assignedEmployee;
            const empId = emp ? emp.id : 'SIN_ASIGNAR';
            const legajo = emp ? emp.legajo : '-';
            const fullName = emp ? (emp.fullName || `Legajo ${emp.legajo}`) : 'Sin Operario Asignado';
            const depNombre = t.deposito ? t.deposito.nombre : (sectorNormalized === 'PACKAGING' ? 'Depósito Packaging' : 'Depósito Hilado');
            const subSec = emp?.subSector || (sectorNormalized || 'GENERAL');

            if (!empMap.has(empId)) {
                empMap.set(empId, {
                    employeeId: empId,
                    legajo,
                    fullName,
                    depositoNombre: depNombre,
                    subSector: subSec,
                    totalTareasCompletadas: 0,
                    totalTareasAsignadas: 0,
                    tiempoEstimadoMinutos: 0,
                    tiempoRealMinutos: 0,
                    tareasPorTipo: {},
                    ultimasTareas: [],
                    discrepanciasDetectadas: 0,
                });
            }

            const item = empMap.get(empId)!;
            item.totalTareasCompletadas += 1;
            const est = Number(t.tiempoEstimadoMinutos) || 30;
            const real = Number(t.tiempoRealMinutos) || est;

            item.tiempoEstimadoMinutos += est;
            item.tiempoRealMinutos += real;
            totalHorasEstimadasGlobal += est / 60;
            totalHorasRealesGlobal += real / 60;

            if (t.resultStatus === 'DISCREPANCIA') {
                item.discrepanciasDetectadas += 1;
            }

            const tipoKey = t.type || 'OTRA';
            if (!item.tareasPorTipo[tipoKey]) {
                item.tareasPorTipo[tipoKey] = { count: 0, minutos: 0 };
            }
            item.tareasPorTipo[tipoKey].count += 1;
            item.tareasPorTipo[tipoKey].minutos += real;

            if (item.ultimasTareas.length < 5) {
                item.ultimasTareas.push({
                    id: t.id,
                    title: t.title,
                    type: t.type,
                    tiempoEstimadoMinutos: est,
                    tiempoRealMinutos: real,
                    completedAt: t.completedAt,
                    resultStatus: t.resultStatus,
                    resultNotes: t.resultNotes,
                });
            }
        }

        // Jornadas y cálculo de ocupación
        let diasLaborables = 1;
        if (query.from && query.to) {
            const f1 = new Date(query.from).getTime();
            const f2 = new Date(query.to).getTime();
            const diffDays = Math.max(1, Math.round((f2 - f1) / (1000 * 60 * 60 * 24)) + 1);
            diasLaborables = Math.max(1, Math.round(diffDays * (5 / 7)));
        }
        const minutosJornadaEstimada = diasLaborables * 8 * 60;

        const ranking = Array.from(empMap.values()).map(row => {
            const eficiencia = row.tiempoRealMinutos > 0
                ? Math.round((row.tiempoEstimadoMinutos / row.tiempoRealMinutos) * 100)
                : 100;

            const ocupacion = minutosJornadaEstimada > 0
                ? Math.round((row.tiempoRealMinutos / minutosJornadaEstimada) * 100)
                : 0;

            const cumplimientoIndividual = row.totalTareasAsignadas > 0
                ? Math.round((row.totalTareasCompletadas / row.totalTareasAsignadas) * 100)
                : (row.totalTareasCompletadas > 0 ? 100 : 0);

            return {
                ...row,
                totalTareas: row.totalTareasCompletadas,
                horasEstimadas: Math.round((row.tiempoEstimadoMinutos / 60) * 10) / 10,
                horasReales: Math.round((row.tiempoRealMinutos / 60) * 10) / 10,
                porcentajeEficiencia: eficiencia,
                porcentajeOcupacionUtilidad: Math.min(150, ocupacion),
                porcentajeCumplimientoPlan: Math.min(100, cumplimientoIndividual),
            };
        });

        return {
            summary: {
                totalPlanificadas,
                totalTareas: completadas.length,
                totalPendientes: pendientes.length,
                totalEnProgreso: enProgreso.length,
                totalVencidas: vencidas.length,
                porcentajeCumplimientoPlan,
                tasaPuntualidad,
                pedidosTotales: pedidosClientes.length,
                pedidosCompletados: pedidosCompletados.length,
                controlesRealizados: controlesStock.length,
                discrepanciasDetectadas: controlesConDiscrepancia.length,
                totalHorasEstimadas: Math.round(totalHorasEstimadasGlobal * 10) / 10,
                totalHorasReales: Math.round(totalHorasRealesGlobal * 10) / 10,
                operariosActivos: ranking.filter(r => r.totalTareasCompletadas > 0).length,
                totalColaboradoresSector: ranking.length,
                eficienciaPromedio: ranking.length > 0
                    ? Math.round(ranking.reduce((acc, r) => acc + r.porcentajeEficiencia, 0) / ranking.length)
                    : 100,
            },
            catalogStats,
            ranking: ranking.sort((a, b) => b.totalTareasCompletadas - a.totalTareasCompletadas),
            tasksList: allPeriodTasks.slice(0, 50).map(t => ({
                id: t.id,
                title: t.title,
                type: t.type,
                status: t.status,
                dueDate: t.dueDate,
                startedAt: t.startedAt,
                completedAt: t.completedAt,
                tiempoEstimadoMinutos: t.tiempoEstimadoMinutos,
                tiempoRealMinutos: t.tiempoRealMinutos,
                customerOrDestination: t.customerOrDestination,
                assignedEmployee: t.assignedEmployee ? { id: t.assignedEmployee.id, fullName: t.assignedEmployee.fullName, legajo: t.assignedEmployee.legajo } : null,
                completedByEmployee: t.completedByEmployee ? { id: t.completedByEmployee.id, fullName: t.completedByEmployee.fullName, legajo: t.completedByEmployee.legajo } : null,
                resultStatus: t.resultStatus,
                resultNotes: t.resultNotes,
            })),
        };
    }
}
