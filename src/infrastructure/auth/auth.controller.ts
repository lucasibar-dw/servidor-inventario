import { Controller, Post, Get, Patch, Body, UseGuards, Request, Param } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('login')
    async login(@Body() body: any) {
        const user = await this.authService.validateUser(body.username, body.password);
        return this.authService.login(user);
    }

    @UseGuards(JwtAuthGuard)
    @Get('me')
    getMe(@Request() req: any) {
        return req.user;
    }

    @UseGuards(JwtAuthGuard)
    @Patch('me/password')
    async changeMyPassword(@Request() req: any, @Body() body: { password: string }) {
        return this.authService.updateUser(req.user.id || req.user.sub, { password: body.password });
    }

    // -- User Management (Admin Only) --

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    @Get('users')
    async getUsers() {
        return this.authService.findAllUsers();
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    @Post('users')
    async createUser(@Body() body: any) {
        return this.authService.createUser(body);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    @Patch('users/:id')
    async updateUser(@Param('id') id: string, @Body() body: any) {
        return this.authService.updateUser(id, body);
    }
}
