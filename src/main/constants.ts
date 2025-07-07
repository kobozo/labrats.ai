import * as path from 'path';
import * as os from 'os';

/**
 * Central configuration constants for LabRats.ai
 * This file contains all shared configuration paths and constants
 */

// Main configuration directory
export const LABRATS_CONFIG_DIR = path.join(os.homedir(), '.labrats');

// Configuration file paths
export const CONFIG_PATHS = {
  configFile: path.join(LABRATS_CONFIG_DIR, 'config.yaml'),
  projectsStore: path.join(LABRATS_CONFIG_DIR, 'projects.json'),
  masterKey: path.join(LABRATS_CONFIG_DIR, 'master.key'),
} as const;

// App constants
export const APP_CONSTANTS = {
  name: 'LabRats.ai',
  configDirName: '.labrats',
  encryptionIdentifier: 'labrats',
  saltIdentifier: 'labrats-salt',
} as const;