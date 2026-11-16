import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

@Injectable()
export class SafePayloadPipe implements PipeTransform {
    transform(value: unknown): unknown {
        this.inspect(value, 'body', 0);
        return value;
    }

    private inspect(value: unknown, path: string, depth: number): void {
        if (depth > 15) throw new BadRequestException(`La estructura enviada es demasiado profunda en ${path}.`);
        if (typeof value === 'string' && value.length > 1_000_000) {
            throw new BadRequestException(`El campo ${path} supera el tamaño permitido.`);
        }
        if (typeof value === 'number' && !Number.isFinite(value)) {
            throw new BadRequestException(`El campo ${path} debe ser un número válido.`);
        }
        if (Array.isArray(value)) {
            if (value.length > 20_000) throw new BadRequestException(`La lista ${path} supera el máximo permitido.`);
            value.forEach((entry, index) => this.inspect(entry, `${path}[${index}]`, depth + 1));
            return;
        }
        if (!value || typeof value !== 'object') return;
        for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
            if (FORBIDDEN_KEYS.has(key)) throw new BadRequestException(`El campo ${path}.${key} no está permitido.`);
            this.inspect(entry, `${path}.${key}`, depth + 1);
        }
    }
}
