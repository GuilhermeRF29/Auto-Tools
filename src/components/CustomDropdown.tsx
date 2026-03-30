/**
 * @module CustomDropdown
 * @description Dropdown customizado com detecção inteligente de posição (drop-up/drop-down).
 * Calcula o espaço disponível abaixo do botão e inverte a direção se necessário.
 */
import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

const CustomDropdown = ({ label, value, options, onChange, icon: Icon }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropUp, setDropUp] = useState(false);

  // Calcula a posição ANTES da pintura na tela para evitar piscadas
  React.useLayoutEffect(() => {
    if (isOpen && dropdownRef.current) {
      const rect = dropdownRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setDropUp(spaceBelow < 250);
    }
  }, [isOpen]);

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

  const selectedOption = options.find((o: any) => o.value === value) || options[0];

  return (
    <div className="space-y-1.5 overflow-visible relative">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">{label}</label>
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3.5 text-sm font-bold text-slate-700 flex items-center justify-between hover:border-slate-300 transition-all shadow-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10"
        >
          <div className="flex items-center gap-3">
            {Icon && (
              <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                <Icon size={16} />
              </div>
            )}
            <span className="truncate">{selectedOption?.label || value}</span>
          </div>
          <ChevronDown size={20} className={`text-slate-400 transition-transform duration-300 shrink-0 ${isOpen ? 'rotate-180 text-blue-600' : ''}`} />
        </button>

        {isOpen && (
          <div className={`absolute left-0 right-0 bg-white border-2 border-slate-100 rounded-2xl shadow-2xl p-2 z-[500] max-h-56 overflow-y-auto animate-in duration-300 ${dropUp ? 'bottom-full mb-2 slide-in-from-bottom-2 origin-bottom' : 'top-full mt-2 slide-in-from-top-2 origin-top'}`}>
            <div className="grid grid-cols-1 gap-1">
              {options.map((opt: any) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2.5 rounded-xl flex items-center gap-3 transition-all ${value === opt.value ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-slate-50 text-slate-600 font-medium'}`}
                >
                  <span className="text-sm truncate">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomDropdown;
