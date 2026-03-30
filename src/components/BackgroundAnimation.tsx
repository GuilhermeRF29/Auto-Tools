/**
 * @module BackgroundAnimation
 * @description Animação de fundo decorativa usada na tela de login.
 * Utiliza Framer Motion para criar orbes de gradiente flutuantes com animação infinita.
 * Também injeta os estilos globais de scrollbar customizada e ticker.
 */
import { motion } from 'motion/react';

const BackgroundAnimation = () => (
  <div className="absolute inset-0 overflow-hidden -z-10 bg-[#fafafb]">
    {/* Orbe superior esquerdo — Indigo suave */}
    <motion.div
      animate={{
        scale: [1, 1.1, 1],
        opacity: [0.3, 0.5, 0.3],
        x: [0, 20, 0],
        y: [0, -20, 0]
      }}
      transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-200/30 rounded-full blur-[120px]"
    />
    {/* Orbe inferior direito — Azul leve */}
    <motion.div
      animate={{
        scale: [1, 1.2, 1],
        opacity: [0.2, 0.4, 0.2],
        x: [0, -30, 0],
        y: [0, 30, 0]
      }}
      transition={{ duration: 15, repeat: Infinity, ease: "easeInOut", delay: 2 }}
      className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-blue-200/20 rounded-full blur-[120px]"
    />
    {/* Orbe central direito — Indigo claro */}
    <motion.div
      animate={{
        opacity: [0.1, 0.2, 0.1],
        y: [0, 50, 0]
      }}
      transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
      className="absolute top-[20%] right-[5%] w-[30%] h-[30%] bg-indigo-100/40 rounded-full blur-[100px]"
    />
    {/* Estilos globais de scrollbar e ticker */}
    <style>{`
      * {
        scrollbar-width: thin;
        scrollbar-color: #cbd5e1 transparent;
      }
      .custom-scrollbar::-webkit-scrollbar {
        width: 6px;
        height: 6px;
      }
      .custom-scrollbar::-webkit-scrollbar-track {
        background: transparent;
      }
      .custom-scrollbar::-webkit-scrollbar-thumb {
        background: #e2e8f0;
        border-radius: 20px;
        border: 2px solid transparent;
        background-clip: content-box;
      }
      .custom-scrollbar::-webkit-scrollbar-thumb:hover {
        background: #cbd5e1;
        border: 1px solid transparent;
        background-clip: content-box;
      }
      .animate-ticker {
        display: inline-block;
        white-space: nowrap;
        animation: ticker 10s ease-in-out infinite;
        min-width: max-content;
      }
      @keyframes ticker {
        0%, 15% { transform: translateX(0); }
        45%, 55% { transform: translateX(var(--scroll-dist, 0px)); }
        85%, 100% { transform: translateX(0); }
      }
    `}</style>
  </div>
);

export default BackgroundAnimation;
