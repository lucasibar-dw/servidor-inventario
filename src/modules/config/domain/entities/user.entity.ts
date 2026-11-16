
export enum UserRole {
    ADMIN = 'ADMIN',
    SUPERVISOR = 'SUPERVISOR',
    OPERARIO = 'OPERARIO',
}

export enum UserSector {
    DEPOSITO = 'DEPOSITO',
    COMPRAS = 'COMPRAS',
    MANTENIMIENTO = 'MANTENIMIENTO',
    PRODUCCION = 'PRODUCCION',
    VENTAS = 'VENTAS',
    FINANZAS = 'FINANZAS',
    RRHH = 'RRHH',
    DESARROLLO = 'DESARROLLO',
    CALIDAD = 'CALIDAD',
}

export class User {
    constructor(
        public readonly id: string,
        public readonly username: string,
        public readonly passwordHash: string,
        public readonly role: UserRole,
        public readonly sector: string | null,
        public readonly isActive: boolean,
        public readonly allowedDepotIds: string[] = [],
    ) { }
}
