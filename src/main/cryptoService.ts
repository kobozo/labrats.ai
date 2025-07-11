import * as crypto from 'crypto';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { CONFIG_PATHS, APP_CONSTANTS } from './constants';

export class CryptoService {
  private static instance: CryptoService;
  private algorithm = 'aes-256-gcm';
  private keyLength = 32; // 256 bits
  private ivLength = 16;  // 128 bits
  private tagLength = 16; // 128 bits
  private masterKeyPath: string;

  constructor() {
    this.masterKeyPath = CONFIG_PATHS.masterKey;
  }

  static getInstance(): CryptoService {
    if (!CryptoService.instance) {
      CryptoService.instance = new CryptoService();
    }
    return CryptoService.instance;
  }

  /**
   * Generate a new master key
   */
  generateMasterKey(): string {
    return crypto.randomBytes(this.keyLength).toString('hex');
  }

  /**
   * Check if master key exists
   */
  hasMasterKey(): boolean {
    return fs.existsSync(this.masterKeyPath);
  }

  /**
   * Store master key securely
   */
  async storeMasterKey(masterKey: string): Promise<void> {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.masterKeyPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Store the master key
      fs.writeFileSync(this.masterKeyPath, masterKey, { mode: 0o600 });
    } catch (error) {
      throw new Error(`Failed to store master key: ${error}`);
    }
  }

  /**
   * Load master key
   */
  async loadMasterKey(): Promise<string> {
    try {
      if (!this.hasMasterKey()) {
        throw new Error('Master key not found');
      }
      return fs.readFileSync(this.masterKeyPath, 'utf8');
    } catch (error) {
      throw new Error(`Failed to load master key: ${error}`);
    }
  }

  /**
   * Encrypt data using master key
   */
  async encrypt(data: string, masterKey: string): Promise<string> {
    try {
      const key = Buffer.from(masterKey, 'hex');
      const iv = crypto.randomBytes(this.ivLength);
      
      const cipher = crypto.createCipheriv(this.algorithm, key, iv) as crypto.CipherGCM;
      cipher.setAAD(Buffer.from(APP_CONSTANTS.encryptionIdentifier));
      
      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag();
      
      // Combine iv + tag + encrypted data
      const result = iv.toString('hex') + tag.toString('hex') + encrypted;
      return result;
    } catch (error) {
      throw new Error(`Encryption failed: ${error}`);
    }
  }

  /**
   * Decrypt data using master key
   */
  async decrypt(encryptedData: string, masterKey: string): Promise<string> {
    try {
      const key = Buffer.from(masterKey, 'hex');
      
      // Extract components
      const ivHex = encryptedData.slice(0, this.ivLength * 2);
      const tagHex = encryptedData.slice(this.ivLength * 2, (this.ivLength + this.tagLength) * 2);
      const encrypted = encryptedData.slice((this.ivLength + this.tagLength) * 2);
      
      const iv = Buffer.from(ivHex, 'hex');
      const tag = Buffer.from(tagHex, 'hex');
      
      const decipher = crypto.createDecipheriv(this.algorithm, key, iv) as crypto.DecipherGCM;
      decipher.setAAD(Buffer.from(APP_CONSTANTS.encryptionIdentifier));
      decipher.setAuthTag(tag);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      throw new Error(`Decryption failed: ${error}`);
    }
  }

  /**
   * Derive key from password (for user-provided master keys)
   */
  deriveKeyFromPassword(password: string, salt?: string): string {
    const actualSalt = salt || APP_CONSTANTS.saltIdentifier;
    return crypto.pbkdf2Sync(password, actualSalt, 100000, this.keyLength, 'sha512').toString('hex');
  }

  /**
   * Validate master key format
   */
  isValidMasterKey(masterKey: string): boolean {
    try {
      return Buffer.from(masterKey, 'hex').length === this.keyLength;
    } catch {
      return false;
    }
  }

  /**
   * Remove master key (for reset functionality)
   */
  async removeMasterKey(): Promise<void> {
    try {
      if (this.hasMasterKey()) {
        fs.unlinkSync(this.masterKeyPath);
      }
    } catch (error) {
      throw new Error(`Failed to remove master key: ${error}`);
    }
  }
}