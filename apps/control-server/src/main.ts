import 'reflect-metadata';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import hbs from 'hbs';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { EnvConfig } from './config/env.schema';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  // HSTS is disabled: the control-server doesn't know whether Caddy proxied a request from the
  // HTTPS (:443) or plain-HTTP (:8000, dev convenience) entry point, and HSTS applies per-host
  // regardless of port — enabling it would make browsers force-upgrade :8000 to HTTPS too after
  // a single :443 visit, breaking the documented dev endpoint. Caddy's own TLS termination on
  // :443 already provides the transport security; HSTS can be revisited if :8000 is ever removed.
  app.use(helmet({ hsts: false }));
  app.use(cookieParser());

  // /auth/v1/* and /storage/v1/* are meant to be called from arbitrary developer frontends
  // (scope.md §15 JS SDK / §21 Storage) — both authenticate via an Authorization: Bearer header,
  // never cookies, so reflecting the caller's origin without credentials is safe. /admin/*
  // (session-cookie-based) deliberately gets no CORS here, since it's only ever called
  // same-origin from the server-rendered admin console.
  app.use('/auth', cors({ origin: true }));
  app.use('/storage', cors({ origin: true }));

  app.useStaticAssets(join(__dirname, 'admin-ui', 'public'), { prefix: '/admin/static' });
  app.setBaseViewsDir(join(__dirname, 'admin-ui', 'views'));
  app.setViewEngine('hbs');
  hbs.registerPartials(join(__dirname, 'admin-ui', 'views', 'partials'));

  const config = app.get(ConfigService<EnvConfig, true>);
  const port = config.get('PORT', { infer: true });

  await app.listen(port, '0.0.0.0');
}

bootstrap();
