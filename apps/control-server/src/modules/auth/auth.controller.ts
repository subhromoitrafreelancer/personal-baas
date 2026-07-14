import { BadRequestException, Body, Controller, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { z } from 'zod';
import { LoginService } from './login.service';
import { RefreshService } from './refresh.service';
import { SignupService } from './signup.service';

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

@Controller('auth/v1')
export class AuthController {
  constructor(
    private readonly signupService: SignupService,
    private readonly loginService: LoginService,
    private readonly refreshService: RefreshService,
  ) {}

  @Post('signup')
  async signup(@Body() body: unknown) {
    const parsed = signupBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '));
    }

    return this.signupService.signup(parsed.data.email, parsed.data.password);
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
  async token(@Body() body: unknown) {
    const parsed = tokenBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '));
    }

    return this.refreshService.refresh(parsed.data.refreshToken);
  }
}
