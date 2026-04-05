/**
 * @module CustomDatePicker
 * @description Calendário inline customizado com navegação por mês/ano.
 * Suporta alinhamento à esquerda ou direita, posição auto (drop-up/down),
 * e destaque visual para data selecionada e "hoje".
 */
import React, { useState, useEffect, useRef } from 'react';
import { Calendar, ChevronRight } from 'lucide-react';

const CustomDatePicker = ({ label, value, onChange, align = 'left', disabled = false }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState(value ? new Date(value) : new Date());
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropUp, setDropUp] = useState(false);

  // Sincroniza o mês/ano visível quando o valor externo muda
  useEffect(() => {
    if (value) setCurrentDate(new Date(value));
  }, [value]);

  // Auto-detecta se deve abrir para cima (quando próximo do rodapé da tela)
  React.useLayoutEffect(() => {
    if (isOpen && dropdownRef.current) {
      const rect = dropdownRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setDropUp(spaceBelow < 380);
    }
  }, [isOpen]);

  // Fecha ao clicar fora do componente
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();

  const handlePrevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  const handlePrevYear = () => setCurrentDate(new Date(currentDate.getFullYear() - 1, currentDate.getMonth(), 1));
  const handleNextYear = () => setCurrentDate(new Date(currentDate.getFullYear() + 1, currentDate.getMonth(), 1));

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: firstDayOfMonth }, (_, i) => i);

  const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const weekDays = ["D", "S", "T", "Q", "Q", "S", "S"];

  /** Verifica se um dia específico está selecionado. */
  const isSelected = (day: number) => value &&
    value.getDate() === day &&
    value.getMonth() === currentDate.getMonth() &&
    value.getFullYear() === currentDate.getFullYear();

  /** Verifica se um dia é o dia atual (hoje). */
  const isToday = (day: number) => {
    const today = new Date();
    return today.getDate() === day &&
      today.getMonth() === currentDate.getMonth() &&
      today.getFullYear() === currentDate.getFullYear();
  };

  const formattedDate = value ? `${value.getDate().toString().padStart(2, '0')}/${(value.getMonth() + 1).toString().padStart(2, '0')}/${value.getFullYear()}` : "Selecionar data";

  return (
    <div className="space-y-1.5 overflow-visible relative">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">{label}</label>
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          className={`w-full bg-slate-50 border-2 border-slate-100 rounded-2xl pl-11 pr-4 py-3.5 text-sm font-bold text-slate-700 flex items-center justify-between shadow-sm outline-none transition-all ${disabled ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'hover:border-slate-300 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10'}`}
        >
          <Calendar size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <span className={value ? "text-slate-700" : "text-slate-400"}>{formattedDate}</span>
        </button>

        {isOpen && (
          <div className={`absolute bg-white border-2 border-slate-100 rounded-3xl shadow-2xl p-4 z-[900] min-w-[280px] sm:min-w-[320px] animate-in duration-200 ${dropUp ? 'bottom-full mb-2 slide-in-from-bottom-95 origin-bottom' : 'top-full mt-2 slide-in-from-top-95 origin-top'} ${align === 'right' ? 'right-0' : 'left-0'}`}>
            {/* Navegação de mês/ano */}
            <div className="flex items-center justify-between mb-4">
              <button type="button" onClick={handlePrevYear} className="p-1.5 text-slate-400 hover:bg-slate-50 rounded-lg hover:text-slate-700 transition-all flex -space-x-2"><ChevronRight size={16} className="rotate-180" /><ChevronRight size={16} className="rotate-180" /></button>
              <button type="button" onClick={handlePrevMonth} className="p-1.5 text-slate-400 hover:bg-slate-50 rounded-lg hover:text-slate-700 transition-all"><ChevronRight size={16} className="rotate-180" /></button>
              <div className="font-bold text-[13px] sm:text-sm text-slate-800 tracking-tight text-center flex-1">
                {monthNames[currentDate.getMonth()]} <span className="text-slate-400">{currentDate.getFullYear()}</span>
              </div>
              <button type="button" onClick={handleNextMonth} className="p-1.5 text-slate-400 hover:bg-slate-50 rounded-lg hover:text-slate-700 transition-all"><ChevronRight size={16} /></button>
              <button type="button" onClick={handleNextYear} className="p-1.5 text-slate-400 hover:bg-slate-50 rounded-lg hover:text-slate-700 transition-all flex -space-x-2"><ChevronRight size={16} /><ChevronRight size={16} /></button>
            </div>

            {/* Cabeçalho dos dias da semana */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {weekDays.map((d, i) => (
                <div key={i} className="text-[10px] font-black text-slate-400 text-center">{d}</div>
              ))}
            </div>

            {/* Grid de dias */}
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {blanks.map(b => <div key={`blank-${b}`} className="w-8 h-8"></div>)}
              {days.map(day => {
                const selected = isSelected(day);
                const today = isToday(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => {
                      onChange(new Date(currentDate.getFullYear(), currentDate.getMonth(), day));
                      setIsOpen(false);
                    }}
                    className={`
                      w-8 h-8 flex items-center justify-center text-[11px] sm:text-xs font-bold rounded-full transition-all mx-auto
                      ${selected ? 'bg-blue-600 text-white shadow-md shadow-blue-200 scale-110' :
                        today ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-200' : 'text-slate-600 hover:bg-slate-100'}
                    `}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomDatePicker;
