const { safeStorage, app } = require('electron');
const fs = require('fs');
const path = require('path');

const SECRETS_MAPPING = [
  { name: 'firebase', srcPath: 'firebase-credentials.json', envKey: 'FIREBASE_CREDENTIALS_JSON' },
  { name: 'gmailToken', srcPath: 'token.json', envKey: 'GMAIL_TOKEN_JSON' },
  { name: 'coreCreds', srcPath: 'core/credentials.json', envKey: 'CORE_CREDENTIALS_JSON' },
  { name: 'authJson', srcPath: 'automacoes/auth.json', envKey: 'AUTO_AUTH_JSON' },
  { name: 'env', srcPath: '.env', envKey: 'DOTENV_TEXT' }
];

function processSecrets() {
  const isAvailable = safeStorage.isEncryptionAvailable();
  if (!isAvailable) {
    console.warn('[SECURE_STORAGE] safeStorage não está disponível neste SO. As credenciais podem não ser criptografadas nativamente.');
  }

  const appPath = app.getAppPath();
  const unpackedPath = appPath.includes('app.asar') ? appPath.replace('app.asar', 'app.asar.unpacked') : appPath;
  const dataDir = path.join(app.getPath('userData'), 'runtime-data', 'encrypted');
  const bkpDir = path.join(unpackedPath, '.tmp_bkp_secrets');

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(bkpDir)) {
    fs.mkdirSync(bkpDir, { recursive: true });
  }

  const envs = {};

  SECRETS_MAPPING.forEach(({ name, srcPath, envKey }) => {
    // Busca na raiz
    const originalPath = path.join(unpackedPath, srcPath);
    const encPath = path.join(dataDir, `${name}.enc`);

    // 1. Se o original existe (texto plano), criptografa e move pra BKP
    if (fs.existsSync(originalPath)) {
      try {
        const textContent = fs.readFileSync(originalPath, 'utf8');
        
        let encrypted;
        if (isAvailable) {
          encrypted = safeStorage.encryptString(textContent);
        } else {
          encrypted = Buffer.from(textContent, 'utf8'); // fallback apenas se API falhar
        }
        
        fs.writeFileSync(encPath, encrypted);
        console.log(`[SECURE_STORAGE] ${name} criptografado e salvo em userData.`);
        
        // Faz backup e renomeia o original
        const parsedPath = path.parse(originalPath);
        const bkpFile = path.join(bkpDir, `${name}_${parsedPath.base}`);
        fs.copyFileSync(originalPath, bkpFile);
        
        fs.renameSync(originalPath, originalPath + '.bak');
      } catch (err) {
        console.error(`[SECURE_STORAGE] Erro ao criptografar ${srcPath}:`, err.message);
      }
    }

    // 2. Se o .enc existe, descriptografa pra memória
    if (fs.existsSync(encPath)) {
      try {
        const encrypted = fs.readFileSync(encPath);
        let decryptedText;
        if (isAvailable) {
          decryptedText = safeStorage.decryptString(encrypted);
        } else {
          decryptedText = encrypted.toString('utf8');
        }
        if (name === 'env') {
          envs[envKey] = decryptedText;
          decryptedText.split('\n').forEach(line => {
            if (line.includes('=') && !line.trim().startsWith('#')) {
              const [k, ...v] = line.split('=');
              if (k) envs[k.trim()] = v.join('=').trim();
            }
          });
        } else {
          envs[envKey] = decryptedText;
        }
      } catch (err) {
        console.error(`[SECURE_STORAGE] Erro ao descriptografar ${name}.enc:`, err.message);
      }
    }
  });

  return envs;
}

module.exports = {
  processSecrets
};
