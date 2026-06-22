import crypto from 'crypto';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { runPythonCmd } from '../utils/pythonProxy.js';
import { getDb } from '../db/sqliteNative.js';
import rateLimit from 'express-rate-limit';

// Usar chave segura vinda das variáveis de ambiente criptografadas ou gerar uma provisória
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
const JWT_EXPIRES_IN = '30m'; // Expiração curta para JWT
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

const generateRefreshToken = () => crypto.randomBytes(64).toString('hex');

// Rate limiter configurado para login e registro
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 10, // Limite de 10 tentativas por IP
    message: { success: false, error: 'Muitas tentativas de login a partir deste IP, tente novamente em 15 minutos' },
    standardHeaders: true,
    legacyHeaders: false,
});

export const requireAuth = (req, res, next) => {
    let token = null;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    } else if (req.query.token) {
        // Fallback para EventSource (SSE) que não suporta envio de headers customizados
        token = req.query.token;
    }

    if (!token) {
        return res.status(401).json({ error: 'Token não fornecido. Faça login.' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.session = decoded; // Emulando o req.session para compatibilidade do código legado
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expirado', isExpired: true });
        }
        return res.status(401).json({ error: 'Token inválido' });
    }
};

export const setupAuthRoutes = (app) => {
    const router = Router();

    router.post('/login', authLimiter, async (req, res) => {
        const { usuario, senha } = req.body;
        try {
            const native = getDb();
            let user = null;

            try {
                const pyCmd = `import sys, json; from core.banco import login_principal; r=login_principal(sys.argv[1], sys.argv[2]); print(json.dumps(r))`;
                const pyResult = await runPythonCmd(pyCmd, [usuario, senha]);
                if (Array.isArray(pyResult) && pyResult[0] !== null) {
                    user = { id: pyResult[0], nome: pyResult[1], usuario: usuario };
                }
            } catch (pyErr) {
                console.warn(`[AUTH_WARN] Login via Python/Firebase falhou, tentando cache local:`, pyErr.message);
            }

            if (!user) user = native.validateLogin(usuario, senha);

            if (user) {
                // 1. Gera o JWT (acesso rápido)
                const accessToken = jwt.sign(
                    { userId: user.id, nome: user.nome, usuario: user.usuario },
                    JWT_SECRET,
                    { expiresIn: JWT_EXPIRES_IN }
                );

                // 2. Gera o Refresh Token (longa vida)
                const refreshToken = generateRefreshToken();
                native.saveRefreshToken(user.id, refreshToken, REFRESH_TOKEN_TTL_MS);

                // 3. Envia o Refresh Token num HttpOnly Cookie seguro
                res.cookie('refreshToken', refreshToken, {
                    httpOnly: true,
                    sameSite: 'lax',
                    maxAge: REFRESH_TOKEN_TTL_MS,
                    path: '/api/auth', // Cobre /refresh e /logout
                });

                return res.json({ 
                    success: true, 
                    user: { id: user.id, nome: user.nome, usuario: user.usuario },
                    token: accessToken 
                });
            }
            return res.json({ success: false, error: 'Usuário ou senha inválidos' });
        } catch (e) {
            console.error(`[AUTH_ERROR] Falha no login:`, e.message);
            return res.status(500).json({ success: false, error: 'Erro interno', details: e.message });
        }
    });

    router.post('/refresh', (req, res) => {
        const refreshToken = req.cookies?.refreshToken;
        if (!refreshToken) {
            return res.status(401).json({ error: 'Refresh token não encontrado' });
        }

        const native = getDb();
        const user = native.validateRefreshToken(refreshToken);

        if (!user) {
            res.clearCookie('refreshToken', { path: '/api/auth' });
            return res.status(401).json({ error: 'Refresh token inválido ou expirado' });
        }

        const newAccessToken = jwt.sign(
            { userId: user.id, nome: user.nome, usuario: user.usuario },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        return res.json({ success: true, token: newAccessToken });
    });

    router.post('/register', authLimiter, async (req, res) => {
        const { usuario, senha, nome } = req.body;
        const pyCmd = `import sys, json; from core.banco import cadastrar_usuario_principal; print(json.dumps(cadastrar_usuario_principal(sys.argv[1], sys.argv[2], sys.argv[3])))`;
        try {
            const result = await runPythonCmd(pyCmd, [nome || '', usuario, senha]);
            return res.json(result === true ? { success: true } : { success: false, error: 'Usuário já existe' });
        } catch (e) {
            return res.status(500).json({ success: false, error: 'Falha ao cadastrar', details: e.message });
        }
    });

    router.post('/logout', (req, res) => {
        const refreshToken = req.cookies?.refreshToken;
        if (refreshToken) {
            const native = getDb();
            native.deleteRefreshToken(refreshToken);
        }
        res.clearCookie('refreshToken', { path: '/api/auth' });
        // Limpa sessionId legado se existir
        res.clearCookie('sessionId', { path: '/' });
        return res.json({ success: true });
    });

    router.get('/me', requireAuth, (req, res) => {
        return res.json({ success: true, user: { id: req.session.userId, nome: req.session.nome, usuario: req.session.usuario } });
    });

    app.use('/api/auth', router);
};
