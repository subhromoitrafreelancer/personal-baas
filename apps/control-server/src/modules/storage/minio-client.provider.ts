import { ConfigService } from '@nestjs/config';
import { Client as MinioClient } from 'minio';
import { EnvConfig } from '../../config/env.schema';

export const MINIO_CLIENT = Symbol('MINIO_CLIENT');

export const minioClientProvider = {
  provide: MINIO_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService<EnvConfig, true>) =>
    new MinioClient({
      endPoint: config.get('MINIO_ENDPOINT', { infer: true }),
      port: config.get('MINIO_PORT', { infer: true }),
      useSSL: config.get('MINIO_USE_SSL', { infer: true }),
      accessKey: config.get('MINIO_ACCESS_KEY', { infer: true }),
      secretKey: config.get('MINIO_SECRET_KEY', { infer: true }),
    }),
};
