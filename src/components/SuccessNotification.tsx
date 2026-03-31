/**
 * @module SuccessNotification
 * @description Notificação elegante flutuante no topo da tela.
 * Sai da modal com animação fluida e desaparece elegantemente após alguns segundos.
 */
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle, X } from 'lucide-react';

interface SuccessNotificationProps {
  isVisible: boolean;
  title?: string;
  message?: string;
  onClose: () => void;
  duration?: number;
}

const SuccessNotification = ({
  isVisible,
  title = 'Tarefa Iniciada!',
  message = 'Você pode acompanhar o progresso na tela de relatórios.',
  onClose,
  duration = 4000
}: SuccessNotificationProps) => {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -100, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -50, scale: 0.95 }}
          transition={{
            type: 'spring',
            stiffness: 300,
            damping: 30,
            mass: 0.8
          }}
          className="fixed top-6 left-1/2 -translate-x-1/2 z-[120] pointer-events-auto"
          onAnimationComplete={async () => {
            // Aguarda a duração e depois sai
            await new Promise(resolve => setTimeout(resolve, duration));
            onClose();
          }}
        >
          {/* Notificação Principal */}
          <motion.div
            className="flex items-center gap-4 px-6 py-4 bg-white rounded-2xl shadow-2xl border-2 border-green-100 backdrop-blur-xl"
            whileHover={{ scale: 1.02, boxShadow: '0 20px 40px rgba(34,197,94,0.3)' }}
          >
            {/* Ícone com animação */}
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{
                type: 'spring',
                stiffness: 200,
                damping: 15,
                delay: 0.1
              }}
              className="flex-shrink-0"
            >
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle size={24} className="text-green-600" />
              </div>
            </motion.div>

            {/* Conteúdo de Texto */}
            <div className="flex-1 min-w-0">
              <motion.h3
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15, duration: 0.3 }}
                className="text-sm font-black text-slate-800 truncate"
              >
                {title}
              </motion.h3>
              <motion.p
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2, duration: 0.3 }}
                className="text-xs font-medium text-slate-500 mt-0.5 truncate"
              >
                {message}
              </motion.p>
            </div>

            {/* Botão de Fechar */}
            <motion.button
              onClick={onClose}
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
              className="flex-shrink-0 p-2 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-xl transition-colors"
            >
              <X size={18} />
            </motion.button>


          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SuccessNotification;
