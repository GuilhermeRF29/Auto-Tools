/**
 * @module VaultView
 * @description Cofre de Senhas com criptografia Fernet.
 * Fluxo: Bloqueado → Desbloqueio via senha mestre → Lista de credenciais
 * Suporta credenciais de sistema (EBUS, ADM) e personalizadas.
 */
import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Lock, ShieldCheck, Key, Copy, Trash2, Eye, EyeOff,
  Plus, ChevronRight, ChevronDown, LayoutDashboard, Home
} from 'lucide-react';
import { cn } from '../utils/cn';
import { PREDEFINED_SITES } from '../types';
import Card from '../components/Card';
import Button from '../components/Button';
import Modal from '../components/Modal';
import { useDialog } from '../context/DialogContext';
import {
  authenticateWithWindowsHello,
  clearWindowsHelloHint,
  getWindowsHelloHint,
  isWindowsHelloAvailable,
} from '../utils/windowsHello';

const VaultView = ({
  currentUser,
  windowsHelloEnabled,
}: {
  currentUser: any;
  windowsHelloEnabled?: boolean;
}) => {
  const { showAlert, showConfirm } = useDialog();
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isLocking, setIsLocking] = useState(false);
  const [isWindowsHelloUnlocking, setIsWindowsHelloUnlocking] = useState(false);
  const [password, setPassword] = useState('');
  const [credentials, setCredentials] = useState<any[]>([]);
  const [showPassword, setShowPassword] = useState<number | null | string>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newCred, setNewCred] = useState({ site: '', user: '', pass: '', customSite: '', customName: '' });
  const [isSiteDropdownOpen, setIsSiteDropdownOpen] = useState(false);
  const siteDropdownRef = useRef<HTMLDivElement>(null);
  const windowsHelloHint = getWindowsHelloHint();
  const canUseWindowsHello = Boolean(
    isWindowsHelloAvailable()
    && windowsHelloHint?.biometricToken
    && windowsHelloHint.userId === currentUser?.id
  );

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (siteDropdownRef.current && !siteDropdownRef.current.contains(event.target as Node)) {
        setIsSiteDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /** Busca credenciais descriptografadas do backend. */
  const fetchCredentials = async () => {
    try {
      const response = await fetch(`/api/credentials/${currentUser.id}`);
      const data = await response.json();
      if (Array.isArray(data)) {
        setCredentials(data);
      } else {
        console.error("Erro: Retorno do servidor não é um array", data);
        setCredentials([]);
      }
    } catch (error) {
      console.error("Erro ao buscar credenciais:", error);
      setCredentials([]);
    }
  };

  useEffect(() => {
    if (isUnlocked) fetchCredentials();
  }, [isUnlocked]);

  const handleWindowsHelloUnlock = async (silent = false) => {
    const hint = getWindowsHelloHint();
    if (!hint?.biometricToken || hint.userId !== currentUser?.id) {
      if (!silent) {
        await showAlert({
          title: 'Windows Hello Indisponível',
          message: 'Token do Windows Hello indisponível para este usuário. Reative em Configurações.',
          tone: 'warning',
        });
      }
      return;
    }

    setIsWindowsHelloUnlocking(true);
    try {
      const authenticatedUser = await authenticateWithWindowsHello(hint.biometricToken);
      if (authenticatedUser?.id !== currentUser?.id) {
        throw new Error('Credencial biométrica não corresponde ao usuário logado.');
      }

      setIsUnlocking(true);
      setTimeout(() => {
        setIsUnlocked(true);
        setIsUnlocking(false);
      }, 500);
    } catch (e: any) {
      const message = e?.message || 'Falha na autenticação biométrica do cofre.';
      if (/token biométrico inválido|expirado|não encontrada|não encontrado|reative/i.test(message)) {
        clearWindowsHelloHint();
        await showAlert({
          title: 'Sessão Expirada',
          message: 'Sua sessão biométrica local expirou ou foi invalidada. Por favor, reative o Windows Hello nas Configurações.',
          tone: 'warning'
        });
      } else if (!silent) {
        await showAlert({
          title: 'Falha no Desbloqueio',
          message: 'Não foi possível desbloquear com Windows Hello: ' + message,
          tone: 'danger',
        });
      }
    } finally {
      setIsWindowsHelloUnlocking(false);
    }
  };

  /** Valida a senha mestre (re-autentica com o backend). */
  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: currentUser.usuario, senha: password })
      });
      const data = await response.json();
      if (data.success) {
        setIsUnlocking(true);
        setTimeout(() => {
          setIsUnlocked(true);
          setIsUnlocking(false);
        }, 800);
      } else {
        await showAlert({ title: 'Senha Incorreta', message: 'A senha informada está incorreta.', tone: 'danger' });
      }
    } catch (error) {
      await showAlert({ title: 'Erro de Validação', message: 'Erro ao validar senha.', tone: 'danger' });
    }
  };

  /** Trava o cofre com animação de saída. */
  const handleLock = () => {
    setIsLocking(true);
    setTimeout(() => {
      setIsUnlocked(false);
      setIsLocking(false);
      setPassword('');
      setShowPassword(null);
    }, 600);
  };

  /** Adiciona uma nova credencial (sistema ou personalizada). */
  const handleAddCred = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCred.site) {
      await showAlert({ title: 'Destino Obrigatório', message: 'Selecione o destino.', tone: 'warning' });
      return;
    }

    const isCustom = newCred.site === 'SITE PRÓPRIO';
    const siteDisplayName = isCustom ? (newCred.customName || newCred.customSite) : newCred.site;
    const siteUrl = isCustom ? newCred.customSite : '';

    try {
      await fetch('/api/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUser.id,
          servico: siteDisplayName,
          login: newCred.user,
          senha: newCred.pass,
          eh_personalizado: isCustom,
          url: siteUrl
        })
      });
      setIsAdding(false);
      setNewCred({ site: '', user: '', pass: '', customSite: '', customName: '' });
      fetchCredentials();
    } catch (error) {
      await showAlert({ title: 'Erro ao Salvar', message: 'Erro ao salvar.', tone: 'danger' });
    }
  };

  /** Exclui uma credencial com confirmação. */
  const handleDelete = async (id: number, type: string) => {
    const confirmed = await showConfirm({
      title: 'Excluir Credencial',
      message: 'Excluir esta credencial? Esta ação não pode ser desfeita.',
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
      tone: 'warning',
    });
    if (!confirmed) return;

    await fetch(`/api/credentials/${id}?type=${type}`, { method: 'DELETE' });
    fetchCredentials();
  };

  /** Abre o site associado à credencial em nova aba. */
  const openSite = (cred: any) => {
    if (cred.type === 'system') {
      const predefined = PREDEFINED_SITES.find(s => s.name === cred.site);
      if (predefined) window.open(predefined.url, '_blank');
    } else {
      const url = cred.url_custom || cred.site;
      if (url.includes('.') || url.includes('http')) {
        const fullUrl = url.startsWith('http') ? url : `https://${url}`;
        window.open(fullUrl, '_blank');
      }
    }
  };

  return (
    <AnimatePresence mode="wait">
      {!isUnlocked ? (
        /* === TELA DE BLOQUEIO === */
        <motion.div
          key="locked"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.05, filter: 'blur(20px)' }}
          transition={{ duration: 0.5 }}
          className="h-[60vh] flex items-center justify-center p-4"
        >
          <Card className={cn(
            "w-full max-w-md p-10 text-center relative",
            isUnlocking && "pointer-events-none"
          )}>
            <div className="relative w-20 h-20 mx-auto mb-6">
              <div className={`absolute inset-0 bg-slate-100 rounded-full flex items-center justify-center transition-all duration-500 ${isUnlocking ? 'scale-150 opacity-0' : 'scale-100 opacity-100'}`}>
                <Lock size={32} className="text-slate-400" />
              </div>
              {isUnlocking && (
                <div className="absolute inset-0 bg-green-100 rounded-full flex items-center justify-center animate-in zoom-in duration-300">
                  <ShieldCheck size={32} className="text-green-600" />
                </div>
              )}
            </div>

            <div className={`${isUnlocking ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'} transition-all duration-500 delay-100`}>
              <h2 className="text-2xl font-black text-slate-800 mb-2">Cofre de Senhas</h2>
              <p className="text-slate-500 mb-8 text-xs font-medium">Insira sua chave mestre para acessar as credenciais.</p>

              <form onSubmit={handleUnlock} className="space-y-6">
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors">
                    <Key size={18} />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="PALAVRA-CHAVE MESTRE"
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl pl-12 pr-4 py-4 text-center text-sm font-bold tracking-[0.2em] focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white transition-all outline-none uppercase placeholder:text-slate-300 placeholder:tracking-normal placeholder:font-medium"
                    autoFocus
                  />
                </div>
                <Button type="submit" className="w-full py-4 text-xs font-black uppercase tracking-widest bg-slate-900 hover:bg-black shadow-xl shadow-slate-200 rounded-2xl transition-all active:scale-95">
                  DESBLOQUEAR COFRE
                </Button>

                {(windowsHelloEnabled || canUseWindowsHello) && (
                  <Button
                    type="button"
                    disabled={isWindowsHelloUnlocking || isUnlocking}
                    onClick={() => handleWindowsHelloUnlock(false)}
                    className="w-full py-3 text-xs font-black uppercase tracking-widest border-2 !border-emerald-800 !bg-emerald-700 !text-white rounded-2xl hover:!bg-emerald-800 transition-all"
                  >
                    {isWindowsHelloUnlocking ? 'VALIDANDO BIOMETRIA...' : 'USAR WINDOWS HELLO / DIGITAL'}
                  </Button>
                )}
              </form>
            </div>
          </Card>
        </motion.div>
      ) : (
        /* === TELA DESBLOQUEADA === */
        <motion.div
          key="unlocked"
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.5 }}
          className="space-y-8 pb-20"
        >
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 bg-slate-100 rounded-xl text-slate-500">
                  <Lock size={20} />
                </div>
                <h2 className="text-2xl font-black text-slate-800 tracking-tight text-xl">Cofre de Segurança</h2>
              </div>
              <p className="text-slate-500 text-[11px] font-bold ml-12 uppercase tracking-tighter opacity-70">Total de {Array.isArray(credentials) ? credentials.length : 0} credenciais ativas</p>
            </div>
            <div className="flex gap-4">
              <button
                onClick={handleLock}
                className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-white border-2 border-slate-100 text-slate-500 font-bold text-xs hover:bg-slate-50 hover:border-slate-200 transition-all active:scale-95"
              >
                <Lock size={16} /> BLOQUEAR
              </button>
              <button
                onClick={() => setIsAdding(true)}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-blue-600 text-white font-black text-xs hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 active:scale-95"
              >
                <Plus size={18} /> NOVA CREDENCIAL
              </button>
            </div>
          </div>

          {/* Tabela de credenciais */}
          <div className="grid grid-cols-1 gap-6">
            <Card className="border-none shadow-none bg-transparent">
              <div className="overflow-hidden bg-white border border-slate-200 rounded-[2rem] shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left min-w-[800px]">
                    <thead>
                      <tr className="bg-slate-50/80 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 font-mono">
                        <th className="px-8 py-5">Identificação / Site</th>
                        <th className="px-8 py-5">Credencial</th>
                        <th className="px-8 py-5">Senha</th>
                        <th className="px-8 py-5 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 text-xs">
                      {!Array.isArray(credentials) || credentials.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-8 py-20 text-center text-slate-400 font-medium italic">
                            Nenhuma credencial cadastrada.
                          </td>
                        </tr>
                      ) : (
                        credentials.map((cred) => (
                          <tr key={`${cred.type}-${cred.id}`} className="group hover:bg-slate-50/50 transition-colors">
                            <td className="px-8 py-5">
                              <div
                                onClick={() => openSite(cred)}
                                className="flex items-center gap-3 cursor-pointer group/site w-fit"
                              >
                                <div className={`p-2.5 rounded-xl ${cred.type === 'system' ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'} transition-transform group-hover/site:scale-105`}>
                                  {cred.type === 'system' ? <LayoutDashboard size={20} /> : <Home size={20} />}
                                </div>
                                <div>
                                  <div className="font-bold text-slate-800 text-sm group-hover/site:text-blue-600 transition-all flex items-center gap-1.5">
                                    {cred.site}
                                    <ChevronRight size={12} className="opacity-0 -translate-x-2 group-hover/site:opacity-100 group-hover/site:translate-x-0 transition-all text-blue-400" />
                                  </div>
                                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">
                                    {cred.type === 'system' ? 'Sistema AutoBot' : (cred.url_custom || 'Site Próprio')}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="px-8 py-5">
                              <div className="font-mono text-xs text-slate-700 font-bold bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 w-fit">
                                {cred.user}
                              </div>
                            </td>
                            <td className="px-8 py-5">
                              <div className="flex items-center gap-2">
                                <span className={`font-mono text-xs tracking-wider transition-all ${showPassword === `${cred.type}-${cred.id}` ? 'text-blue-700 font-bold' : 'text-slate-400'}`}>
                                  {showPassword === `${cred.type}-${cred.id}` ? cred.pass : '••••••••••••'}
                                </span>
                                <button
                                  onClick={() => setShowPassword(showPassword === `${cred.type}-${cred.id}` ? null : `${cred.type}-${cred.id}`)}
                                  className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                  {showPassword === `${cred.type}-${cred.id}` ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                              </div>
                            </td>
                            <td className="px-8 py-5 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={async () => {
                                    navigator.clipboard.writeText(cred.pass);
                                    await showAlert({ title: 'Copiado', message: 'Senha copiada!', tone: 'success' });
                                  }}
                                  className="p-2 text-slate-400 hover:text-blue-700 transition-all"
                                  title="Copiar"
                                >
                                  <Copy size={18} />
                                </button>
                                <button
                                  onClick={() => handleDelete(cred.id, cred.type)}
                                  className="p-2 text-slate-400 hover:text-red-600 transition-all"
                                  title="Excluir"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          </div>

          {/* Modal de adição de credencial */}
          <Modal isOpen={isAdding} onClose={() => setIsAdding(false)} title="Nova Credencial">
            <div className="-mt-6 mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-3">
              <div className="p-2 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-200">
                <ShieldCheck size={20} />
              </div>
              <div>
                <h4 className="text-sm font-black text-slate-800 tracking-tight">Segurança de Dados</h4>
                <p className="text-[10px] text-slate-500 font-medium">As informações serão criptografadas antes do salvamento.</p>
              </div>
            </div>

            <form onSubmit={handleAddCred} className="space-y-5">
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1.5 overflow-visible">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Tipo de Acesso</label>
                  <div className="relative" ref={siteDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setIsSiteDropdownOpen(!isSiteDropdownOpen)}
                      className="w-full bg-white border-2 border-slate-100 rounded-2xl px-5 py-3.5 text-sm font-black text-slate-700 flex items-center justify-between hover:border-slate-300 transition-all shadow-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10"
                    >
                      <div className="flex items-center gap-3">
                        {newCred.site ? (
                          <>
                            <div className={`p-1.5 rounded-lg ${newCred.site === 'SITE PRÓPRIO' ? 'bg-indigo-50 text-indigo-600' : 'bg-blue-50 text-blue-600'}`}>
                              {newCred.site === 'SITE PRÓPRIO' ? <Home size={16} /> : <LayoutDashboard size={16} />}
                            </div>
                            <span className="truncate max-w-[200px]">{newCred.site}</span>
                          </>
                        ) : (
                          <span className="text-slate-400 font-bold">Selecione o destino...</span>
                        )}
                      </div>
                      <ChevronDown size={20} className={`text-slate-400 transition-transform duration-300 shrink-0 ${isSiteDropdownOpen ? 'rotate-180 text-blue-600' : ''}`} />
                    </button>

                    {isSiteDropdownOpen && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-slate-100 rounded-2xl shadow-2xl p-2 z-[60] max-h-56 overflow-y-auto animate-in slide-in-from-top-2 duration-300">
                        <div className="grid grid-cols-1 gap-1">
                          {PREDEFINED_SITES.map(s => (
                            <button
                              key={s.name}
                              type="button"
                              onClick={() => {
                                setNewCred({ ...newCred, site: s.name });
                                setIsSiteDropdownOpen(false);
                              }}
                              className={`w-full text-left px-4 py-2 rounded-xl flex items-center gap-3 transition-all ${newCred.site === s.name ? 'bg-blue-50 text-blue-700 font-black' : 'hover:bg-slate-50 text-slate-600'}`}
                            >
                              <div className={`p-1.5 rounded-lg ${newCred.site === s.name ? 'bg-blue-100' : 'bg-slate-100 opacity-70'}`}>
                                <LayoutDashboard size={14} />
                              </div>
                              <span className="font-bold text-[11px] truncate">{s.name} (SISTEMA)</span>
                            </button>
                          ))}
                          <div className="h-[1px] bg-slate-100 my-1 mx-2"></div>
                          <button
                            type="button"
                            onClick={() => {
                              setNewCred({ ...newCred, site: 'SITE PRÓPRIO' });
                              setIsSiteDropdownOpen(false);
                            }}
                            className={`w-full text-left px-4 py-2 rounded-xl flex items-center gap-3 transition-all ${newCred.site === 'SITE PRÓPRIO' ? 'bg-indigo-50 text-indigo-700 font-black' : 'hover:bg-indigo-50/50 text-slate-600 font-bold'}`}
                          >
                            <div className={`p-1.5 rounded-lg ${newCred.site === 'SITE PRÓPRIO' ? 'bg-indigo-100' : 'bg-indigo-100/50'}`}>
                              <Home size={14} />
                            </div>
                            <span className="font-bold text-[11px]">PROPRIO / PERSONALIZADO</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {newCred.site === 'SITE PRÓPRIO' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in slide-in-from-top-2 duration-300">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Nome de Exibição (Opcional)</label>
                      <input
                        type="text"
                        value={newCred.customName}
                        onChange={e => setNewCred({ ...newCred, customName: e.target.value })}
                        placeholder="Ex: Banco do Brasil"
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3.5 text-sm font-bold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white transition-all outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">URL do Site</label>
                      <input
                        required
                        type="text"
                        value={newCred.customSite}
                        onChange={e => setNewCred({ ...newCred, customSite: e.target.value })}
                        placeholder="Ex: bb.com.br"
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3.5 text-sm font-bold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white transition-all outline-none"
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Usuário / Login</label>
                    <input
                      required
                      type="text"
                      value={newCred.user}
                      onChange={e => setNewCred({ ...newCred, user: e.target.value })}
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3.5 text-sm font-bold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white transition-all outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Senha</label>
                    <input
                      required
                      type="text"
                      value={newCred.pass}
                      onChange={e => setNewCred({ ...newCred, pass: e.target.value })}
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3.5 text-sm font-bold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white transition-all outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-6 py-3 rounded-2xl bg-slate-50 text-slate-500 font-bold text-xs hover:bg-slate-100 transition-all active:scale-95"
                >
                  CANCELAR
                </button>
                <button
                  type="submit"
                  className="px-8 py-3 rounded-2xl bg-slate-900 text-white font-black text-xs hover:bg-black transition-all shadow-lg shadow-slate-200 active:scale-95"
                >
                  SALVAR ACESSO
                </button>
              </div>
            </form>
          </Modal>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default VaultView;
