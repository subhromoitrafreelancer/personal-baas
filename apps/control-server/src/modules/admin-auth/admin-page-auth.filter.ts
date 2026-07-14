import { ArgumentsHost, Catch, ExceptionFilter, UnauthorizedException } from '@nestjs/common';
import { Response } from 'express';

// Applied to server-rendered /admin/* page controllers (not the /admin/v1 JSON API) so an
// expired or missing session redirects to the login page instead of returning raw JSON 401s.
@Catch(UnauthorizedException)
export class AdminPageAuthFilter implements ExceptionFilter {
  catch(_exception: UnauthorizedException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.redirect('/admin/login');
  }
}
