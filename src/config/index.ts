/**
 * Configuration barrel export
 * Exports schema, types, and transformation utilities for application config
 */
export {
  configSchema,
  transformEnvToConfig,
  type AppConfig,
} from "./config.schema";
export {
  buildConfigInput,
  loadValidatedConfig,
  type ConfigInput,
  type CliOverrides,
} from "./config.factory";

/**
 * Injection token for validated application config
 * Use with @Inject(APP_CONFIG) to get type-safe access to AppConfig
 */
export const APP_CONFIG = Symbol("APP_CONFIG");
