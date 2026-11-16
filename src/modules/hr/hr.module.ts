import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeesService } from './application/employees.service';
import { EmployeeEntity } from './domain/entities/employee.entity';
import { EmployeesController } from './infrastructure/employees.controller';

@Module({
    imports: [TypeOrmModule.forFeature([EmployeeEntity])],
    controllers: [EmployeesController],
    providers: [EmployeesService],
    exports: [EmployeesService],
})
export class HrModule {}
