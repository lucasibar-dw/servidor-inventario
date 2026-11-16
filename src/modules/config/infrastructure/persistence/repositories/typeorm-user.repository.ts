import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IUserRepository } from '../../../domain/repositories/user.repository.interface';
import { User, UserRole } from '../../../domain/entities/user.entity';
import { UserEntity } from '../entities/user.entity';

@Injectable()
export class TypeOrmUserRepository implements IUserRepository {
    constructor(
        @InjectRepository(UserEntity)
        private readonly repository: Repository<UserEntity>,
    ) { }

    async save(user: User): Promise<User> {
        const entity = new UserEntity();
        entity.id = user.id;
        entity.username = user.username;
        entity.passwordHash = user.passwordHash;
        entity.role = user.role;
        entity.sector = user.sector;
        entity.isActive = user.isActive;
        entity.allowedDepotIds = user.allowedDepotIds;

        const saved = await this.repository.save(entity);
        return this.toDomain(saved);
    }

    async findByUsername(username: string): Promise<User | null> {
        const entity = await this.repository.findOne({ where: { username } });
        return entity ? this.toDomain(entity) : null;
    }

    async findById(id: string): Promise<User | null> {
        const entity = await this.repository.findOne({ where: { id } });
        return entity ? this.toDomain(entity) : null;
    }

    async findAll(): Promise<User[]> {
        const entities = await this.repository.find();
        return entities.map(e => this.toDomain(e));
    }

    private toDomain(entity: UserEntity): User {
        return new User(
            entity.id,
            entity.username,
            entity.passwordHash,
            entity.role as UserRole,
            entity.sector || null,
            entity.isActive,
            entity.allowedDepotIds || [],
        );
    }
}
