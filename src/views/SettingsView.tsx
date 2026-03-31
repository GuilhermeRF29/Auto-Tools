/**
 * @module SettingsView
 * @description Tela de configurações do sistema.
 * Neste momento, concentra as preferências visuais da confirmação de execução.
 */
import { Sparkles, Zap, SlidersHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../utils/cn';
import Card from '../components/Card';
import type { SuccessAnimationStyle, AnimationIntensity } from '../types';

interface SettingsViewProps {
  animationsEnabled: boolean;
  onAnimationsEnabledChange: (enabled: boolean) => void;
  successAnimationStyle: SuccessAnimationStyle;
  onSuccessAnimationStyleChange: (style: SuccessAnimationStyle) => void;
  successAnimationDurationSec: number;
  onSuccessAnimationDurationSecChange: (seconds: number) => void;
  successAnimationIntensity: AnimationIntensity;
  onSuccessAnimationIntensityChange: (intensity: AnimationIntensity) => void;
}

const SettingsView = ({
  animationsEnabled,
  onAnimationsEnabledChange,
  successAnimationStyle,
  onSuccessAnimationStyleChange,
  successAnimationDurationSec,
  onSuccessAnimationDurationSecChange,
  successAnimationIntensity,
  onSuccessAnimationIntensityChange,
}: SettingsViewProps) => {
  const options: Array<{
    id: SuccessAnimationStyle;
    title: string;
    description: string;
    icon: ReactNode;
  }> = [
    {
      id: 'premium',
      title: 'Sofisticado',
      description: 'Movimento mais fluido e elegante, com transições suaves.',
      icon: <Sparkles size={18} />,
    },
    {
      id: 'rapido',
      title: 'Rápido',
      description: 'Confirmação mais direta, com menos permanência na tela.',
      icon: <Zap size={18} />,
    },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-sm">
          <SlidersHorizontal size={20} />
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Configurações</h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1">Preferências visuais e comportamento</p>
        </div>
      </div>

      <Card className="p-5 sm:p-6">
        <div className="mb-5 pb-5 border-b border-slate-100">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">Ativar Animações</h3>
              <p className="text-xs text-slate-500 mt-2">
                Quando desativado, todas as animações do sistema são reduzidas para melhorar desempenho em máquinas antigas.
              </p>
            </div>

            <button
              type="button"
              onClick={() => onAnimationsEnabledChange(!animationsEnabled)}
              className={cn(
                'relative w-16 h-9 rounded-full transition-all duration-300 shrink-0 border',
                animationsEnabled
                  ? 'bg-blue-600 border-blue-500 shadow-lg shadow-blue-200'
                  : 'bg-slate-200 border-slate-300'
              )}
              aria-pressed={animationsEnabled}
              aria-label="Ativar ou desativar animações"
            >
              <span
                className={cn(
                  'absolute top-1 w-7 h-7 rounded-full bg-white shadow-md transition-all duration-300',
                  animationsEnabled ? 'left-8 -translate-x-full' : 'left-1'
                )}
              />
            </button>
          </div>
        </div>

        <div className="mb-4">
          <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">Animação de Confirmação</h3>
          <p className="text-xs text-slate-500 mt-2">
            Escolha como o card de confirmação deve aparecer ao iniciar um relatório.
            A escolha é salva automaticamente para este usuário.
          </p>
        </div>

        <div className={cn('space-y-5', !animationsEnabled && 'opacity-50')}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {options.map(option => {
            const isActive = successAnimationStyle === option.id;
            return (
              <button
                key={option.id}
                type="button"
                disabled={!animationsEnabled}
                onClick={() => onSuccessAnimationStyleChange(option.id)}
                className={cn(
                  'w-full text-left p-4 rounded-2xl border-2 transition-all duration-300',
                  isActive
                    ? 'border-blue-500 bg-blue-50/60 shadow-md shadow-blue-100'
                    : 'border-slate-100 bg-white hover:border-blue-200 hover:bg-blue-50/30',
                  !animationsEnabled && 'cursor-not-allowed'
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'w-9 h-9 rounded-xl flex items-center justify-center transition-colors',
                      isActive ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
                    )}
                  >
                    {option.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-black text-slate-800">{option.title}</p>
                      {isActive && (
                        <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest bg-white px-2 py-0.5 rounded-full border border-blue-100">
                          Ativo
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">{option.description}</p>
                  </div>
                </div>
              </button>
            );
          })}
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Duração da Confirmação</label>
            <div className="rounded-2xl border-2 border-slate-100 p-4 bg-slate-50/60">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-600">Tempo de permanência do card</span>
                <span className="text-xs font-black text-blue-600">{successAnimationDurationSec.toFixed(1)}s</span>
              </div>
              <input
                type="range"
                min={0.8}
                max={4}
                step={0.1}
                disabled={!animationsEnabled}
                value={successAnimationDurationSec}
                onChange={(e) => onSuccessAnimationDurationSecChange(Number(e.target.value))}
                className="w-full accent-blue-600 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Intensidade da Animação</label>
            <div className="flex items-center gap-1 p-1 bg-slate-50 border-2 border-slate-100 rounded-2xl w-full">
              {[
                { id: 'suave', label: 'Suave' },
                { id: 'normal', label: 'Normal' },
                { id: 'intensa', label: 'Intensa' },
              ].map(option => (
                <button
                  key={option.id}
                  type="button"
                  disabled={!animationsEnabled}
                  onClick={() => onSuccessAnimationIntensityChange(option.id as AnimationIntensity)}
                  className={cn(
                    'flex-1 text-center py-2.5 rounded-xl text-xs font-bold transition-all',
                    successAnimationIntensity === option.id
                      ? 'bg-white shadow-sm text-blue-600'
                      : 'text-slate-500 hover:text-slate-700',
                    !animationsEnabled && 'cursor-not-allowed'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default SettingsView;
