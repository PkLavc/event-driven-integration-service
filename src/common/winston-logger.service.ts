import { Injectable, LoggerService } from '@nestjs/common';

@Injectable()
export class WinstonLoggerService implements LoggerService {
  log(message: any, ...optionalParams: any[]) {
    // Minimal logger adapter to satisfy Nest logger contract.
    console.log(message, ...optionalParams);
  }

  error(message: any, ...optionalParams: any[]) {
    console.error(message, ...optionalParams);
  }

  warn(message: any, ...optionalParams: any[]) {
    console.warn(message, ...optionalParams);
  }

  debug?(message: any, ...optionalParams: any[]) {
    console.debug(message, ...optionalParams);
  }

  verbose?(message: any, ...optionalParams: any[]) {
    console.info(message, ...optionalParams);
  }
}
