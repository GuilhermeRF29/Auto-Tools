import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import { getRootDir } from '../config.js';

const getDbPath = () => {
    const dataDir = process.env.AUTOTOOLS_DATA_DIR || getRootDir();
    return path.join(dataDir, 'Userbank.db');
};

class NativeSQLite {
    constructor() {
        this.db = null;
    }

    _ensureDb() {
        if (!this.db || !this.db.open) {
            const dbPath = getDbPath();
            this.db = new Database(dbPath);
            this.db.pragma('journal_mode = WAL');
            this.db.pragma('synchronous = NORMAL');
            
            // Garantir que a tabela de refresh tokens exista
            this.db.prepare(`
                CREATE TABLE IF NOT EXISTS refresh_tokens (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    token TEXT UNIQUE,
                    expires_at INTEGER,
                    FOREIGN KEY(user_id) REFERENCES usuarios(id)
                )
            `).run();

            // Garantir que a tabela de configuracoes exista
            this.db.prepare(`
                CREATE TABLE IF NOT EXISTS configuracoes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    chave TEXT NOT NULL,
                    valor TEXT,
                    UNIQUE(user_id, chave)
                )
            `).run();
        }
        return this.db;
    }

    _close() {
        if (this.db && this.db.open) {
            this.db.close();
            this.db = null;
        }
    }

    validateLogin(usuario, senha) {
        const db = this._ensureDb();
        const row = db.prepare('SELECT id, nome, senha, usuario FROM usuarios WHERE usuario = ?').get(usuario);
        if (!row) return null;

        const senhaArmazenada = typeof row.senha === 'string' ? row.senha : '';
        if (senhaArmazenada.startsWith('$2')) {
            const match = bcrypt.compareSync(senha, senhaArmazenada);
            if (match) return { id: row.id, nome: row.nome, usuario: row.usuario };
        } else if (senhaArmazenada === senha) {
            const hash = bcrypt.hashSync(senha, 10);
            db.prepare('UPDATE usuarios SET senha = ? WHERE id = ?').run(hash, row.id);
            return { id: row.id, nome: row.nome, usuario: row.usuario };
        }
        return null;
    }

    saveRefreshToken(userId, token, expiresInMs) {
        const db = this._ensureDb();
        const expiresAt = Date.now() + expiresInMs;
        db.prepare('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)').run(userId, token, expiresAt);
    }

    validateRefreshToken(token) {
        const db = this._ensureDb();
        const row = db.prepare('SELECT user_id, expires_at FROM refresh_tokens WHERE token = ?').get(token);
        if (!row) return null;
        if (Date.now() > row.expires_at) {
            this.deleteRefreshToken(token);
            return null;
        }
        const userRow = db.prepare('SELECT id, nome, usuario FROM usuarios WHERE id = ?').get(row.user_id);
        return userRow || null;
    }

    deleteRefreshToken(token) {
        const db = this._ensureDb();
        db.prepare('DELETE FROM refresh_tokens WHERE token = ?').run(token);
    }

    listCredentials(userId) {
        const db = this._ensureDb();
        const rows = db.prepare('SELECT id, servico, login_acesso, senha_acesso FROM acessos WHERE user_id = ?').all(userId);
        return rows.map(r => ({
            id: r.id, site: r.servico, user: r.login_acesso, pass: r.senha_acesso, type: 'system', url: null
        }));
    }

    listCustomCredentials(userId) {
        const db = this._ensureDb();
        const rows = db.prepare('SELECT id, nome_site, url_site, login_acesso, senha_acesso FROM acessos_personalizados WHERE user_id = ?').all(userId);
        return rows.map(r => ({
            id: r.id, site: r.nome_site, url_custom: r.url_site, user: r.login_acesso, pass: r.senha_acesso, type: 'custom'
        }));
    }

    getRelatoriosHistory(limit = 50, userId = null) {
        const db = this._ensureDb();
        let query = 'SELECT id, nome_automacao, data_execucao, parametros_json, arquivo_nome, arquivo_path_backup, status, COALESCE(log_output, \'\') as log_output, job_id FROM relatorios_history';
        const params = [];

        if (userId) {
            query += ' WHERE user_id = ?';
            params.push(userId);
        }

        query += ' ORDER BY data_execucao DESC';
        if (limit) {
            query += ' LIMIT ?';
            params.push(limit);
        }

        const rows = db.prepare(query).all(...params);
        return rows.map(r => ({
            id: r.id,
            nome_automacao: r.nome_automacao,
            data: r.data_execucao,
            params: this._safeJson(r.parametros_json),
            arquivo_nome: r.arquivo_nome,
            path_backup: r.arquivo_path_backup,
            status: r.status,
            log_output: r.log_output || '',
            job_id: r.job_id || null
        }));
    }

    _safeJson(str) {
        if (!str) return {};
        try { return JSON.parse(str); } catch { return {}; }
    }

    deleteRelatorioHistory(id) {
        const db = this._ensureDb();
        const info = db.prepare('DELETE FROM relatorios_history WHERE id = ?').run(id);
        return info.changes > 0;
    }

    healthCheck() {
        try {
            const db = this._ensureDb();
            const row = db.prepare('SELECT 1 as val').get();
            return { status: 'ok', message: 'Conexao validada' };
        } catch (e) {
            return { status: 'error', message: e.message };
        }
    }

    getSettings(userId) {
        const db = this._ensureDb();
        const rows = db.prepare('SELECT chave, valor FROM configuracoes WHERE user_id = ?').all(userId);
        const result = {};
        for (const row of rows) {
            try {
                result[row.chave] = JSON.parse(row.valor);
            } catch {
                result[row.chave] = row.valor;
            }
        }
        return result;
    }

    saveSetting(userId, key, value) {
        const db = this._ensureDb();
        db.prepare('INSERT OR REPLACE INTO configuracoes (user_id, chave, valor) VALUES (?, ?, ?)').run(userId, key, value);
    }
}

let _instance = null;
export const getDb = () => {
    if (!_instance) _instance = new NativeSQLite();
    return _instance;
};

export default NativeSQLite;
