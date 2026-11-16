import { BadRequestException } from '@nestjs/common';
import { MovimientosService } from './movimientos.service';
import { MovimientoEntity, MovimientoStatus, TipoMovimiento } from '../../infrastructure/persistence/entities/movimiento.entity';
import { MovimientoSubscriber } from '../../../../infrastructure/persistence/subscribers/movimiento.subscriber';
import { StockBalanceEntity } from '../../infrastructure/persistence/entities/stock-balance.entity';
import { PositionEntity } from '../../infrastructure/persistence/entities/depot.entity';
import { DocumentoEntity, DocumentoStatus } from '../../infrastructure/persistence/entities/documento.entity';

describe('MovimientosService stock integrity', () => {
    const baseDto = {
        tipo: TipoMovimiento.REMITO_SALIDA,
        depositoId: '11111111-1111-1111-1111-111111111111',
        posicionId: '22222222-2222-2222-2222-222222222222',
        itemId: '33333333-3333-3333-3333-333333333333',
        lotId: '44444444-4444-4444-4444-444444444444',
        qtyPrincipal: 6,
        fecha: '2026-09-03',
    };

    function setup(available: number) {
        const movementRepository = {
            create: jest.fn((value) => value),
            save: jest.fn(async (value) => ({ id: 'movement-id', ...value })),
        };
        const manager = {
            query: jest.fn(async () => [{ pg_advisory_xact_lock: null }]),
            findOne: jest.fn()
                .mockResolvedValueOnce({ id: baseDto.posicionId, depositoId: baseDto.depositoId })
                .mockResolvedValueOnce({ qtyPrincipal: available, qtySecundaria: 0 }),
            getRepository: jest.fn(() => movementRepository),
        };
        const dataSource = { transaction: jest.fn() };
        const service = new MovimientosService(movementRepository as never, dataSource as never);
        return { service, manager, movementRepository };
    }

    it('serializes the stock key and rejects a subtraction above the available balance', async () => {
        const { service, manager, movementRepository } = setup(5);

        await expect(service.registrar(baseDto, manager as never)).rejects.toBeInstanceOf(BadRequestException);

        expect(manager.query).toHaveBeenCalledWith(
            'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
            [`stock:${baseDto.posicionId}`, `${baseDto.itemId}:${baseDto.lotId}`],
        );
        expect(movementRepository.save).not.toHaveBeenCalled();
    });

    it('registers the movement after locking and validating sufficient stock', async () => {
        const { service, manager, movementRepository } = setup(10);

        await service.registrar(baseDto, manager as never);

        expect(manager.query).toHaveBeenCalledTimes(1);
        expect(movementRepository.save).toHaveBeenCalledWith(expect.objectContaining({
            tipo: TipoMovimiento.REMITO_SALIDA,
            qtyPrincipal: 6,
        }));
    });

    it('cancels without joining nullable relations in the locked query and records the compensation', async () => {
        const original = { ...baseDto, id: 'original', status: MovimientoStatus.ACTIVO };
        const repository = {
            findOne: jest.fn(async (options) => {
                if (options.relations) throw new Error('FOR UPDATE cannot be applied to the nullable side of an outer join');
                return original;
            }),
            create: jest.fn((value) => value),
            save: jest.fn(async (value) => value),
        };
        const manager = {
            getRepository: jest.fn((entity) => entity === MovimientoEntity ? repository : { find: jest.fn(async () => []) }),
            findOne: jest.fn(async () => ({ id: baseDto.posicionId, depositoId: baseDto.depositoId })),
            query: jest.fn(async () => []),
        };
        const dataSource = { transaction: jest.fn(async (callback) => callback(manager)) };
        const service = new MovimientosService(repository as never, dataSource as never);

        const compensation = await service.cancelar(original.id);

        expect(dataSource.transaction).toHaveBeenCalledTimes(1);
        expect(repository.findOne).toHaveBeenCalledWith(expect.objectContaining({ lock: { mode: 'pessimistic_write' } }));
        expect(original.status).toBe(MovimientoStatus.ANULADO);
        expect(compensation).toEqual(expect.objectContaining({
            tipo: TipoMovimiento.ANULACION_SALIDA,
            posicionId: baseDto.posicionId,
            itemId: baseDto.itemId,
            lotId: baseDto.lotId,
            qtyPrincipal: baseDto.qtyPrincipal,
            status: MovimientoStatus.ACTIVO,
        }));
    });

    it.each([
        [TipoMovimiento.REMITO_ENTRADA, 4, 2, false],
        [TipoMovimiento.REMITO_SALIDA, 16, 6, false],
        [TipoMovimiento.AJUSTE_SUMA, 4, 2, false],
        [TipoMovimiento.AJUSTE_RESTA, 16, 6, false],
        [TipoMovimiento.REMITO_ENTRADA, 4, 2, true],
    ])('reverses %s in movements, both stock quantities and document status (other active line: %s)', async (tipo, principal, secondary, otherActiveLine) => {
        const original = { ...baseDto, tipo, id: 'original', documentoId: 'doc', qtySecundaria: 2, status: MovimientoStatus.ACTIVO };
        const movements: any[] = [original];
        if (otherActiveLine) movements.push({ ...original, id: 'other-line' });
        const balance = { qtyPrincipal: 10, qtySecundaria: 4 };
        const docRepo = { update: jest.fn() };
        const subscriber = new MovimientoSubscriber();
        const repository = {
            findOne: jest.fn(async () => original),
            create: jest.fn((value) => value),
            save: jest.fn(async (value) => {
                if (!value.id) {
                    value.id = 'compensation';
                    movements.push(value);
                    await subscriber.afterInsert({ entity: value, manager } as never);
                }
                return value;
            }),
            count: jest.fn(async ({ where }) => movements.filter(m =>
                m.documentoId === where.documentoId && m.status === where.status &&
                (!where.tipo || where.tipo.value.includes(m.tipo)),
            ).length),
        };
        const manager = {
            getRepository: jest.fn((entity) => entity === MovimientoEntity ? repository : entity === DocumentoEntity ? docRepo : { find: async () => [] }),
            findOne: jest.fn(async (entity) => entity === StockBalanceEntity ? balance : entity === PositionEntity ? { depositoId: baseDto.depositoId } : { supplierId: null }),
            query: jest.fn(async () => []),
            save: jest.fn(async (_entity, value) => value),
        };
        const service = new MovimientosService(repository as never, { transaction: async (callback) => callback(manager) } as never);

        await service.cancelar(original.id);

        expect(balance).toEqual({ qtyPrincipal: principal, qtySecundaria: secondary });
        expect(manager.save).toHaveBeenCalledWith(StockBalanceEntity, balance);
        expect(movements).toHaveLength(otherActiveLine ? 3 : 2);
        expect(original.status).toBe(MovimientoStatus.ANULADO);
        if (otherActiveLine) expect(docRepo.update).not.toHaveBeenCalled();
        else expect(docRepo.update).toHaveBeenCalledWith('doc', { status: DocumentoStatus.ANULADO });
    });

    it.each([TipoMovimiento.ENTREGA_PRODUCCION, TipoMovimiento.INGRESO_PRODUCCION, TipoMovimiento.DEVOLUCION_LINEA])(
        'rejects direct cancellation of %s before changing any data', async (tipo) => {
            const repository = {
                findOne: jest.fn(async () => ({ tipo, status: MovimientoStatus.ACTIVO })),
                save: jest.fn(),
            };
            const service = new MovimientosService(repository as never, {} as never);
            await expect(service.cancelar('id', { getRepository: () => repository } as never)).rejects.toThrow('registros de origen');
            expect(repository.save).not.toHaveBeenCalled();
        },
    );

    it('rejects ANULACION_ENTRADA with a clear descriptive message when stock is not in entrance position', async () => {
        const dto = {
            tipo: TipoMovimiento.ANULACION_ENTRADA,
            depositoId: '11111111-1111-1111-1111-111111111111',
            posicionId: '22222222-2222-2222-2222-222222222222',
            itemId: '33333333-3333-3333-3333-333333333333',
            lotId: '44444444-4444-4444-4444-444444444444',
            qtyPrincipal: 50,
            fecha: '2026-09-10',
        };
        const manager = {
            query: jest.fn(async () => []),
            findOne: jest.fn()
                .mockResolvedValueOnce({ id: dto.posicionId, depositoId: dto.depositoId, codigo: 'ENTRADA' }) // position
                .mockResolvedValueOnce({ qtyPrincipal: 0, qtySecundaria: 0 }) // balance
                .mockResolvedValueOnce({ id: dto.itemId, descripcion: 'Hilado Algodón 24/1' }) // item
                .mockResolvedValueOnce({ id: dto.lotId, lotNumber: 'LOTE-100' }), // batch
            getRepository: jest.fn(() => ({ create: jest.fn(), save: jest.fn() })),
        };
        const service = new MovimientosService({} as never, {} as never);

        await expect(service.registrar(dto, manager as never)).rejects.toThrow(
            'No se puede anular el remito de entrada: el material "Hilado Algodón 24/1" (Lote: LOTE-100) ya no se encuentra en la posición "ENTRADA"',
        );
    });
});
