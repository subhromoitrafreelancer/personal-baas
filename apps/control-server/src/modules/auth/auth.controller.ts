import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { z } from 'zod';
import { SignupService } from './signup.service';

const signupBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

@Controller('auth/v1')
export class AuthController {
  constructor(private readonly signupService: SignupService) {}

  @Post('signup')
  async signup(@Body() body: unknown) {
    const parsed = signupBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '));
    }

    return this.signupService.signup(parsed.data.email, parsed.data.password);
  }
}
