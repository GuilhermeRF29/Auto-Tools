import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, CheckCircle2, Download, RefreshCw, XCircle } from 'lucide-react';
import { useUI } from '../context/UIContext';
import Button from './Button';

export default function UpdateOverlay() {
  const { updateStatus, applyUpdate, currentView } = useUI();

  if (!updateStatus.isUpdating && !updateStatus.hasUpdate) return null;

  // Se houver atualização mas o usuário ainda não clicou em "Atualizar",
  // ocultamos o popup flutuante na tela de "Início" (dashboard) 
  // e na tela de login (que também usa o estado inicial 'dashboard'), 
  // pois eles já possuem os alertas na própria interface.
  const isBlocking = updateStatus.isUpdating || updateStatus.isCompleted;
  const hideFloating = currentView === 'dashboard';

  return (
    <AnimatePresence>
      {isBlocking && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-6"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="w-full max-w-md bg-white rounded-[2.5rem] p-10 shadow-2xl text-center relative overflow-hidden"
          >
            {/* Background Glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-40 bg-blue-500/10 blur-[60px] rounded-full" />

            <div className="relative z-10">
              {updateStatus.isUpdating && !updateStatus.isCompleted && (
                <>
                  <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center mx-auto mb-8 animate-pulse">
                    <Loader2 className="text-blue-600 animate-spin" size={40} />
                  </div>
                  <h2 className="text-2xl font-black text-slate-900 mb-3 uppercase tracking-tight">Atualizando Sistema</h2>
                  <p className="text-slate-500 text-sm leading-relaxed mb-6 px-4">
                    Baixando a versão <span className="font-bold text-slate-900">{updateStatus.remoteVersion}</span> diretamente do GitHub. 
                    Por favor, não feche o programa.
                  </p>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mb-2">
                    <motion.div 
                      className="bg-blue-600 h-full"
                      initial={{ width: "0%" }}
                      animate={{ width: "100%" }}
                      transition={{ duration: 15, ease: "linear" }}
                    />
                  </div>
                  <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Processando arquivos...</span>
                </>
              )}

              {updateStatus.isCompleted && (
                <>
                  <motion.div 
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="w-20 h-20 bg-emerald-50 rounded-3xl flex items-center justify-center mx-auto mb-8"
                  >
                    <CheckCircle2 className="text-emerald-600" size={40} />
                  </motion.div>
                  <h2 className="text-2xl font-black text-slate-900 mb-3 uppercase tracking-tight">Tudo Pronto!</h2>
                  <p className="text-slate-500 text-sm leading-relaxed mb-8 px-4">
                    A atualização foi concluída com sucesso. O aplicativo irá reiniciar automaticamente em instantes.
                  </p>
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="text-slate-300 animate-spin" size={16} />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Reiniciando...</span>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Notificação flutuante se houver atualização mas não estiver bloqueando */}
      {!isBlocking && updateStatus.hasUpdate && !hideFloating && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-8 right-8 z-[500] max-w-sm"
        >
          <div className="bg-white rounded-3xl shadow-2xl border border-blue-100 p-6 flex items-start gap-4">
            <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center flex-shrink-0">
              <RefreshCw className="text-blue-600" size={24} />
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight mb-1">Atualização Disponível</h4>
              <p className="text-[11px] text-slate-500 leading-normal mb-4">
                Uma nova versão (<span className="font-bold text-slate-800">{updateStatus.remoteVersion}</span>) está pronta no GitHub.
              </p>
              <div className="flex items-center gap-2">
                <Button 
                  onClick={applyUpdate}
                  className="py-2 px-4 text-[10px] font-black uppercase tracking-widest rounded-xl shadow-lg shadow-blue-500/20"
                >
                  <Download size={12} className="mr-2" /> Reiniciar e Atualizar
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
