import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor() {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: process.env.JWT_SECRET || 'dev_secret_key',
        });
    }

    async validate(payload: any) {
        const sector = payload.sector || null;
        const sectors: string[] = Array.isArray(payload.sectors)
            ? payload.sectors
            : (sector ? sector.split(/[,;|]/).map((s: string) => s.trim().toUpperCase()).filter(Boolean) : []);

        return { 
            id: payload.sub, 
            username: payload.username, 
            role: payload.role,
            sector,
            sectors,
            allowedDepotIds: payload.allowedDepotIds || [],
        };
    }
}
