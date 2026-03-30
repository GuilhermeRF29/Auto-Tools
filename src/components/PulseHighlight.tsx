/**
 * @module PulseHighlight
 * @description Wrapper que exibe uma animação de pulso azul ao redor do conteúdo.
 * Usado para destaque visual temporário quando o usuário navega via Command Palette.
 */
import React from 'react';
import { motion, AnimatePresence } from 'motion/react';

const PulseHighlight = ({ children, isHighlighted, onAnimationComplete }: {
  children: React.ReactNode,
  isHighlighted: boolean,
  onAnimationComplete?: () => void,
  key?: any
}) => {
  return (
    <div className="relative h-full w-full">
      <AnimatePresence>
        {isHighlighted && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 1, 0] }}
            transition={{ duration: 2, times: [0, 0.2, 0.8, 1], ease: "easeInOut" }}
            onAnimationComplete={onAnimationComplete}
            className="absolute inset-0 bg-blue-500/20 backdrop-blur-[1px] z-50 pointer-events-none rounded-[inherit]"
          />
        )}
      </AnimatePresence>
      <div className="relative z-10 h-full w-full">
        {children}
      </div>
    </div>
  );
};

export default PulseHighlight;
