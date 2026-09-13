import 'reflect-metadata';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { WsAdapter } from '@nestjs/platform-ws';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import hbs from 'hbs';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { EnvConfig } from './config/env.schema';
import { sameOriginGuard } from './common/same-origin.middleware';

async function bootstrap() {
  // Nest's automatic body parser (bodyParser: true, the default) caps JSON/urlencoded bodies at
  // Express's own 100kb default — silently rejecting a request with "request entity too large"
  // before it ever reaches application code. Phase 20's /internal/pdf/render needs to accept an
  // HTML document up to PDF_MAX_HTML_BYTES (2MB default) in a JSON body, so the parser itself
  // needs a generous outer limit; PdfService.render() still enforces the real, precise
  // PDF_MAX_HTML_BYTES limit afterward with a proper error message and pdf.render_requests row —
  // this is just the safety net that stops something absurd from reaching that check at all.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.useLogger(app.get(Logger));
  // HSTS is disabled: the control-server doesn't know whether Caddy proxied a request from the
  // HTTPS (:443) or plain-HTTP (:8000, dev convenience) entry point, and HSTS applies per-host
  // regardless of port — enabling it would make browsers force-upgrade :8000 to HTTPS too after
  // a single :443 visit, breaking the documented dev endpoint. Caddy's own TLS termination on
  // :443 already provides the transport security; HSTS can be revisited if :8000 is ever removed.
  app.use(helmet({ hsts: false }));
  app.use(cookieParser());
  // ws-based adapter (not socket.io) for the Phase 8 realtime gateway — no namespace/engine.io
  // overhead, and it attaches to this same HTTP server/port rather than opening a new one.
  app.useWebSocketAdapter(new WsAdapter(app));

  // /auth/v1/*, /storage/v1/* and /functions/v1/* are meant to be called from arbitrary
  // developer frontends (scope.md §15 JS SDK / §21 Storage / §26 Functions) — all three
  // authenticate via an Authorization: Bearer header, never cookies, so reflecting the caller's
  // origin without credentials is safe. /admin/* (session-cookie-based) deliberately gets no CORS
  // here, since it's only ever called same-origin from the server-rendered admin console.
  app.use('/auth', cors({ origin: true }));
  app.use('/storage', cors({ origin: true }));
  app.use('/functions', cors({ origin: true }));
  // No CORS is configured for /admin (above) — it's cookie-authenticated and same-origin-only.
  // sameOriginGuard rejects unsafe methods that don't carry a same-origin signal, as an
  // application-level CSRF control that doesn't depend solely on sameSite cookie behavior.
  app.use('/admin', sameOriginGuard);

  app.useStaticAssets(join(__dirname, 'admin-ui', 'public'), { prefix: '/admin/static' });
  app.setBaseViewsDir(join(__dirname, 'admin-ui', 'views'));
  app.setViewEngine('hbs');
  hbs.registerPartials(join(__dirname, 'admin-ui', 'views', 'partials'));

  const config = app.get(ConfigService<EnvConfig, true>);
  const port = config.get('PORT', { infer: true });

  await app.listen(port, '0.0.0.0');
}

bootstrap();
