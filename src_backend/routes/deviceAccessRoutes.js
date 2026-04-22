import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Router } from 'express';
import { getRootDir } from '../config.js';

const router = Router();

const runtimeDataDir = `${process.env.AUTOTOOLS_DATA_DIR || ''}`.trim();
const DATA_DIR = runtimeDataDir
    ? path.resolve(runtimeDataDir)
    : path.join(getRootDir(), 'src_backend', 'data');
const STORE_PATH = path.join(DATA_DIR, 'device_access_store.json');
const MAX_PENDING_REQUESTS = 200;
const MAX_APPROVED_DEVICES = 300;

const DEFAULT_CONFIG = Object.freeze({
    remoteAccessEnabled: false,
    approvalRequired: true,
    enforceIpMatch: true,
    tokenTtlDays: 30,
    updatedAt: null,
});

const normalizeConfig = (input) => {
    const cfg = input && typeof input === 'object' ? input : {};
    const tokenTtlDays = Number(cfg.tokenTtlDays);

    return {
        remoteAccessEnabled: Boolean(cfg.remoteAccessEnabled),
        approvalRequired: cfg.approvalRequired !== false,
        enforceIpMatch: cfg.enforceIpMatch !== false,
        tokenTtlDays: Number.isFinite(tokenTtlDays)
            ? Math.min(365, Math.max(1, Math.round(tokenTtlDays)))
            : DEFAULT_CONFIG.tokenTtlDays,
        updatedAt: typeof cfg.updatedAt === 'string' ? cfg.updatedAt : null,
    };
};

const ensureStoreFile = () => {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(STORE_PATH)) {
        const seed = {
            version: 1,
            config: { ...DEFAULT_CONFIG },
            pendingRequests: [],
            approvedDevices: [],
        };
        fs.writeFileSync(STORE_PATH, JSON.stringify(seed, null, 2), 'utf-8');
    }
};

const readStore = () => {
    ensureStoreFile();
    try {
        const raw = fs.readFileSync(STORE_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        const pendingRequests = Array.isArray(parsed?.pendingRequests) ? parsed.pendingRequests : [];
        const approvedDevices = Array.isArray(parsed?.approvedDevices) ? parsed.approvedDevices : [];

        return {
            version: 1,
            config: normalizeConfig(parsed?.config),
            pendingRequests,
            approvedDevices,
        };
    } catch {
        return {
            version: 1,
            config: { ...DEFAULT_CONFIG },
            pendingRequests: [],
            approvedDevices: [],
        };
    }
};

const writeStore = (store) => {
    ensureStoreFile();
    const normalized = {
        version: 1,
        config: normalizeConfig(store?.config),
        pendingRequests: Array.isArray(store?.pendingRequests) ? store.pendingRequests.slice(-MAX_PENDING_REQUESTS) : [],
        approvedDevices: Array.isArray(store?.approvedDevices) ? store.approvedDevices.slice(-MAX_APPROVED_DEVICES) : [],
    };
    fs.writeFileSync(STORE_PATH, JSON.stringify(normalized, null, 2), 'utf-8');
};

const normalizeIp = (rawValue) => {
    if (!rawValue) return '';
    let ip = `${rawValue}`.trim();
    if (!ip) return '';

    if (ip.includes(',')) {
        ip = ip.split(',')[0].trim();
    }

    if (ip.startsWith('::ffff:')) {
        ip = ip.slice('::ffff:'.length);
    }

    if (ip === '::1') {
        return '127.0.0.1';
    }

    return ip;
};

const isLoopbackIp = (ip) => {
    const normalized = normalizeIp(ip);
    if (!normalized) return false;
    if (normalized === '127.0.0.1') return true;
    if (normalized === 'localhost') return true;
    return normalized.startsWith('127.');
};

export const getClientIp = (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
        return normalizeIp(forwarded);
    }

    if (Array.isArray(forwarded) && forwarded.length > 0) {
        return normalizeIp(forwarded[0]);
    }

    return normalizeIp(req.socket?.remoteAddress || req.ip || '');
};

const getDeviceTokenFromRequest = (req) => {
    const headerToken = req.headers['x-autotools-device-token'];
    if (typeof headerToken === 'string' && headerToken.trim()) {
        return headerToken.trim();
    }

    if (Array.isArray(headerToken) && headerToken.length > 0) {
        const first = `${headerToken[0] || ''}`.trim();
        if (first) return first;
    }

    return '';
};

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const createDeviceToken = () => crypto.randomBytes(32).toString('base64url');

const parseDeviceName = (req) => {
    const customName = `${req.body?.deviceName || ''}`.trim();
    if (customName) return customName.slice(0, 80);

    const ua = `${req.headers['user-agent'] || ''}`.trim();
    if (!ua) return 'Dispositivo externo';

    const sanitized = ua.replace(/\s+/g, ' ').slice(0, 80);
    return sanitized || 'Dispositivo externo';
};

const parseDeviceFingerprint = (req) => {
    const fingerprint = `${req.body?.deviceFingerprint || ''}`.trim();
    if (!fingerprint) return '';
    return fingerprint.slice(0, 180);
};

const findDeviceByToken = (store, token) => {
    if (!token) return null;
    const tokenHash = hashToken(token);

    return (store.approvedDevices || []).find((device) => {
        if (!device || device.revokedAt) return false;
        if (device.tokenHash !== tokenHash) return false;
        if (!device.expiresAt) return false;
        return new Date(device.expiresAt).getTime() > Date.now();
    }) || null;
};

const trimStaleRequests = (store) => {
    const now = Date.now();
    const maxAgeMs = 48 * 60 * 60 * 1000;

    store.pendingRequests = (store.pendingRequests || []).filter((item) => {
        if (!item?.createdAt) return false;
        const age = now - new Date(item.createdAt).getTime();
        return Number.isFinite(age) && age <= maxAgeMs;
    }).slice(-MAX_PENDING_REQUESTS);
};

const listNetworkHints = (port) => {
    const interfaces = os.networkInterfaces();
    const ips = [];

    Object.values(interfaces).forEach((entries) => {
        (entries || []).forEach((entry) => {
            if (!entry || entry.family !== 'IPv4' || entry.internal) return;
            ips.push(entry.address);
        });
    });

    const uniqueIps = Array.from(new Set(ips));

    return {
        loopbackUrl: `http://127.0.0.1:${port}`,
        lanUrls: uniqueIps.map((ip) => `http://${ip}:${port}`),
    };
};

const sanitizeDeviceOutput = (device) => ({
    id: device.id,
    name: device.name,
    firstApprovedIp: device.firstApprovedIp,
    lastIp: device.lastIp,
    fingerprint: device.fingerprint,
    userAgent: device.userAgent,
    createdAt: device.createdAt,
    approvedAt: device.approvedAt,
    lastSeenAt: device.lastSeenAt,
    expiresAt: device.expiresAt,
    revokedAt: device.revokedAt || null,
});

const sanitizePendingOutput = (request) => ({
    id: request.id,
    status: request.status,
    ip: request.ip,
    name: request.name,
    fingerprint: request.fingerprint,
    userAgent: request.userAgent,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    approvedAt: request.approvedAt || null,
    rejectedAt: request.rejectedAt || null,
});

const requireDesktopOperator = (req, res, next) => {
    const ip = getClientIp(req);
    if (!isLoopbackIp(ip)) {
        return res.status(403).json({
            success: false,
            code: 'DESKTOP_ONLY_ENDPOINT',
            error: 'Este endpoint só pode ser usado no desktop local.',
        });
    }
    return next();
};

router.get('/device-access/public-state', (req, res) => {
    const store = readStore();
    const config = normalizeConfig(store.config);
    return res.json({
        success: true,
        config,
        networkHints: listNetworkHints(Number(process.env.AUTOTOOLS_SERVER_PORT || 3001)),
    });
});

router.get('/device-access/session', (req, res) => {
    const ip = getClientIp(req);
    const isLocalClient = isLoopbackIp(ip);
    const store = readStore();
    const config = normalizeConfig(store.config);

    if (isLocalClient) {
        return res.json({
            success: true,
            session: {
                isLocalClient: true,
                isApproved: true,
                reason: 'LOCAL_DESKTOP',
            },
            config,
            networkHints: listNetworkHints(Number(process.env.AUTOTOOLS_SERVER_PORT || 3001)),
        });
    }

    if (!config.remoteAccessEnabled) {
        return res.json({
            success: true,
            session: {
                isLocalClient: false,
                isApproved: false,
                reason: 'REMOTE_DISABLED',
            },
            config,
            networkHints: listNetworkHints(Number(process.env.AUTOTOOLS_SERVER_PORT || 3001)),
        });
    }

    if (!config.approvalRequired) {
        return res.json({
            success: true,
            session: {
                isLocalClient: false,
                isApproved: true,
                reason: 'APPROVAL_NOT_REQUIRED',
            },
            config,
            networkHints: listNetworkHints(Number(process.env.AUTOTOOLS_SERVER_PORT || 3001)),
        });
    }

    const token = getDeviceTokenFromRequest(req);
    const approvedDevice = findDeviceByToken(store, token);

    if (!approvedDevice) {
        return res.json({
            success: true,
            session: {
                isLocalClient: false,
                isApproved: false,
                reason: 'TOKEN_REQUIRED',
            },
            config,
            networkHints: listNetworkHints(Number(process.env.AUTOTOOLS_SERVER_PORT || 3001)),
        });
    }

    if (config.enforceIpMatch && approvedDevice.firstApprovedIp && approvedDevice.firstApprovedIp !== ip) {
        return res.json({
            success: true,
            session: {
                isLocalClient: false,
                isApproved: false,
                reason: 'IP_MISMATCH',
            },
            config,
            networkHints: listNetworkHints(Number(process.env.AUTOTOOLS_SERVER_PORT || 3001)),
        });
    }

    approvedDevice.lastSeenAt = new Date().toISOString();
    approvedDevice.lastIp = ip;
    writeStore(store);

    return res.json({
        success: true,
        session: {
            isLocalClient: false,
            isApproved: true,
            reason: 'TOKEN_VALID',
            device: sanitizeDeviceOutput(approvedDevice),
        },
        config,
        networkHints: listNetworkHints(Number(process.env.AUTOTOOLS_SERVER_PORT || 3001)),
    });
});

router.post('/device-access/request', (req, res) => {
    const ip = getClientIp(req);
    const store = readStore();
    const config = normalizeConfig(store.config);

    if (isLoopbackIp(ip)) {
        return res.json({
            success: true,
            isLocalClient: true,
            status: 'approved',
            message: 'Cliente local não precisa de autorização remota.',
        });
    }

    if (!config.remoteAccessEnabled) {
        return res.status(403).json({
            success: false,
            code: 'REMOTE_ACCESS_DISABLED',
            error: 'Acesso remoto está desativado pelo operador.',
        });
    }

    if (!config.approvalRequired) {
        return res.json({
            success: true,
            status: 'approved',
            message: 'Aprovação de dispositivo está desativada pelo operador.',
        });
    }

    trimStaleRequests(store);

    const fingerprint = parseDeviceFingerprint(req);
    const userAgent = `${req.headers['user-agent'] || ''}`.slice(0, 240);

    const existing = (store.pendingRequests || []).find((item) => {
        if (!item || item.status !== 'pending') return false;
        if (item.ip !== ip) return false;
        if (fingerprint && item.fingerprint === fingerprint) return true;
        return !fingerprint && item.userAgent === userAgent;
    });

    if (existing) {
        return res.json({
            success: true,
            status: existing.status,
            requestId: existing.id,
            requestKey: existing.requestKey,
            pollIntervalMs: 3000,
            createdAt: existing.createdAt,
        });
    }

    const createdAt = new Date().toISOString();
    const requestEntry = {
        id: crypto.randomUUID(),
        requestKey: crypto.randomBytes(18).toString('base64url'),
        status: 'pending',
        ip,
        fingerprint,
        name: parseDeviceName(req),
        userAgent,
        createdAt,
        updatedAt: createdAt,
        approvedAt: null,
        rejectedAt: null,
        approvedDeviceId: null,
        issuedToken: null,
        tokenExpiresAt: null,
    };

    store.pendingRequests.push(requestEntry);
    writeStore(store);

    return res.json({
        success: true,
        status: 'pending',
        requestId: requestEntry.id,
        requestKey: requestEntry.requestKey,
        pollIntervalMs: 3000,
        createdAt: requestEntry.createdAt,
    });
});

router.get('/device-access/request/:requestId/status', (req, res) => {
    const { requestId } = req.params;
    const requestKey = `${req.query.requestKey || ''}`.trim();

    if (!requestId || !requestKey) {
        return res.status(400).json({ success: false, error: 'requestId/requestKey são obrigatórios.' });
    }

    const store = readStore();
    trimStaleRequests(store);

    const pending = (store.pendingRequests || []).find((item) => item?.id === requestId && item?.requestKey === requestKey);
    if (!pending) {
        return res.status(404).json({ success: false, error: 'Solicitação não encontrada ou expirada.' });
    }

    if (pending.status === 'approved' && pending.issuedToken) {
        return res.json({
            success: true,
            status: 'approved',
            deviceToken: pending.issuedToken,
            tokenExpiresAt: pending.tokenExpiresAt,
            approvedDeviceId: pending.approvedDeviceId,
            approvedAt: pending.approvedAt,
        });
    }

    if (pending.status === 'rejected') {
        return res.json({
            success: true,
            status: 'rejected',
            rejectedAt: pending.rejectedAt,
        });
    }

    return res.json({
        success: true,
        status: 'pending',
        createdAt: pending.createdAt,
        updatedAt: pending.updatedAt,
    });
});

router.get('/device-access/config', requireDesktopOperator, (req, res) => {
    const store = readStore();
    return res.json({
        success: true,
        config: normalizeConfig(store.config),
        networkHints: listNetworkHints(Number(process.env.AUTOTOOLS_SERVER_PORT || 3001)),
    });
});

router.post('/device-access/config', requireDesktopOperator, (req, res) => {
    const store = readStore();
    const current = normalizeConfig(store.config);
    const payload = req.body || {};

    const nextConfig = normalizeConfig({
        remoteAccessEnabled: typeof payload.remoteAccessEnabled === 'boolean' ? payload.remoteAccessEnabled : current.remoteAccessEnabled,
        approvalRequired: typeof payload.approvalRequired === 'boolean' ? payload.approvalRequired : current.approvalRequired,
        enforceIpMatch: typeof payload.enforceIpMatch === 'boolean' ? payload.enforceIpMatch : current.enforceIpMatch,
        tokenTtlDays: Number.isFinite(Number(payload.tokenTtlDays)) ? Number(payload.tokenTtlDays) : current.tokenTtlDays,
        updatedAt: new Date().toISOString(),
    });

    store.config = nextConfig;
    writeStore(store);

    return res.json({
        success: true,
        config: nextConfig,
        networkHints: listNetworkHints(Number(process.env.AUTOTOOLS_SERVER_PORT || 3001)),
    });
});

router.get('/device-access/pending', requireDesktopOperator, (req, res) => {
    const store = readStore();
    trimStaleRequests(store);
    writeStore(store);

    const pending = (store.pendingRequests || [])
        .filter((item) => item?.status === 'pending')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .map(sanitizePendingOutput);

    return res.json({ success: true, pending });
});

router.get('/device-access/devices', requireDesktopOperator, (req, res) => {
    const store = readStore();
    const devices = (store.approvedDevices || [])
        .filter((item) => item && !item.revokedAt)
        .sort((a, b) => new Date(b.approvedAt || b.createdAt || 0).getTime() - new Date(a.approvedAt || a.createdAt || 0).getTime())
        .map(sanitizeDeviceOutput);

    return res.json({ success: true, devices });
});

router.post('/device-access/approve', requireDesktopOperator, (req, res) => {
    const { requestId } = req.body || {};
    const reqId = `${requestId || ''}`.trim();

    if (!reqId) {
        return res.status(400).json({ success: false, error: 'requestId é obrigatório.' });
    }

    const store = readStore();
    trimStaleRequests(store);

    const pending = (store.pendingRequests || []).find((item) => item?.id === reqId);
    if (!pending || pending.status !== 'pending') {
        return res.status(404).json({ success: false, error: 'Solicitação pendente não encontrada.' });
    }

    const config = normalizeConfig(store.config);
    const now = Date.now();
    const expiresAt = new Date(now + config.tokenTtlDays * 24 * 60 * 60 * 1000).toISOString();

    const token = createDeviceToken();
    const device = {
        id: crypto.randomUUID(),
        name: pending.name || 'Dispositivo aprovado',
        tokenHash: hashToken(token),
        firstApprovedIp: pending.ip,
        lastIp: pending.ip,
        fingerprint: pending.fingerprint || '',
        userAgent: pending.userAgent || '',
        createdAt: pending.createdAt || new Date().toISOString(),
        approvedAt: new Date().toISOString(),
        lastSeenAt: null,
        expiresAt,
        revokedAt: null,
    };

    pending.status = 'approved';
    pending.updatedAt = new Date().toISOString();
    pending.approvedAt = pending.updatedAt;
    pending.approvedDeviceId = device.id;
    pending.issuedToken = token;
    pending.tokenExpiresAt = expiresAt;

    store.approvedDevices.push(device);
    writeStore(store);

    return res.json({ success: true, approvedRequest: sanitizePendingOutput(pending), device: sanitizeDeviceOutput(device) });
});

router.post('/device-access/reject', requireDesktopOperator, (req, res) => {
    const { requestId } = req.body || {};
    const reqId = `${requestId || ''}`.trim();
    if (!reqId) {
        return res.status(400).json({ success: false, error: 'requestId é obrigatório.' });
    }

    const store = readStore();
    const pending = (store.pendingRequests || []).find((item) => item?.id === reqId);
    if (!pending || pending.status !== 'pending') {
        return res.status(404).json({ success: false, error: 'Solicitação pendente não encontrada.' });
    }

    pending.status = 'rejected';
    pending.updatedAt = new Date().toISOString();
    pending.rejectedAt = pending.updatedAt;

    writeStore(store);

    return res.json({ success: true, rejectedRequest: sanitizePendingOutput(pending) });
});

router.post('/device-access/revoke', requireDesktopOperator, (req, res) => {
    const { deviceId } = req.body || {};
    const id = `${deviceId || ''}`.trim();

    if (!id) {
        return res.status(400).json({ success: false, error: 'deviceId é obrigatório.' });
    }

    const store = readStore();
    const device = (store.approvedDevices || []).find((item) => item?.id === id && !item.revokedAt);
    if (!device) {
        return res.status(404).json({ success: false, error: 'Dispositivo não encontrado ou já revogado.' });
    }

    device.revokedAt = new Date().toISOString();
    writeStore(store);

    return res.json({ success: true, device: sanitizeDeviceOutput(device) });
});

export const deviceAccessGuard = (req, res, next) => {
    const apiPath = `${req.path || ''}`;

    // Endpoints públicos necessários para negociar/monitorar autorização.
    if (apiPath === '/status') return next();
    if (apiPath.startsWith('/device-access')) return next();

    const ip = getClientIp(req);
    if (isLoopbackIp(ip)) {
        return next();
    }

    const store = readStore();
    const config = normalizeConfig(store.config);

    if (!config.remoteAccessEnabled) {
        return res.status(403).json({
            success: false,
            code: 'REMOTE_ACCESS_DISABLED',
            error: 'Acesso remoto está desativado. Solicite habilitação no desktop.',
        });
    }

    if (!config.approvalRequired) {
        return next();
    }

    const token = getDeviceTokenFromRequest(req);
    if (!token) {
        return res.status(403).json({
            success: false,
            code: 'DEVICE_NOT_APPROVED',
            error: 'Dispositivo não autorizado. Solicite aprovação no desktop.',
        });
    }

    const device = findDeviceByToken(store, token);
    if (!device) {
        return res.status(403).json({
            success: false,
            code: 'DEVICE_TOKEN_INVALID',
            error: 'Token de dispositivo inválido ou expirado.',
        });
    }

    if (config.enforceIpMatch && device.firstApprovedIp && device.firstApprovedIp !== ip) {
        return res.status(403).json({
            success: false,
            code: 'DEVICE_IP_MISMATCH',
            error: 'Este dispositivo foi aprovado para outro IP. Refaça a autorização.',
        });
    }

    device.lastSeenAt = new Date().toISOString();
    device.lastIp = ip;
    writeStore(store);

    req.deviceAccess = {
        deviceId: device.id,
        deviceName: device.name,
        clientIp: ip,
    };

    return next();
};

export default router;
