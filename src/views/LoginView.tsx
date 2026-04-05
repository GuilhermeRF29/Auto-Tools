import React, { useState } from 'react';
import { motion, MotionConfig } from 'motion/react';
import { CheckCircle, Loader2 } from 'lucide-react';
import logoApp from '../../logo_app.png';

import { useAuth } from '../context/AuthContext';
import BackgroundAnimation from '../components/BackgroundAnimation';
import Button from '../components/Button';
import { cn } from '../utils/cn';

interface LoginViewProps {
  serverStatus: 'checking' | 'online' | 'offline';
  serverInfo: { version?: string } | null;
  animationsEnabled: boolean;
}

export default function LoginView({ serverStatus, serverInfo, animationsEnabled }: LoginViewProps) {
  const { setUser, isLoggingIn, logout } = useAuth(); // using global auth context
  const [internalIsLoggingIn, setInternalIsLoggingIn] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [authData, setAuthData] = useState({ user: '', pass: '', name: '' });

  const loadingState = isLoggingIn || internalIsLoggingIn;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setInternalIsLoggingIn(true);
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: authData.user, senha: authData.pass })
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Servidor respondeu com erro ${response.status}. Conteúdo: ${errText.substring(0, 50)}...`);
      }

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const badText = await response.text();
        throw new Error(`O servidor não retornou JSON corretamente. Ele retornou: ${badText.substring(0, 30)}...`);
      }

      const data = await response.json();
      if (data && data.success === true) {
        setUser(data.user);
      } else {
        const msg = data?.error || 'Erro desconhecido ao autenticar.';
        alert(msg + (data?.details ? "\n\nDetalhes:\n" + data.details : ""));
      }
    } catch (error: any) {
      alert('Erro ao conectar com o servidor: ' + (error.message || error));
    } finally {
      setInternalIsLoggingIn(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setInternalIsLoggingIn(true);
    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: authData.user, senha: authData.pass, nome: authData.name })
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Falha no registro: Status ${response.status}. Detalhes: ${errText.substring(0, 50)}...`);
      }

      const data = await response.json();
      if (data.success) {
        alert('Usuário criado! Agora faça login.');
        setIsRegistering(false);
      } else {
        alert(data.error + (data.details ? "\n\nDetalhes:\n" + data.details : ""));
      }
    } catch (error: any) {
      alert('Erro ao criar usuário / Conexão falhou: ' + (error.message || error));
    } finally {
      setInternalIsLoggingIn(false);
    }
  };

  return (
    <MotionConfig reducedMotion={animationsEnabled ? 'never' : 'always'}>
      <motion.div className={cn("flex min-h-screen w-full items-center justify-center font-sans p-4 sm:p-10 overflow-y-auto overflow-x-hidden relative bg-slate-50", !animationsEnabled && "animations-disabled")}>
        <BackgroundAnimation />
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30, duration: 0.6 }}
          className="flex w-full max-w-4xl h-auto min-h-[520px] my-auto overflow-hidden rounded-[2rem] shadow-2xl bg-white border border-slate-200 relative"
        >

        {/* Lado Esquerdo - Branding */}
        <div className="hidden md:flex w-1/3 bg-slate-900 relative p-8 text-white flex-col justify-between overflow-hidden">
          <div className="relative z-10">
            <div className="flex items-center gap-4 mb-10">
              <div className="w-12 h-12 flex items-center justify-center">
                <img src={logoApp} alt="AutoBot Logo" className="w-full h-full object-contain filter drop-shadow-lg" />
              </div>
              <h1 className="text-2xl font-black tracking-tight text-white">AUTO <span className="text-blue-500">TOOLS</span></h1>
            </div>
            <h2 className="text-2xl font-bold leading-tight mb-4">Automação Inteligente</h2>
            <p className="text-slate-400 text-sm">Acesse sua plataforma segura de relatórios.</p>
          </div>

          <div className="relative z-10 space-y-3">
            <div className="flex items-center gap-2 opacity-80 transition-all">
              {serverStatus === 'online' ? (
                <CheckCircle size={14} className="text-green-500" />
              ) : (
                <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse mx-1.5 shadow-[0_0_8px_rgba(239,44,44,0.5)]"></div>
              )}
              <span className="text-[11px] font-bold text-slate-300 tracking-tight">
                {serverStatus === 'online' ? 'Banco de Dados: Userbank.db' : 'Banco: Sistema Fora de Linha'}
              </span>
            </div>
            <div className="flex items-center gap-2 opacity-80 transition-all">
              {serverStatus === 'online' ? (
                <CheckCircle size={14} className="text-green-500" />
              ) : (
                <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse mx-1.5 shadow-[0_0_8px_rgba(239,44,44,0.5)]"></div>
              )}
              <span className="text-[11px] font-bold text-slate-300 tracking-tight">
                Servidor: {serverStatus === 'online' ? (serverInfo?.version || 'Rodando (v1.5.0)') : 'Servidor Desconectado'}
              </span>
            </div>
          </div>

          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/20 rounded-full blur-3xl -mr-16 -mt-16"></div>
        </div>

        {/* Lado Direito - Formulário */}
        <div className="flex-1 p-8 sm:p-12 flex flex-col justify-center overflow-y-auto custom-scrollbar">
          <div className="max-w-xs mx-auto w-full">
            {/* Logo Mobile */}
            <div className="flex flex-col items-center mb-6 md:hidden animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-50 border border-slate-200 mb-6 shadow-sm overflow-hidden">
                <div className={`w-1.5 h-1.5 rounded-full ${serverStatus === 'online' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500 animate-pulse'}`}></div>
                <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest truncate max-w-[150px]">
                  {serverStatus === 'online' ? 'Infra Ativa: ' + (serverInfo?.version || 'V1.5.0') : 'Offline - Verifique Conexão'}
                </span>
              </div>
              <div className="w-16 h-16 mb-3">
                <img src={logoApp} alt="Logo" className="w-full h-full object-contain drop-shadow-sm" />
              </div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase">AUTO <span className="text-blue-500">TOOLS</span></h1>
              <div className="relative mt-2">
                <div className="h-1.5 w-16 bg-blue-600 rounded-full relative z-10"></div>
                <div className="absolute inset-0 bg-blue-600 blur-xl opacity-40 -top-4 scale-x-150"></div>
              </div>
            </div>

            <h3 className="text-2xl font-bold text-slate-800 mb-1 flex items-center justify-between">
              <span>{isRegistering ? 'Nova Conta' : 'Acessar'}</span>
            </h3>
            <p className="text-slate-500 text-sm mb-6">
              {isRegistering ? 'Preencha os dados abaixo' : 'Insira suas credenciais'}
            </p>

            <form onSubmit={isRegistering ? handleRegister : handleLogin} className="space-y-4">
              {isRegistering && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Seu Nome</label>
                  <input
                    required
                    type="text"
                    value={authData.name}
                    onChange={e => setAuthData({ ...authData, name: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg p-3 text-base outline-none focus:ring-2 focus:ring-blue-500 transition-all bg-slate-50 font-medium"
                    placeholder="João Silva"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Usuário / ID</label>
                <input
                  required
                  type="text"
                  value={authData.user}
                  onChange={e => setAuthData({ ...authData, user: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg p-3 text-base outline-none focus:ring-2 focus:ring-blue-500 transition-all bg-slate-50 font-medium"
                  placeholder="ex: admin"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 px-1 uppercase tracking-widest opacity-80">Senha</label>
                <input
                  required
                  type="password"
                  value={authData.pass}
                  onChange={e => setAuthData({ ...authData, pass: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg p-3 text-base outline-none focus:ring-2 focus:ring-blue-500 transition-all bg-slate-50 font-medium font-mono"
                  placeholder="••••••••"
                />
              </div>

              <Button type="submit" disabled={loadingState} className="w-full py-4 text-sm font-black uppercase tracking-[0.15em] shadow-xl shadow-blue-500/30 mt-4 rounded-2xl hover:scale-[1.02] transition-all duration-300">
                {loadingState ? (
                  <><Loader2 size={18} className="animate-spin mr-2" /> Carregando...</>
                ) : (
                  isRegistering ? 'CADASTRAR CONTA' : 'ACESSAR AGORA'
                )}
              </Button>
            </form>

            <div className="mt-4 text-center">
              <button
                onClick={() => setIsRegistering(!isRegistering)}
                className="text-[11px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-800 transition-colors"
                type="button"
              >
                {isRegistering ? 'Voltar ao Login' : 'Criar nova conta corporativa'}
              </button>
            </div>
          </div>
        </div>
        </motion.div>
      </motion.div>
    </MotionConfig>
  );
}
