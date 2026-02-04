/**
 * Configuration interface for AnkiConnect
 * This interface defines the minimal configuration needed for Anki integration
 */
export interface IAnkiConfig {
  /**
   * AnkiConnect server URL
   * @default 'http://localhost:8765'
   */
  ankiConnectUrl: string;

  /**
   * AnkiConnect API version
   * @default 6
   */
  ankiConnectApiVersion: number;

  /**
   * Optional API key for AnkiConnect authentication
   */
  ankiConnectApiKey?: string;

  /**
   * Request timeout in milliseconds
   * @default 5000
   */
  ankiConnectTimeout: number;

  /**
   * Read-only mode - blocks all write operations
   * @default false
   */
  readOnly?: boolean;
}

/**
 * Token for dependency injection
 */
export const ANKI_CONFIG = Symbol("ANKI_CONFIG");
