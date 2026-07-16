import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';

// Public marketing/info page at the reverse proxy's bare root (Caddyfile's `handle /` block) —
// unauthenticated, no guard, distinct from the `/admin` console pages it links to.
@Controller()
export class LandingController {
  @Get()
  root(@Res() res: Response): void {
    res.render('landing', {});
  }
}
