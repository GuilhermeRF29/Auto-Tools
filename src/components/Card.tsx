/**
 * @module Card
 * @description Componente de card genérico com hover animation via Framer Motion.
 * Usado em toda a aplicação como container visual padrão.
 */
import React from 'react';
import { motion } from 'motion/react';
import { cn } from '../utils/cn';

const Card = ({ children, className = '', onClick }: { children: React.ReactNode, className?: string, onClick?: () => void }) => (
  <motion.div
    whileHover={onClick ? { y: -4, scale: 1.01, transition: { duration: 0.2 } } : {}}
    whileTap={onClick ? { scale: 0.98 } : {}}
    onClick={onClick}
    className={cn(
      "bg-white border border-slate-200 rounded-[2rem] shadow-sm transition-all overflow-hidden",
      onClick && "cursor-pointer hover:shadow-xl hover:border-blue-200",
      className
    )}
  >
    {children}
  </motion.div>
);

export default Card;
