import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { z } from 'zod';
import { AccessTokenGuard } from '../access-token.guard';
import { AuthJwtService } from '../auth-jwt.service';
import { AuthUsersRepository } from '../auth-users.repository';
import { RequestWithUser } from '../auth.types';
import { LoginService } from '../login.service';
import { AUTH_THROTTLE } from '../../rate-limit/route-throttles';
import { ProjectsService } from '../../projects/projects.service';
import { MfaEnrollmentGuard, RequestWithMfaSubject } from './mfa-enrollment.guard';
import { MfaService } from './mfa.service';

const verifyEnrollmentBodySchema = z.object({
  code: z.string().min(1),
});

const verifyBodySchema = z.object({
  mfaToken: z.string().min(1),
  code: z.string().min(1),
});

const disableBodySchema = z.object({
  password: z.string().min(1),
  code: z.string().min(1),
});

@Controller('auth/v1/mfa')
export class MfaController {
  constructor(
    private readonly mfa: MfaService,
    private readonly jwt: AuthJwtService,
    private readonly usersRepo: AuthUsersRepository,
    private readonly projects: ProjectsService,
    private readonly loginService: LoginService,
  ) {}

  @Post('enroll')
  @UseGuards(MfaEnrollmentGuard)
  async enroll(@Req() req: RequestWithMfaSubject) {
    const { userId, projectId } = req.mfaSubject!;
    const [user, project] = await Promise.all([
      this.usersRepo.findById(userId),
      this.projects.getById(projectId),
    ]);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    // Issuer is that project's own name field (scope.md §33 point 10), not a platform-wide
    // constant — lets a user tell apart MFA entries for different downstream apps built on this
    // same multi-project platform.
    return this.mfa.enroll(user.id, user.email, project.name);
  }

  @Post('verify-enrollment')
  @UseGuards(MfaEnrollmentGuard)
  @Throttle(AUTH_THROTTLE)
  async verifyEnrollment(@Body() body: unknown, @Req() req: RequestWithMfaSubject) {
    const parsed = verifyEnrollmentBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '));
    }

    const { userId, projectId, tokenType } = req.mfaSubject!;
    const result = await this.mfa.verifyEnrollment(userId, parsed.data.code);

    // Forced mid-login enrollment (scope.md §33 point 5c) — completing it stands in for the
    // login that was interrupted, so it issues real tokens immediately, no second /mfa/verify
    // round-trip. A voluntary self-service enrollment (tokenType === 'access') already has a
    // live session; nothing more to issue.
    if (tokenType === 'mfa-pending') {
      const [user, project] = await Promise.all([
        this.usersRepo.findById(userId),
        this.projects.getById(projectId),
      ]);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }
      const session = await this.loginService.issueSession(
        user,
        project,
        req.ip ?? null,
        req.headers['user-agent'] ?? null,
      );
      return { ...session, backupCodes: result.backupCodes };
    }

    return result;
  }

  // Public — the mfaToken itself is the credential, same "unauthenticated because the token is
  // the proof" reasoning as the existing /auth/v1/password-reset confirm endpoint. Passed in the
  // body (not a Bearer header) since the caller has nothing else to authenticate with at this
  // exact point in the login handshake.
  @Post('verify')
  @Throttle(AUTH_THROTTLE)
  async verify(@Body() body: unknown, @Req() req: Request) {
    const parsed = verifyBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '));
    }

    const claims = await this.jwt.verifyMfaToken(parsed.data.mfaToken);
    if (!claims) {
      throw new UnauthorizedException('Invalid or expired MFA token');
    }

    const ok = await this.mfa.verifyLogin(claims.sub, parsed.data.code);
    if (!ok) {
      throw new UnauthorizedException('Invalid code');
    }

    const [user, project] = await Promise.all([
      this.usersRepo.findById(claims.sub),
      this.projects.getById(claims.projectId),
    ]);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.loginService.issueSession(
      user,
      project,
      req.ip ?? null,
      req.headers['user-agent'] ?? null,
    );
  }

  @Delete()
  @UseGuards(AccessTokenGuard)
  async disable(@Body() body: unknown, @Req() req: RequestWithUser) {
    const parsed = disableBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '));
    }
    await this.mfa.selfDisable(req.user!.sub, parsed.data.password, parsed.data.code);
    return { disabled: true };
  }
}
