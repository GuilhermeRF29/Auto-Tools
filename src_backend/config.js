import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envAppRoot = `${process.env.AUTOTOOLS_APP_ROOT || ''}`.trim();
const ROOT_DIR = envAppRoot
  ? path.resolve(envAppRoot)
  : path.resolve(__dirname, '..');

const envDataRoot = `${process.env.AUTOTOOLS_DATA_DIR || ''}`.trim();
const DATA_ROOT = envDataRoot
  ? path.resolve(envDataRoot)
  : ROOT_DIR;

const resolvePythonPath = () => {
  const candidates = [
    process.resourcesPath ? path.join(process.resourcesPath, 'venv', 'Scripts', 'python.exe') : null,
    path.join(ROOT_DIR, 'venv', 'Scripts', 'python.exe'),
    path.join(ROOT_DIR, 'backup_pyside', 'venv', 'Scripts', 'python.exe'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // Last-resort fallback to PATH when local venvs are missing.
  return 'python';
};

export const PYTHON_PATH = resolvePythonPath();
export const BACKUP_DIR = path.join(DATA_ROOT, 'backups_sistema');

if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

export const getRootDir = () => ROOT_DIR;
