// functions/src/utils/crypto.ts

import * as crypto from "crypto";
import * as logger from "firebase-functions/logger";

/**
 * Encrypts plain text (e.g., student ID number) using AES-256-CBC with a random 16-byte IV.
 *
 * @param text Plain text string to encrypt
 * @param key Secret key (must resolve to 32 bytes for AES-256)
 * @returns Formatted hash string in the format: `${iv_hex}-${encrypted_hex}`
 */
export const encryptId = (text: string, key: string): string => {
  try {
    logger.info(
      `[CRYPTO-ENCRYPT] Starting encryption for input length: ${text.length}`,
    );

    // Ensure key is converted to a 32-byte Buffer
    const keyBuffer = Buffer.alloc(32, 0);
    keyBuffer.write(key, "utf8");

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-cbc", keyBuffer, iv);

    let encrypted = cipher.update(text, "utf8");
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    const result = `${iv.toString("hex")}-${encrypted.toString("hex")}`;
    logger.info(
      `[CRYPTO-ENCRYPT] Encryption successful. Output length: ${result.length}`,
    );
    return result;
  } catch (err: any) {
    logger.error(`[CRYPTO-ENCRYPT] Critical failure during encryption:`, err);
    throw err;
  }
};

/**
 * Decrypts an AES-256-CBC encrypted hash back to plain text.
 *
 * @param hash Formatted hash string (`${iv_hex}-${encrypted_hex}`)
 * @param key Secret key (must resolve to 32 bytes for AES-256)
 * @returns Decrypted plain text or null if the hash is malformed/invalid
 */
export const decryptId = (hash: string, key: string): string | null => {
  try {
    logger.info(`[CRYPTO-DECRYPT] Attempting to decrypt incoming hash...`);
    const parts = hash.split("-");

    if (parts.length !== 2) {
      logger.warn(
        `[CRYPTO-DECRYPT] Hash format invalid (Missing IV dash). Returning null.`,
      );
      return null;
    }

    const keyBuffer = Buffer.alloc(32, 0);
    keyBuffer.write(key, "utf8");

    const iv = Buffer.from(parts[0], "hex");
    const encryptedText = Buffer.from(parts[1], "hex");

    const decipher = crypto.createDecipheriv("aes-256-cbc", keyBuffer, iv);

    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    logger.info(`[CRYPTO-DECRYPT] Decryption successful!`);
    return decrypted.toString("utf8");
  } catch (e: any) {
    logger.warn(
      `[CRYPTO-DECRYPT] Decryption failed (Likely a plain-text fallback URL or invalid key). Details:`,
      e?.message || e,
    );
    return null;
  }
};

/**
 * Generates a cryptographically secure random hex string for magic links and single-use tokens.
 *
 * @param bytes Number of random bytes (default: 24, resulting in a 48-character hex string)
 */
export const generateSecureToken = (bytes: number = 24): string => {
  return crypto.randomBytes(bytes).toString("hex");
};

/**
 * Generates a cryptographically secure numeric One-Time Password (OTP).
 *
 * @param length Number of digits (default: 6)
 */
export const generateSecureOTP = (length: number = 6): string => {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return crypto.randomInt(min, max + 1).toString();
};
