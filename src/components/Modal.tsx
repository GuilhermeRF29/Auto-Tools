/**
 * @module Modal
 * @description Modal genérico com animação de entrada via Framer Motion.
 * Suporta título, conteúdo (children), rodapé opcional e overlay com backdrop-blur.
 */
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';

const Modal = ({ isOpen, onClose, title, children, footer }: any) => {
  if (!isOpen) return null;
  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg flex flex-col relative border border-slate-200 overflow-visible my-auto"
        >
          {/* Cabeçalho do modal */}
          <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-white rounded-t-[2rem]">
            <h3 className="text-lg font-bold text-slate-800 tracking-tight">{title}</h3>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
              <X size={20} />
            </button>
          </div>
          {/* Corpo do modal */}
          <div className="px-6 py-4 overflow-visible relative">
            <div className="overflow-visible">
              {children}
            </div>
          </div>
          {/* Rodapé opcional (botões de ação) */}
          {footer && (
            <div className="px-6 py-4 border-t border-slate-100 bg-white rounded-b-[2rem] shrink-0">
              {footer}
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default Modal;
