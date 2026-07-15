import 'reflect-metadata';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import hbs from 'hbs';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { EnvConfig } from './config/env.schema';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.use(cookieParser());

  app.useStaticAssets(join(__dirname, 'admin-ui', 'public'), { prefix: '/admin/static' });
  app.setBaseViewsDir(join(__dirname, 'admin-ui', 'views'));
  app.setViewEngine('hbs');
  hbs.registerPartials(join(__dirname, 'admin-ui', 'views', 'partials'));

  const config = app.get(ConfigService<EnvConfig, true>);
  const port = config.get('PORT', { infer: true });

  await app.listen(port, '0.0.0.0');
}

bootstrap();
