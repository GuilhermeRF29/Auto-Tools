/**
 * @module PulseHighlight
 * @description Wrapper que exibe uma animação de pulso azul ao redor do conteúdo.
 * Usado para destaque visual temporário quando o usuário navega via Command Palette.
 */
import React from 'react';
import { motion } from 'motion/react';

const PulseHighlight = ({ children, isHighlighted, onAnimationComplete }: {
  children: React.ReactNode,
  isHighlighted: boolean,
  onAnimationComplete?: () => void,
  key?: any
}) => {
  return (
    <div className="relative group">
      {isHighlighted && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: [0, 0.4, 0] }}
          transition={{ duration: 1.5, times: [0, 0.5, 1], ease: "easeInOut" }}
          onAnimationComplete={onAnimationComplete}
          className="absolute -inset-2 bg-blue-500 rounded-3xl z-0 pointer-events-none"
        />
      )}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
};

export default PulseHighlight;
