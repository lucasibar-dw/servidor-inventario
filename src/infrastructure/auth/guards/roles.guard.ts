import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
        const requiredRoles = this.reflector.getAllAndOverride<string[]>('roles', [
            context.getHandler(),
            context.getClass(),
        ]);
        const requiredSectors = this.reflector.getAllAndOverride<string[]>('sectors', [
            context.getHandler(),
            context.getClass(),
        ]);

        if (!requiredRoles && !requiredSectors) {
            return true;
        }

        const { user } = context.switchToHttp().getRequest();
        
        // ADMIN always passes
        if (user?.role?.toUpperCase() === 'ADMIN') {
            return true;
        }

        let hasRole = true;
        if (requiredRoles && requiredRoles.length > 0) {
            hasRole = requiredRoles.some((role) => user?.role?.toUpperCase() === role.toUpperCase());
        }

        let hasSector = true;
        if (requiredSectors && requiredSectors.length > 0) {
            const userSectors: string[] = [];
            if (Array.isArray(user?.sectors)) {
                userSectors.push(...user.sectors);
            }
            if (typeof user?.sector === 'string') {
                userSectors.push(...user.sector.split(/[,;|]/));
            }
            const normalized = userSectors.map((s: string) => s.trim().toUpperCase()).filter(Boolean);
            hasSector = requiredSectors.some((reqSector) => normalized.includes(reqSector.toUpperCase()));
        }

        return hasRole && hasSector;
    }
}
