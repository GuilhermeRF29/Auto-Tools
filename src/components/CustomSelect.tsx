/**
 * @module CustomSelect
 * @description Dropdown customizado e estilizado para manter a coesão visual.
 * Suporta ícones, animação via Framer Motion e detecção de drop-up.
 */
import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, LucideIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../utils/cn';

interface Option {
  label: string;
  value: any;
  icon?: LucideIcon;
}

interface CustomSelectProps {
  label: string;
  value: any;
  onChange: (val: any) => void;
  options: Option[];
  icon: LucideIcon;
  disabled?: boolean;
}

const CustomSelect = ({ label, value, onChange, options, icon: Icon, disabled = false }: CustomSelectProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropUp, setDropUp] = useState(false);

  // Fecha ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Auto-detecta se deve abrir para cima
  React.useLayoutEffect(() => {
    if (isOpen && dropdownRef.current) {
      const rect = dropdownRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setDropUp(spaceBelow < 250);
    }
  }, [isOpen]);

  const selectedOption = options.find(opt => opt.value === value) || options[0];

  return (
    <div className="space-y-1.5 overflow-visible relative">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">{label}</label>
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          className={cn(
            "w-full bg-slate-50 border-2 border-slate-100 rounded-2xl pl-11 pr-4 py-3.5 text-sm font-bold text-slate-700 flex items-center justify-between shadow-sm outline-none transition-all",
            disabled ? "opacity-60 cursor-not-allowed bg-slate-100" : "hover:border-slate-300 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10",
            isOpen && "border-blue-600 ring-4 ring-blue-500/10"
          )}
        >
          <Icon size={16} className={cn("absolute left-4 top-1/2 -translate-y-1/2 transition-colors", isOpen ? "text-blue-600" : "text-slate-400")} />
          <span className="truncate">{selectedOption?.label}</span>
          <ChevronDown size={16} className={cn("text-slate-400 transition-transform duration-300", isOpen && "rotate-180 text-blue-600")} />
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: dropUp ? 10 : -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: dropUp ? 10 : -10 }}
              className={cn(
                "absolute bg-white border-2 border-slate-100 rounded-2xl shadow-2xl py-2 z-[600] w-full min-w-[180px] overflow-hidden",
                dropUp ? "bottom-full mb-2 origin-bottom" : "top-full mt-2 origin-top"
              )}
            >
              <div className="max-h-[250px] overflow-y-auto custom-scrollbar">
                {options.map((opt, i) => {
                  const IconOpt = opt.icon;
                  const active = opt.value === value;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        onChange(opt.value);
                        setIsOpen(false);
                      }}
                      className={cn(
                        "w-full px-4 py-2.5 text-left text-sm font-bold transition-all flex items-center gap-3",
                        active ? "bg-blue-50 text-blue-600" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      )}
                    >
                      {IconOpt && <IconOpt size={14} />}
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default CustomSelect;
