import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuditService } from './audit.service';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SECRET_KEYS = new Set(['password', 'passwordHash', 'token', 'accessToken', 'authorization']);

function safeDetails(value: unknown, depth = 0): unknown {
    if (depth > 3) return '[resumen omitido]';
    if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number') return value;
    if (typeof value === 'string') return value.length > 500 ? `${value.slice(0, 500)}…` : value;
    if (Array.isArray(value)) {
        const sample = value.slice(0, 20).map((entry) => safeDetails(entry, depth + 1));
        return value.length > 20 ? { count: value.length, sample } : sample;
    }
    if (typeof value === 'object') {
        const result: Record<string, unknown> = {};
        for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
            result[key] = SECRET_KEYS.has(key) ? '[PROTEGIDO]' : safeDetails(entry, depth + 1);
        }
        return result;
    }
    return String(value);
}

function routeContext(path: string, method: string) {
    const cleanPath = path.split('?')[0];
    const parts = cleanPath.split('/').filter(Boolean);
    const resource = parts[0] ?? 'system';
    const candidateId = parts.find((part) => /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(part)) ?? null;
    const action = method === 'POST' ? 'CREATE'
        : method === 'PUT' || method === 'PATCH' ? 'UPDATE'
            : method === 'DELETE' ? 'DELETE'
                : method;
    return { resource, resourceId: candidateId, action };
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
    constructor(private readonly auditService: AuditService) {}

    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        const request = context.switchToHttp().getRequest();
        const response = context.switchToHttp().getResponse();
        const method = String(request.method ?? '').toUpperCase();
        if (!MUTATING_METHODS.has(method) || request.path === '/auth/login') return next.handle();

        const startedAt = Date.now();
        const route = routeContext(request.originalUrl ?? request.url ?? request.path ?? '', method);
        const common = {
            method,
            path: String(request.originalUrl ?? request.url ?? '').slice(0, 500),
            ...route,
            actorId: request.user?.id ?? request.user?.sub ?? null,
            actorUsername: request.user?.username ?? null,
            actorRole: request.user?.role ?? null,
            actorSector: request.user?.sector ?? null,
            ipAddress: String(request.ip ?? request.socket?.remoteAddress ?? '').slice(0, 80) || null,
            details: safeDetails({ params: request.params, query: request.query, body: request.body }) as Record<string, unknown>,
        };

        return next.handle().pipe(tap({
            next: () => void this.auditService.record({
                ...common,
                statusCode: response.statusCode ?? 200,
                success: true,
                durationMs: Date.now() - startedAt,
                errorMessage: null,
            }),
            error: (error: any) => void this.auditService.record({
                ...common,
                statusCode: Number(error?.status ?? response.statusCode ?? 500),
                success: false,
                durationMs: Date.now() - startedAt,
                errorMessage: String(error?.message ?? 'Error no identificado').slice(0, 2000),
            }),
        }));
    }
}
