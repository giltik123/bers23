/** Public structured logging API. */
export * from './ConsoleTransport';
export * from './LoggerFilters';
export * from './LoggerFormatter';
export * from './LoggerService';
export * from './MemoryTransport';
export * from './RemoteTransport';
export * from './types';

import { ConsoleTransport } from './ConsoleTransport';
import { LoggerService } from './LoggerService';
/** Default console logger composed at the module boundary. */
export const logger = new LoggerService([new ConsoleTransport()]);
