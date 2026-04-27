import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { getRootDir } from '../config.js';
import { runPythonCmd } from '../utils/pythonProxy.js';
import { getTunnelUrl } from './tunnelRoutes.js';

const router = Router();

const RP_NAME = 'Auto Tools';
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const TOKEN_TTL_MS = 180 * 24 * 60 * 60 * 1000;

const runtimeDataDir = `${process.env.AUTOTOOLS_DATA_DIR || ''}`.trim();
const DATA_DIR = runtimeDataDir
  ? path.resolve(runtimeDataDir)
  : path.join(getRootDir(), 'src_backend', 'data');
const STORE_PATH = path.join(DATA_DIR, 'webauthn_store.json');

const pendingChallenges = new Map();

const toUserIdBytes = (userId) => new TextEncoder().encode(String(userId ?? ''));

const ensureStoreFile = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify({ version: 1, users: {} }, null, 2), 'utf-8');
  }
};

const readStore = () => {
  ensureStoreFile();
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { version: 1, users: {} };
    }
    if (!parsed.users || typeof parsed.users !== 'object') {
      parsed.users = {};
    }
    return parsed;
  } catch {
    return { version: 1, users: {} };
  }
};

const writeStore = (store) => {
  ensureStoreFile();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
};

const toBase64Url = (input) => {
  if (!input) return '';
  if (typeof input === 'string') return input;
  return Buffer.from(input).toString('base64url');
};

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const generateBiometricToken = () => crypto.randomBytes(32).toString('base64url');

const cleanupChallenges = () => {
  const now = Date.now();
  for (const [id, challenge] of pendingChallenges.entries()) {
    if (!challenge || now - challenge.createdAt > CHALLENGE_TTL_MS) {
      pendingChallenges.delete(id);
    }
  }
};

setInterval(cleanupChallenges, 60 * 1000);

const getRpId = (req) => {
  const rawOrigin = req.headers.origin ? `${req.headers.origin}`.trim() : '';
  let originHostname = '';
  if (rawOrigin) {
    try {
      originHostname = new URL(rawOrigin).hostname.toLowerCase();
    } catch {
      originHostname = '';
    }
  }

  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const hostSource = `${host}`.trim() || req.hostname || '127.0.0.1';
  const hostHostname = hostSource.split(':')[0].toLowerCase();
  
  const hostname = originHostname || hostHostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return 'localhost';
  }

  // Se for um túnel Cloudflare, retorna o domínio completo
  if (hostname.endsWith('.trycloudflare.com')) {
    return hostname;
  }

  // Para qualquer outro caso (IP de rede local, etc), retornamos o hostname detectado.
  // Nota: WebAuthn provavelmente falhará em IPs, mas não dará erro de "RP ID mismatch".
  return hostname;
};

const getExpectedOrigins = (req) => {
  const rpId = getRpId(req);
  const providedOrigin = req.headers.origin ? `${req.headers.origin}`.trim() : '';
  const isTunnel = rpId.endsWith('.trycloudflare.com');
  
  const defaults = [
    `http://${rpId}:3000`,
    `http://${rpId}:5173`,
    `http://localhost:3000`,
    `http://localhost:5173`,
    `http://127.0.0.1:3000`,
    `http://127.0.0.1:5173`,
  ];

  if (isTunnel) {
    defaults.push(`https://${rpId}`);
  }

  // No caso de localhost, o browser pode mandar http://localhost:3000
  if (rpId === 'localhost') {
    defaults.push('http://localhost:3000');
    defaults.push('http://127.0.0.1:3000');
  }

  if (!providedOrigin) {
    return defaults;
  }
  return Array.from(new Set([providedOrigin, ...defaults]));
};

const resolveUserFromPassword = async (usuario, senha) => {
  if (!usuario || !senha) return null;
  const pyCmd = `import sys, json; from core.banco import login_principal; print(json.dumps(login_principal(sys.argv[1], sys.argv[2])))`;
  const result = await runPythonCmd(pyCmd, [usuario, senha]);
  if (!Array.isArray(result) || result[0] == null) {
    return null;
  }
  const [id, nome] = result;
  return { id: Number(id), nome, usuario };
};

const getUserRecord = (store, userId) => {
  const key = String(userId);
  if (!store.users[key]) {
    store.users[key] = {
      user: null,
      enabled: false,
      credentials: [],
      biometricTokenHash: null,
      tokenExpiresAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
  if (!Array.isArray(store.users[key].credentials)) {
    store.users[key].credentials = [];
  }
  return store.users[key];
};

const findRecordByToken = (store, biometricToken) => {
  if (!biometricToken) return null;
  const tokenHash = sha256(biometricToken);
  const now = Date.now();
  for (const [userId, record] of Object.entries(store.users || {})) {
    if (!record || record.enabled !== true) continue;
    
    // Agora buscamos dentro do array de sessões
    const session = (record.sessions || []).find(s => 
      s.tokenHash === tokenHash && 
      new Date(s.expiresAt).getTime() > now
    );
    
    if (session) {
      return { userId, record, tokenHash, session };
    }

    // Compatibilidade com tokens antigos (legado)
    if (record.biometricTokenHash === tokenHash) {
      if (!record.tokenExpiresAt || new Date(record.tokenExpiresAt).getTime() > now) {
        return { userId, record, tokenHash };
      }
    }
  }
  return null;
};

router.post('/webauthn/register/options', async (req, res) => {
  const { usuario, senha } = req.body || {};
  try {
    const user = await resolveUserFromPassword(usuario, senha);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Credenciais inválidas para ativar Windows Hello.' });
    }

    const store = readStore();
    const record = getUserRecord(store, user.id);

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: getRpId(req),
      userID: toUserIdBytes(user.id),
      userName: user.usuario,
      userDisplayName: user.nome || user.usuario,
      timeout: 60000,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'required',
      },
      supportedAlgorithmIDs: [-7, -257],
      excludeCredentials: (record.credentials || []).map((credential) => ({
        id: credential.id,
        type: 'public-key',
        transports: credential.transports || ['internal'],
      })),
    });

    const transactionId = crypto.randomUUID();
    pendingChallenges.set(transactionId, {
      type: 'register',
      user,
      challenge: options.challenge,
      rpID: getRpId(req),
      createdAt: Date.now(),
    });

    return res.json({ success: true, transactionId, options });
  } catch (e) {
    console.error('[WEBAUTHN_REGISTER_OPTIONS_ERROR]', e);
    return res.status(500).json({
      success: false,
      error: 'Falha ao preparar o registro do Windows Hello.',
      details: e?.message || 'Erro interno no provedor de autenticação.',
    });
  }
});

router.post('/webauthn/register/verify', async (req, res) => {
  const { transactionId, registrationResponse } = req.body || {};

  const challengeData = pendingChallenges.get(transactionId);
  if (!challengeData || challengeData.type !== 'register') {
    return res.status(400).json({ success: false, error: 'Transação de registro inválida ou expirada.' });
  }
  if (Date.now() - challengeData.createdAt > CHALLENGE_TTL_MS) {
    pendingChallenges.delete(transactionId);
    return res.status(400).json({ success: false, error: 'Desafio de registro expirado. Tente novamente.' });
  }

  try {
    const verification = await verifyRegistrationResponse({
      response: registrationResponse,
      expectedChallenge: challengeData.challenge,
      expectedOrigin: getExpectedOrigins(req),
      expectedRPID: challengeData.rpID,
      requireUserVerification: true,
    });

    if (!verification?.verified || !verification.registrationInfo) {
      pendingChallenges.delete(transactionId);
      return res.status(400).json({ success: false, error: 'Não foi possível validar a credencial do Windows Hello.' });
    }

    const credentialInfo = verification.registrationInfo.credential || null;
    const credentialId = toBase64Url(credentialInfo?.id || verification.registrationInfo.credentialID);
    const credentialPublicKey = toBase64Url(credentialInfo?.publicKey || verification.registrationInfo.credentialPublicKey);
    const credentialCounter = Number(credentialInfo?.counter ?? verification.registrationInfo.counter ?? 0);
    const credentialDeviceType = credentialInfo?.deviceType || verification.registrationInfo.credentialDeviceType || 'singleDevice';
    const credentialBackedUp = Boolean(credentialInfo?.backedUp ?? verification.registrationInfo.credentialBackedUp ?? false);
    const credentialTransports = credentialInfo?.transports || registrationResponse?.response?.transports || ['internal'];

    if (!credentialId || !credentialPublicKey) {
      pendingChallenges.delete(transactionId);
      return res.status(400).json({ success: false, error: 'Credencial retornada em formato inválido.' });
    }

    const store = readStore();
    const record = getUserRecord(store, challengeData.user.id);
    const existingIndex = record.credentials.findIndex((item) => item.id === credentialId);
    const credentialPayload = {
      id: credentialId,
      publicKey: credentialPublicKey,
      counter: credentialCounter,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: credentialTransports,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      record.credentials[existingIndex] = {
        ...record.credentials[existingIndex],
        ...credentialPayload,
      };
    } else {
      record.credentials.push(credentialPayload);
    }

    const biometricToken = generateBiometricToken();
    const tokenHash = sha256(biometricToken);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

    record.user = challengeData.user;
    record.enabled = true;
    
    if (!Array.isArray(record.sessions)) {
      record.sessions = [];
    }

    // Adiciona a nova sessão (token) para este dispositivo
    record.sessions.push({
      tokenHash,
      expiresAt,
      createdAt: new Date().toISOString(),
      // Vincula ao ID da credencial que acabou de ser criada/atualizada
      credentialId
    });

    // Limpa sessões expiradas para não crescer infinitamente
    record.sessions = record.sessions.filter(s => new Date(s.expiresAt).getTime() > Date.now());

    record.updatedAt = new Date().toISOString();
    writeStore(store);
    pendingChallenges.delete(transactionId);

    return res.json({
      success: true,
      user: challengeData.user,
      biometricToken,
      tokenExpiresAt: record.tokenExpiresAt,
    });
  } catch (e) {
    pendingChallenges.delete(transactionId);
    console.error('[WEBAUTHN_REGISTER_VERIFY_ERROR]', e);
    return res.status(500).json({ success: false, error: 'Falha ao validar o registro do Windows Hello.' });
  }
});

router.post('/webauthn/auth/options', async (req, res) => {
  const { biometricToken } = req.body || {};
  try {
    const store = readStore();
    const tokenMatch = findRecordByToken(store, biometricToken);
    if (!tokenMatch) {
      return res.status(401).json({ success: false, error: 'Token biométrico inválido ou expirado. Reative o Windows Hello.' });
    }

    const { userId, record, tokenHash } = tokenMatch;
    if (!Array.isArray(record.credentials) || record.credentials.length === 0) {
      return res.status(404).json({ success: false, error: 'Nenhuma credencial biométrica encontrada para este usuário.' });
    }

    const options = await generateAuthenticationOptions({
      rpID: getRpId(req),
      timeout: 60000,
      userVerification: 'required',
      allowCredentials: record.credentials.map((credential) => ({
        id: credential.id,
        type: 'public-key',
        transports: credential.transports || ['internal'],
      })),
    });

    const transactionId = crypto.randomUUID();
    pendingChallenges.set(transactionId, {
      type: 'auth',
      userId,
      tokenHash,
      challenge: options.challenge,
      rpID: getRpId(req),
      createdAt: Date.now(),
    });

    return res.json({ success: true, transactionId, options });
  } catch (e) {
    console.error('[WEBAUTHN_AUTH_OPTIONS_ERROR]', e);
    return res.status(500).json({ success: false, error: 'Falha ao iniciar autenticação com Windows Hello.' });
  }
});

router.post('/webauthn/auth/verify', async (req, res) => {
  const { transactionId, biometricToken, authenticationResponse } = req.body || {};
  const challengeData = pendingChallenges.get(transactionId);

  if (!challengeData || challengeData.type !== 'auth') {
    return res.status(400).json({ success: false, error: 'Transação de autenticação inválida ou expirada.' });
  }
  if (Date.now() - challengeData.createdAt > CHALLENGE_TTL_MS) {
    pendingChallenges.delete(transactionId);
    return res.status(400).json({ success: false, error: 'Desafio de autenticação expirado. Tente novamente.' });
  }

  try {
    const tokenHash = sha256(biometricToken || '');
    if (!biometricToken || tokenHash !== challengeData.tokenHash) {
      pendingChallenges.delete(transactionId);
      return res.status(401).json({ success: false, error: 'Token biométrico inválido.' });
    }

    const store = readStore();
    const record = store.users?.[String(challengeData.userId)];
    if (!record || !record.enabled || !Array.isArray(record.credentials)) {
      pendingChallenges.delete(transactionId);
      return res.status(404).json({ success: false, error: 'Credencial biométrica não encontrada para autenticação.' });
    }

    const presentedCredentialId = authenticationResponse?.id;
    const savedCredential = record.credentials.find((credential) => credential.id === presentedCredentialId);
    if (!savedCredential) {
      pendingChallenges.delete(transactionId);
      return res.status(404).json({ success: false, error: 'Credencial apresentada não está registrada para este usuário.' });
    }

    const verification = await verifyAuthenticationResponse({
      response: authenticationResponse,
      expectedChallenge: challengeData.challenge,
      expectedOrigin: getExpectedOrigins(req),
      expectedRPID: challengeData.rpID,
      requireUserVerification: true,
      credential: {
        id: savedCredential.id,
        publicKey: Buffer.from(savedCredential.publicKey, 'base64url'),
        counter: Number(savedCredential.counter || 0),
        transports: savedCredential.transports || ['internal'],
      },
    });

    if (!verification?.verified) {
      pendingChallenges.delete(transactionId);
      return res.status(401).json({ success: false, error: 'Validação biométrica falhou.' });
    }

    const nextCounter = Number(verification.authenticationInfo?.newCounter || 0);
    savedCredential.counter = nextCounter;
    savedCredential.updatedAt = new Date().toISOString();
    record.updatedAt = new Date().toISOString();
    writeStore(store);

    pendingChallenges.delete(transactionId);
    return res.json({ success: true, user: record.user });
  } catch (e) {
    pendingChallenges.delete(transactionId);
    console.error('[WEBAUTHN_AUTH_VERIFY_ERROR]', e);
    return res.status(500).json({
      success: false,
      error: 'Erro ao validar autenticação do Windows Hello.',
      details: e?.message || 'Falha interna durante verificação biométrica.',
    });
  }
});

router.post('/webauthn/disable', async (req, res) => {
  const { usuario, senha, biometricToken } = req.body || {};
  try {
    const store = readStore();
    
    // Caso 1: Desativação específica por Token (apenas este dispositivo)
    if (biometricToken) {
      const tokenHash = sha256(biometricToken);
      let found = false;
      
      for (const record of Object.values(store.users || {})) {
        if (Array.isArray(record.sessions)) {
          const initialCount = record.sessions.length;
          record.sessions = record.sessions.filter(s => s.tokenHash !== tokenHash);
          if (record.sessions.length < initialCount) {
            found = true;
            record.updatedAt = new Date().toISOString();
          }
        }
        // Também limpa legado
        if (record.biometricTokenHash === tokenHash) {
          record.biometricTokenHash = null;
          record.tokenExpiresAt = null;
          found = true;
        }
      }

      if (found) {
        writeStore(store);
        return res.json({ success: true, message: 'Dispositivo desvinculado com sucesso.' });
      }
    }

    // Caso 2: Desativação Global (por senha)
    if (usuario && senha) {
      const user = await resolveUserFromPassword(usuario, senha);
      if (!user) {
        return res.status(401).json({ success: false, error: 'Senha inválida para desativar Windows Hello.' });
      }

      delete store.users[String(user.id)];
      writeStore(store);
      return res.json({ success: true, message: 'Biometria desativada em todos os dispositivos.' });
    }

    return res.status(400).json({ success: false, error: 'Credenciais ou token não fornecidos.' });
  } catch (e) {
    console.error('[WEBAUTHN_DISABLE_ERROR]', e);
    return res.status(500).json({ success: false, error: 'Falha ao desativar Windows Hello.' });
  }
});

router.get('/webauthn/state/:userId', (req, res) => {
  const { userId } = req.params;
  const store = readStore();
  const record = store.users?.[String(userId)];
  return res.json({
    success: true,
    enabled: Boolean(record?.enabled && Array.isArray(record?.credentials) && record.credentials.length > 0),
  });
});

export default router;