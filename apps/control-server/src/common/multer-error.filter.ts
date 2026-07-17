import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Response } from 'express';
import { MulterError } from 'multer';

@Catch(MulterError)
export class MulterErrorFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    response.status(status).json({ statusCode: status, message: exception.message, code: exception.code });
  }
}
