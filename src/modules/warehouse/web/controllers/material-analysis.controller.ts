import { BadRequestException, Body, Controller, Get, Param, Patch, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../../infrastructure/auth/guards/jwt-auth.guard';
import { MaterialAnalysisService, MaterialReviewStatus } from '../../application/services/material-analysis.service';

@UseGuards(JwtAuthGuard)
@Controller('warehouse/material-analysis')
export class MaterialAnalysisController {
    constructor(private readonly service: MaterialAnalysisService) {}

    @Get()
    getAnalysis(@Query('months') months?: string) {
        return this.service.getMaterialAnalysis(Number(months ?? 6));
    }

    @Patch(':itemId/review')
    updateReview(
        @Param('itemId') itemId: string,
        @Body() body: { status: MaterialReviewStatus; notes?: string | null },
        @Request() request: any,
    ) {
        if (!Object.values(MaterialReviewStatus).includes(body.status)) {
            throw new BadRequestException('Estado de revisión inválido.');
        }
        return this.service.updateReview(
            itemId,
            body,
            request.user?.username ?? request.user?.sub ?? request.user?.id ?? null,
        );
    }
}
