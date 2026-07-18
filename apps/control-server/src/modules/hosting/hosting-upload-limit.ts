// Same env-direct-read rationale as storage-upload-limit.ts: Multer's fileSize limit is set once,
// in the FileInterceptor() decorator argument, which runs before Nest's DI container (and
// therefore ConfigService) exists. Reading process.env directly here mirrors the same variables
// declared in env.schema.ts, so the two can't disagree; env.schema.ts is what actually validates
// them at startup.
export const HOSTING_MAX_DEPLOY_BYTES = Number(process.env.HOSTING_MAX_DEPLOY_BYTES) || 100 * 1024 * 1024;
export const HOSTING_MAX_FILE_COUNT = Number(process.env.HOSTING_MAX_FILE_COUNT) || 2000;
