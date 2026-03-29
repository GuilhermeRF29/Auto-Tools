
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PYTHON_PATH = "c:\\Users\\guilherme.felix\\Documents\\Temporário VS\\Project_Automation3\\backup_pyside\\venv\\Scripts\\python.exe";
const scriptPath = "c:\\Users\\guilherme.felix\\Documents\\Temporário VS\\Project_Automation3\\automacoes\\sr_new.py";

console.log(`Starting spawn...`);
const child = spawn(PYTHON_PATH, ['-u', scriptPath, "eyJ1c2VyX2lkIjogMX0="], {
    cwd: path.dirname(scriptPath),
    env: { ...process.env, PYTHONIOENCODING: 'utf8', PYTHONUNBUFFERED: '1' }
});

child.stdout.on('data', (data) => {
    console.log(`STDOUT: ${data}`);
});

child.stderr.on('data', (data) => {
    console.log(`STDERR: ${data}`);
});

child.on('close', (code) => {
    console.log(`Finished with code ${code}`);
});
