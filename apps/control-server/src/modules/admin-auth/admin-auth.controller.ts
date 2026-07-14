import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { z } from 'zod';
import { EnvConfig } from '../../config/env.schema';
import { AdminAuthService } from './admin-auth.service';
import { AdminSessionGuard } from './admin-session.guard';
import { ADMIN_SESSION_COOKIE, ADMIN_SESSION_TTL_SECONDS } from './constants';

const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

@Controller('admin')
export class AdminAuthController {
  constructor(
    private readonly adminAuth: AdminAuthService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  @Get('login')
  async loginPage(@Req() req: Request, @Res() res: Response): Promise<void> {
    const token = req.cookies?.[ADMIN_SESSION_COOKIE];
    if (typeof token === 'string' && (await this.adminAuth.verifySessionToken(token))) {
      res.redirect('/admin');
      return;
    }
    res.render('login', { error: null });
  }

  @Post('login')
  async login(@Body() body: unknown, @Res() res: Response): Promise<void> {
    const parsed = loginBodySchema.safeParse(body);
    if (!parsed.success) {
      res.status(400).render('login', { error: 'Enter a valid email and password.' });
      return;
    }

    const admin = await this.adminAuth.verifyCredentials(parsed.data.email, parsed.data.password);
    if (!admin) {
      res.status(401).render('login', { error: 'Invalid email or password.' });
      return;
    }

    const token = await this.adminAuth.createSessionToken(admin);
    res.cookie(ADMIN_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
      maxAge: ADMIN_SESSION_TTL_SECONDS * 1000,
    });
    res.redirect('/admin');
  }

  @Post('logout')
  @UseGuards(AdminSessionGuard)
  logout(@Res() res: Response): void {
    res.clearCookie(ADMIN_SESSION_COOKIE);
    res.redirect('/admin/login');
  }
}
