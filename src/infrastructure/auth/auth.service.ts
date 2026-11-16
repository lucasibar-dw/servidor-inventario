import { Injectable, Inject, OnModuleInit, UnauthorizedException, ConflictException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { IUserRepository } from '../../modules/config/domain/repositories/user.repository.interface';
import { User, UserRole } from '../../modules/config/domain/entities/user.entity';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AuthService implements OnModuleInit {
    constructor(
        @Inject('IUserRepository')
        private readonly userRepository: IUserRepository,
        private readonly jwtService: JwtService,
    ) { }

    async onModuleInit() {
        await this.seedInitialUsers();
    }

    async seedInitialUsers() {
        const usersToSeed = [
            {
                username: 'admin',
                password: 'Casa$$1646',
                role: UserRole.ADMIN,
                sector: null,
            },
            {
                username: 'compras',
                password: 'compras123',
                role: UserRole.SUPERVISOR,
                sector: 'COMPRAS,DEPOSITO,VENTAS',
            },
            {
                username: 'deposito',
                password: 'deposito123',
                role: UserRole.SUPERVISOR,
                sector: 'DEPOSITO',
            },
            {
                username: 'ventas',
                password: 'ventas123',
                role: UserRole.SUPERVISOR,
                sector: 'VENTAS',
            },
            {
                username: 'produccion',
                password: 'produccion123',
                role: UserRole.SUPERVISOR,
                sector: 'PRODUCCION,DEPOSITO,MANTENIMIENTO',
            },
            {
                username: 'desarrollo',
                password: 'desarrollo123',
                role: UserRole.SUPERVISOR,
                sector: 'DESARROLLO',
            },
        ];

        for (const u of usersToSeed) {
            try {
                const existing = await this.userRepository.findByUsername(u.username);
                if (!existing) {
                    console.log(`Seeding user ${u.username}...`);
                    const hashedPassword = await bcrypt.hash(u.password, 10);
                    const newUser = new User(
                        uuidv4(),
                        u.username,
                        hashedPassword,
                        u.role,
                        u.sector,
                        true,
                        [],
                    );
                    await this.userRepository.save(newUser);
                    console.log(`User ${u.username} seeded successfully.`);
                }
            } catch (err) {
                console.error(`Error checking/seeding user ${u.username}:`, err);
            }
        }
    }

    async validateUser(username: string, pass: string): Promise<User> {
        const user = await this.userRepository.findByUsername(username);
        if (!user) {
            throw new UnauthorizedException('Usuario no encontrado');
        }
        if (!user.isActive) {
            throw new UnauthorizedException('Usuario inactivo');
        }
        const isMatch = await bcrypt.compare(pass, user.passwordHash);
        if (!isMatch) {
            throw new UnauthorizedException('Contraseña incorrecta');
        }
        return user;
    }

    private extractSectors(sector: string | null): string[] {
        if (!sector) return [];
        return sector.split(/[,;|]/).map(s => s.trim().toUpperCase()).filter(Boolean);
    }

    async login(user: User) {
        const sectors = this.extractSectors(user.sector);
        const payload = { 
            username: user.username, 
            sub: user.id, 
            role: user.role,
            sector: user.sector,
            sectors,
            allowedDepotIds: user.allowedDepotIds,
        };
        return {
            access_token: this.jwtService.sign(payload),
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                sector: user.sector,
                sectors,
                allowedDepotIds: user.allowedDepotIds,
            },
        };
    }

    async findAllUsers(): Promise<(Omit<User, 'passwordHash'> & { sectors: string[] })[]> {
        const users = await this.userRepository.findAll();
        return users.map(u => {
            const { passwordHash, ...rest } = u;
            return {
                ...rest,
                sectors: this.extractSectors(u.sector),
            };
        });
    }

    async createUser(data: { 
        username: string; 
        password?: string; 
        role: UserRole; 
        sector?: string | null; 
        sectors?: string[];
        allowedDepotIds?: string[] 
    }) {
        const existing = await this.userRepository.findByUsername(data.username);
        if (existing) {
            throw new ConflictException('El nombre de usuario ya existe');
        }

        let sectorVal = data.sector ?? null;
        if (Array.isArray(data.sectors)) {
            sectorVal = data.sectors.join(',');
        }

        const hashedPassword = await bcrypt.hash(data.password || '123456', 10);
        const newUser = new User(
            uuidv4(),
            data.username,
            hashedPassword,
            data.role,
            sectorVal,
            true,
            data.allowedDepotIds || [],
        );

        const saved = await this.userRepository.save(newUser);
        const { passwordHash, ...rest } = saved;
        return {
            ...rest,
            sectors: this.extractSectors(saved.sector),
        };
    }

    async updateUser(id: string, data: Partial<User> & { password?: string; sectors?: string[] }) {
        const user = await this.userRepository.findById(id);
        if (!user) {
            throw new NotFoundException('Usuario no encontrado');
        }

        let hashedPassword = user.passwordHash;
        if (data.password) {
            hashedPassword = await bcrypt.hash(data.password, 10);
        }

        let sectorVal = user.sector;
        if (Array.isArray(data.sectors)) {
            sectorVal = data.sectors.join(',');
        } else if (data.sector !== undefined) {
            sectorVal = data.sector;
        }

        const updatedUser = new User(
            user.id,
            data.username ?? user.username,
            hashedPassword,
            data.role ?? user.role,
            sectorVal,
            data.isActive !== undefined ? data.isActive : user.isActive,
            data.allowedDepotIds ?? user.allowedDepotIds,
        );

        const saved = await this.userRepository.save(updatedUser);
        const { passwordHash, ...rest } = saved;
        return {
            ...rest,
            sectors: this.extractSectors(saved.sector),
        };
    }
}
