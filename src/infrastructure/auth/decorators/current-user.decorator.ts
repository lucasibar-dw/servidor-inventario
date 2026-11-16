import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Extrae el usuario autenticado del request (puesto por JwtStrategy.validate).
 * Uso: @CurrentUser() user: { userId: string; username: string; role: string }
 */
export const CurrentUser = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext) => {
        const request = ctx.switchToHttp().getRequest();
        return request.user as { id: string; username: string; role: string };
    },
);
