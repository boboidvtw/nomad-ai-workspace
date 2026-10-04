/**
 * @nomad/core - TypeScript Declarations
 * Unified Protocol, Result Pattern & Error Code Registry
 */

export interface UnitSuccess<T> {
  success: true;
  data: T;
}

export interface UnitFailure<E = string> {
  success: false;
  errorCode: E;
  message: string;
  details?: unknown;
}

export type UnitResult<T, E = string> = UnitSuccess<T> | UnitFailure<E>;

export function ok<T>(data: T): UnitSuccess<T>;
export function err<E extends string>(errorCode: E, message: string, details?: unknown): UnitFailure<E>;
export function isOk<T, E>(result: UnitResult<T, E>): result is UnitSuccess<T>;
export function isErr<T, E>(result: UnitResult<T, E>): result is UnitFailure<E>;
export function wrapAsync<T>(fn: () => Promise<T>, fallbackErrorCode?: string): Promise<UnitResult<T>>;

export const ErrorCodes: {
  readonly DAEMON_SERVER_PORT_IN_USE_001: 'DAEMON_SERVER_PORT_IN_USE_001';
  readonly DAEMON_SERVER_START_FAILED_002: 'DAEMON_SERVER_START_FAILED_002';
  readonly DAEMON_SERVER_NOT_RUNNING_003: 'DAEMON_SERVER_NOT_RUNNING_003';
  readonly DAEMON_PROCESS_KILL_FAILED_004: 'DAEMON_PROCESS_KILL_FAILED_004';
  readonly DAEMON_PID_READ_FAILED_005: 'DAEMON_PID_READ_FAILED_005';
  readonly DAEMON_CLIENT_ATTACH_FAILED_006: 'DAEMON_CLIENT_ATTACH_FAILED_006';
  readonly DAEMON_CONFIG_INVALID_007: 'DAEMON_CONFIG_INVALID_007';

  readonly DAEMON_STUDIO_OFFLINE_001: 'DAEMON_STUDIO_OFFLINE_001';
  readonly STUDIO_REGISTRATION_FAILED_001: 'STUDIO_REGISTRATION_FAILED_001';

  readonly PROBE_HOST_UNREACHABLE_001: 'PROBE_HOST_UNREACHABLE_001';
  readonly PROBE_PORT_CLOSED_002: 'PROBE_PORT_CLOSED_002';
  readonly PROBE_TIMEOUT_003: 'PROBE_TIMEOUT_003';
  readonly PROBE_CHECK_FAILED_004: 'PROBE_CHECK_FAILED_004';

  readonly BRIDGE_ROUTE_NOT_FOUND_001: 'BRIDGE_ROUTE_NOT_FOUND_001';
  readonly BRIDGE_INVALID_BODY_002: 'BRIDGE_INVALID_BODY_002';
  readonly BRIDGE_EXECUTION_FAILED_003: 'BRIDGE_EXECUTION_FAILED_003';
  readonly BRIDGE_INVALID_METHOD_004: 'BRIDGE_INVALID_METHOD_004';

  readonly DASHBOARD_FILE_NOT_FOUND_001: 'DASHBOARD_FILE_NOT_FOUND_001';
  readonly DASHBOARD_READ_FAILED_002: 'DASHBOARD_READ_FAILED_002';

  readonly ORCHESTRATOR_INVALID_SEQUENCE_001: 'ORCHESTRATOR_INVALID_SEQUENCE_001';
  readonly ORCHESTRATOR_RUN_FAILED_002: 'ORCHESTRATOR_RUN_FAILED_002';
  readonly ORCHESTRATOR_BUSY_003: 'ORCHESTRATOR_BUSY_003';

  readonly SESSION_NOT_FOUND_001: 'SESSION_NOT_FOUND_001';
  readonly SESSION_STORAGE_ERROR_002: 'SESSION_STORAGE_ERROR_002';
};

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export const DEFAULT_DAEMON_PORT: number;
export const DEFAULT_DAEMON_HOST: string;

export interface MonitoredService {
  id: string;
  name: string;
  port: number;
  host: string;
  category: string;
  essential: boolean;
}

export const MONITORED_SERVICES: readonly MonitoredService[];

export interface PlatformConfig {
  id: string;
  name: string;
  defaultUrl: string;
  color: string;
}

export const PLATFORMS: Record<string, PlatformConfig>;
export const LAYOUTS: readonly string[];
export const SEMANTIC_TYPES: readonly string[];

export interface TemplateVariable {
  name: string;
  defaultValue: string;
}

export function extractVariables(template: string): UnitResult<TemplateVariable[]>;
export function interpolate(template: string, values?: Record<string, string>): UnitResult<{ rendered: string; unreplaced: string[] }>;

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

export interface ChatExportOptions {
  title: string;
  platform?: string;
  model?: string;
  date?: string;
  messages: ChatMessage[];
}

export function formatChatToMarkdown(options: ChatExportOptions): UnitResult<{ markdown: string; wordCount: number; messageCount: number }>;
