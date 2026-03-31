/**
 * @module PulseHighlight
 * @description Wrapper que exibe uma animação de pulso azul ao redor do conteúdo.
 * Usado para destaque visual temporário quando o usuário navega via Command Palette.
 */
import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../utils/cn';

const PulseHighlight = ({ children, isHighlighted, onAnimationComplete, variant = 'inner' }: {
  children: React.ReactNode,
  isHighlighted: boolean,
  onAnimationComplete?: () => void,
  variant?: 'inner' | 'outer',
  key?: any
}) => {
  return (
    <div className="relative h-full w-full">
      <AnimatePresence>
        {isHighlighted && (
          <motion.div
            initial={variant === 'inner' ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
            animate={variant === 'inner' ? 
              { opacity: [0, 1, 1, 0] } : 
              { opacity: [0, 0.5, 0], scale: [0.95, 1.05, 1] }
            }
            transition={{ duration: 2, times: [0, 0.2, 0.8, 1], ease: "easeInOut" }}
            onAnimationComplete={onAnimationComplete}
            className={cn(
              "absolute pointer-events-none",
              variant === 'inner' ? "inset-0 bg-blue-500/20 backdrop-blur-[1px] z-50 rounded-[inherit]" : "-inset-3 bg-blue-400/20 rounded-[2.5rem] z-0 shadow-lg shadow-blue-400/10"
            )}
          />
        )}
      </AnimatePresence>
      <div className={cn("relative h-full w-full", variant === 'inner' ? "z-10" : "z-10")}>
        {children}
      </div>
    </div>
  );
};

export default PulseHighlight;
