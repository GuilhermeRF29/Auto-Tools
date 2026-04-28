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
  // 1. Prioridade total para a variável enviada pelo Electron/Sistema
  if (process.env.AUTOTOOLS_PYTHON_PATH) {
    return process.env.AUTOTOOLS_PYTHON_PATH;
  }

  // 2. Fallback para estrutura portátil (python-runtime) - RECOMENDADO para produção
  const portablePath = path.join(ROOT_DIR, 'python-runtime', 'python.exe');
  if (fs.existsSync(portablePath)) {
    return portablePath;
  }

  // 3. Fallback para estrutura de venv (desenvolvimento ou legado)
  const relativeVenv = path.join('..', 'venv', 'Scripts', 'python.exe');
  const absoluteVenv = path.join(ROOT_DIR, relativeVenv);
  
  if (fs.existsSync(absoluteVenv)) {
    return absoluteVenv;
  }

  return 'python';
};

export const PYTHON_PATH = resolvePythonPath();
export const BACKUP_DIR = path.join(DATA_ROOT, 'backups_sistema');

if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

export const getRootDir = () => ROOT_DIR;
