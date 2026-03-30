/**
 * @module Button
 * @description Botão genérico com variantes visuais e micro-animação de escala.
 * Suporta: primary, secondary, danger e ghost.
 */
import { motion } from 'motion/react';
import { cn } from '../utils/cn';

const Button = ({ children, onClick, variant = 'primary', className = '', disabled = false, type = "button" }: any) => {
  const baseStyle = "inline-flex items-center justify-center px-6 py-3 text-sm font-black transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl";
  const variants: Record<string, string> = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500 shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40",
    secondary: "bg-white text-slate-700 border-2 border-slate-100 hover:bg-slate-50 hover:border-slate-200 focus:ring-slate-500 shadow-sm",
    danger: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 shadow-lg shadow-red-500/20",
    ghost: "bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-800"
  };
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.96 }}
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(baseStyle, variants[variant], className)}
    >
      {children}
    </motion.button>
  );
};

export default Button;
