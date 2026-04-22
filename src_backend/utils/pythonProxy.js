/**
 * @module pythonProxy
 * @description Ponte de comunicação entre Node.js e Python.
 * 
 * Provê três formas de executar código Python:
 *   - runPythonCmd()     — Executa código Python inline (via -c flag)
 *   - spawnPythonScript() — Executa arquivo .py (retorna ChildProcess)
 *   - execCmd()          — Executa comando shell genérico
 * 
 * O caminho do interpretador Python é resolvido automaticamente pelo
 * módulo config.js, detectando se estamos em ambiente de desenvolvimento
 * (venv/) ou compilado (PyInstaller .exe).
 * 
 * SEGURANÇA: rawCommand vem do código-fonte (não de input do usuário).
 * Argumentos são passados via sys.argv (não interpolados no código).
 */
import { spawn, exec } from 'child_process';
import readline from 'readline';
import { getRootDir, PYTHON_PATH } from '../config.js';

/**
 * Runs a one-liner python code using Python's `-c` flag.
 * Safely passes arguments appending them to `sys.argv`.
 *
 * @param {string} rawCommand - The python code to execute. Use `sys.argv[i]` to read kwargs. (1-indexed).
 * @param {string[]} args - String arguments to be appended. Will be accessible as sys.argv[1], sys.argv[2]...
 * @returns {Promise<any>} Resolves to parsed JSON or string.
 */
export const runPythonCmd = (rawCommand, args = []) => {
  return new Promise((resolve, reject) => {
    const childPy = spawn(PYTHON_PATH, ["-c", rawCommand, ...args], {
      cwd: getRootDir(),
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
    });
    
    let stdoutData = '';
    let stderrData = '';

    childPy.stdout.on('data', (d) => stdoutData += d.toString());
    childPy.stderr.on('data', (d) => stderrData += d.toString());

    childPy.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`[Python Error ${code}]: ${stderrData}`));
      }
      const rawOut = stdoutData.trim();
      try {
        if (rawOut === 'ok' || rawOut === 'true' || rawOut === 'false') {
          resolve(rawOut === 'ok' || rawOut === 'true');
          return;
        }
        resolve(JSON.parse(rawOut));
      } catch (e) {
        // Se não for JSON, retorna a string crua
        resolve(rawOut);
      }
    });
  });
};

/**
 * Runs python code inline but returns an AsyncGenerator that yields parsed JSON objects line by line.
 * Ideal for massive SQLite or DuckDB chunks to prevent V8 out-of-memory string errors.
 * 
 * @param {string} rawCommand - The python code.
 * @param {string[]} args - String arguments.
 * @returns {AsyncGenerator<object, void, unknown>}
 */
export async function* runPythonCmdStream(rawCommand, args = []) {
  const childPy = spawn(PYTHON_PATH, ["-c", rawCommand, ...args], {
    cwd: getRootDir(),
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
  });

  const rl = readline.createInterface({
    input: childPy.stdout,
    crlfDelay: Infinity
  });

  let stderrData = '';
  childPy.stderr.on('data', (d) => stderrData += d.toString());

  // Wait for the close event, but we also process lines asynchronously.
  const closePromise = new Promise((resolve, reject) => {
    childPy.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`[Python Error ${code}]: ${stderrData}`));
      } else {
        resolve();
      }
    });
    childPy.on('error', (err) => reject(err));
  });

  try {
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        yield JSON.parse(line);
      } catch (e) {
        // Line is not a valid JSON. Maybe it's a python print debug. Just ignore or yield raw.
        continue;
      }
    }
    await closePromise;
  } finally {
    if (!childPy.killed) {
      childPy.kill();
    }
  }
}

/**
 * Executes a full python script from a path.
 *
 * @param {string} scriptPath - The path to the Python script.
 * @param {string[]} args - Arguments.
 * @returns ChildProcess instance (unpromisified) so we can attach events (for automations).
 */
export const spawnPythonScript = (scriptPath, args = []) => {
  return spawn(PYTHON_PATH, [scriptPath, ...args], { 
    cwd: getRootDir(),
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
  });
};

export const execCmd = (cmd) => {
  return new Promise((resolve, reject) => {
    exec(cmd, { cwd: getRootDir() }, (error, stdout, stderr) => {
      if (error) return reject(error);
      resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
};
