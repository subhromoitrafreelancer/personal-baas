// Multer's fileSize limit is set once, in the FileInterceptor() decorator argument, when this
// module is first loaded — decorator arguments run before Nest's DI container (and therefore
// ConfigService) exists, so this can't be resolved through it the way other config is. Reading
// process.env directly here mirrors the same variable and default declared in env.schema.ts, so
// the two can't disagree; env.schema.ts is what actually validates it's a positive integer at
// startup.
export const STORAGE_MAX_UPLOAD_BYTES = Number(process.env.STORAGE_MAX_UPLOAD_BYTES) || 25 * 1024 * 1024;
