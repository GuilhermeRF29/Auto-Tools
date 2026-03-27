import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PYTHON_PATH = path.join(__dirname, 'backup_pyside', 'venv', 'Scripts', 'python.exe');
const cmd = `import sys, json; from core import banco; print(json.dumps(banco.login_principal('admin', 'admin')))`;

exec(`"${PYTHON_PATH}" -c "${cmd}"`, { cwd: __dirname, encoding: 'utf8' }, (error, stdout, stderr) => {
    console.log('STDOUT:', stdout);
    console.log('STDERR:', stderr);
    console.log('ERROR:', error);
});
