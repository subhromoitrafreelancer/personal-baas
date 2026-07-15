import { BadRequestException, Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { z } from 'zod';
import { AccessTokenGuard } from './access-token.guard';
import { LoginService } from './login.service';
import { PasswordResetService } from './password-reset.service';
import { RefreshService } from './refresh.service';
import { SelfServiceService } from './self-service.service';
import { SignupService } from './signup.service';
import { RequestWithUser } from './auth.types';

const signupBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const tokenBodySchema = z.object({
  refreshToken: z.string().min(1),
});

const changePasswordBodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

const passwordResetBodySchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

@Controller('auth/v1')
export class AuthController {
  constructor(
    private readonly signupService: SignupService,
    private readonly loginService: LoginService,
    private readonly refreshService: RefreshService,
    private readonly selfService: SelfServiceService,
    private readonly passwordResetService: PasswordResetService,
  ) {}

  @Post('signup')
  async signup(@Body() body: unknown, @Req() req: Request) {
    const parsed = signupBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '));
    }

    return this.signupService.signup(
      parsed.data.email,
      parsed.data.password,
      req.ip ?? null,
      req.headers['user-agent'] ?? null,
    );
  }

  @Post('login')
  async login(@Body() body: unknown, @Req() req: Request) {
    const parsed = loginBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '));
    }

    return this.loginService.login(
      parsed.data.email,
      parsed.data.password,
      req.ip ?? null,
      req.headers['user-agent'] ?? null,
    );
  }

  @Post('token')
  async token(@Body() body: unknown, @Req() req: Request) {
    const parsed = tokenBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '));
    }

    return this.refreshService.refresh(
      parsed.data.refreshToken,
      req.ip ?? null,
      req.headers['user-agent'] ?? null,
    );
  }

  @Get('user')
  @UseGuards(AccessTokenGuard)
  async getUser(@Req() req: RequestWithUser) {
    return this.selfService.getCurrentUser(req.user!.sub);
  }

  @Post('user/password')
  @UseGuards(AccessTokenGuard)
  @HttpCode(204)
  async changePassword(@Body() body: unknown, @Req() req: RequestWithUser): Promise<void> {
    const parsed = changePasswordBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '));
    }

    await this.selfService.changePassword(
      req.user!.sub,
      parsed.data.currentPassword,
      parsed.data.newPassword,
      req.ip ?? null,
      req.headers['user-agent'] ?? null,
    );
  }

  @Post('logout')
  @UseGuards(AccessTokenGuard)
  @HttpCode(204)
  async logout(@Req() req: RequestWithUser): Promise<void> {
    await this.selfService.logout(
      req.user!.sub,
      req.user!.sessionId,
      req.ip ?? null,
      req.headers['user-agent'] ?? null,
    );
  }

  // Completes the flow an admin starts via `POST /admin/v1/users/:id/reset-token` — deliberately
  // unauthenticated, since the token itself is the credential (scope.md Phase 6 #6/#3).
  @Post('password-reset')
  @HttpCode(204)
  async resetPassword(@Body() body: unknown, @Req() req: Request): Promise<void> {
    const parsed = passwordResetBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '));
    }

    await this.passwordResetService.resetPassword(
      parsed.data.token,
      parsed.data.newPassword,
      req.ip ?? null,
      req.headers['user-agent'] ?? null,
    );
  }
}
