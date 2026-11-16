import { Controller, Get, Post, Patch, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../../infrastructure/auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../../infrastructure/auth/decorators/current-user.decorator';
import { TasksService, CreateTaskDto, CompleteTaskDto } from '../../application/services/tasks.service';

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
    constructor(private readonly tasksService: TasksService) {}

    @Get()
    findAll(
        @Query('depositoId') depositoId?: string,
        @Query('status') status?: string,
        @Query('type') type?: string,
        @Query('employeeId') employeeId?: string,
        @Query('q') q?: string,
        @Query('from') from?: string,
        @Query('to') to?: string,
    ) {
        return this.tasksService.findAll({ depositoId, status, type, employeeId, q, from, to });
    }

    @Get('pending')
    findPending(@Query('depositoId') depositoId?: string) {
        return this.tasksService.findPending(depositoId);
    }

    @Get('types')
    getTaskTypes(@Query('depositoId') depositoId?: string) {
        return this.tasksService.getTaskTypes(depositoId);
    }

    @Post('types')
    createTaskType(@Body() dto: any) {
        return this.tasksService.createTaskType(dto);
    }

    @Put('types/:id')
    updateTaskType(@Param('id') id: string, @Body() dto: any) {
        return this.tasksService.updateTaskType(id, dto);
    }

    @Get('empty-positions')
    getEmptyPositions(@Query('depositoId') depositoId?: string) {
        return this.tasksService.getEmptyPositions(depositoId);
    }

    @Get('productivity-rrhh')
    getProductivityRRHH(
        @Query('from') from?: string,
        @Query('to') to?: string,
        @Query('depositoId') depositoId?: string,
        @Query('employeeId') employeeId?: string,
        @Query('sector') sector?: string,
        @Query('subSector') subSector?: string,
    ) {
        return this.tasksService.getRRHHProductivity({ from, to, depositoId, employeeId, sector, subSector });
    }

    @Get('suggest-position')
    suggestPosition(@Query('itemId') itemId?: string, @Query('categoria') categoria?: string) {
        return this.tasksService.suggestPosition(itemId || '', categoria || '');
    }

    @Post('reorder')
    reorderTasks(@Body('taskIds') taskIds: string[]) {
        return this.tasksService.reorderTasks(taskIds || []);
    }

    @Patch(':id')
    updateTask(@Param('id') id: string, @Body() dto: any) {
        return this.tasksService.updateTask(id, dto);
    }

    @Post()
    create(@Body() dto: CreateTaskDto) {
        return this.tasksService.createTask(dto);
    }

    @Patch(':id/start')
    start(
        @Param('id') id: string,
        @Body('employeeId') employeeId?: string,
    ) {
        return this.tasksService.startTask(id, employeeId);
    }

    @Patch(':id/complete')
    complete(
        @Param('id') id: string,
        @Body() dto: CompleteTaskDto,
        @CurrentUser() user: { id: string },
    ) {
        return this.tasksService.completeTask(id, dto, user.id);
    }

    @Patch(':id/cancel')
    cancel(
        @Param('id') id: string,
        @Body('reason') reason?: string,
    ) {
        return this.tasksService.cancelTask(id, reason);
    }
}
