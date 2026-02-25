import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { Writable } from 'stream';
import { EncryptedWallet } from '../types';

const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH = 32;
const ALGORITHM = 'aes-256-gcm';

export function encryptKey(privateKey: string, password: string): EncryptedWallet & { privateKey?: undefined } {
  const salt = crypto.randomBytes(32);
  const iv = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(privateKey, 'utf-8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return {
    address: '', // set by caller
    encryptedKey: encrypted,
    iv: iv.toString('hex'),
    salt: salt.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

export function decryptKey(wallet: EncryptedWallet, password: string): string {
  const salt = Buffer.from(wallet.salt, 'hex');
  const iv = Buffer.from(wallet.iv, 'hex');
  const authTag = Buffer.from(wallet.authTag, 'hex');
  const key = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(wallet.encryptedKey, 'hex', 'utf-8');
  decrypted += decipher.final('utf-8');
  return decrypted;
}

export function saveWallet(workspacePath: string, wallet: EncryptedWallet): void {
  fs.writeFileSync(
    path.join(workspacePath, 'wallet.json'),
    JSON.stringify(wallet, null, 2)
  );
}

export function loadWallet(workspacePath: string): EncryptedWallet {
  const walletPath = path.join(workspacePath, 'wallet.json');
  if (!fs.existsSync(walletPath)) {
    throw new Error('No wallet found. Run: lobstr wallet create');
  }
  return JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
}

export function walletExists(workspacePath: string): boolean {
  return fs.existsSync(path.join(workspacePath, 'wallet.json'));
}

export async function promptPassword(prompt: string = 'Password: '): Promise<string> {
  if (process.env.OPENCLAW_PASSWORD) {
    return process.env.OPENCLAW_PASSWORD;
  }

  return new Promise((resolve) => {
    const mutableStdout = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    });

    const rl = readline.createInterface({
      input: process.stdin,
      output: mutableStdout,
      terminal: true,
    });

    process.stdout.write(prompt);
    rl.question('', (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}
