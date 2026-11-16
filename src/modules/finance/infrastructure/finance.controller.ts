import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../infrastructure/auth/guards/jwt-auth.guard';
import { FinanceService } from '../application/finance.service';

@UseGuards(JwtAuthGuard)
@Controller('finance')
export class FinanceController {
    constructor(private readonly financeService: FinanceService) {}

    @Get('cockpit')
    getCockpit(
        @Query('tipoCambio') tipoCambio?: string,
        @Query('depositoId') depositoId?: string,
        @Query('categoryId') categoryId?: string,
    ) {
        return this.financeService.getCockpit({
            tipoCambio: tipoCambio ? Number(tipoCambio) : undefined,
            depositoId,
            categoryId,
        });
    }

    @Get('categories-cost-summary')
    getCategoriesCostSummary() {
        return this.financeService.getCategoriesCostSummary();
    }
}
