export enum TaskStatus {
    PENDING = 'PENDING',
    IN_PROGRESS = 'IN_PROGRESS',
    COMPLETED = 'COMPLETED',
    CANCELLED = 'CANCELLED',
}

export enum TaskType {
    PUTAWAY = 'PUTAWAY', // From Input to Storage
    PICKING = 'PICKING', // From Storage to Picking/Output
    REPLENISHMENT = 'REPLENISHMENT', // Internal movement
    CUSTOMER_ORDER = 'CUSTOMER_ORDER', // Pedido para cliente/planta (Catamarca, San Martín, etc.)
    INVENTORY_CONTROL = 'INVENTORY_CONTROL', // Chequeo/Control de stock (goma, vacíos, proveedor, color)
    EXTRAORDINARY = 'EXTRAORDINARY', // Tarea extraordinaria/operativa
}

export class TaskEntity {
    constructor(
        public readonly id: string,
        public readonly type: TaskType,
        public readonly itemId: string | null,
        public readonly batchId: string | null,
        public readonly sourcePositionId: string | null,
        public readonly targetPositionId: string | null,
        public readonly qty: number | null,
        public status: TaskStatus,
        public readonly priority: number, // 1: Urgente/Alta, 2: Media, 3: Baja
        public assignedUserId: string | null,
        public readonly createdAt: Date,
        public completedAt?: Date | null,
        public depositoId?: string | null,
        public title?: string | null,
        public description?: string | null,
        public customerOrDestination?: string | null,
        public dueDate?: Date | null,
        public originSector?: string | null,
        public controlType?: string | null,
        public controlFilter?: string | null,
        public startedAt?: Date | null,
        public tiempoEstimadoMinutos?: number | null,
        public tiempoRealMinutos?: number | null,
        public assignedEmployeeId?: string | null,
        public completedByEmployeeId?: string | null,
        public resultStatus?: string | null,
        public resultNotes?: string | null,
    ) {}
}
