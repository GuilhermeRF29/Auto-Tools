import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..'); // project root

const resolvePythonPath = () => {
  const candidates = [
    path.join(ROOT_DIR, 'venv', 'Scripts', 'python.exe'),
    path.join(ROOT_DIR, 'backup_pyside', 'venv', 'Scripts', 'python.exe'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // Last-resort fallback to PATH when local venvs are missing.
  return 'python';
};

export const PYTHON_PATH = resolvePythonPath();
export const BACKUP_DIR = path.join(ROOT_DIR, 'backups_sistema');

if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

export const getRootDir = () => ROOT_DIR;
