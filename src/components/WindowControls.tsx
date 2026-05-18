import React, { useEffect, useState } from 'react';
import { Minus, Square, Copy, X } from 'lucide-react';
import { cn } from '../utils/cn';

export default function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false);
  const runtime = (window as any).autoToolsRuntime;
  const isElectron = runtime?.isElectron;

  useEffect(() => {
    if (isElectron && runtime.windowControls?.onMaximizeChanged) {
      runtime.windowControls.onMaximizeChanged((maximized: boolean) => {
        setIsMaximized(maximized);
      });
    }
  }, [isElectron, runtime]);

  if (!isElectron) return null;

  const handleMinimize = () => runtime.windowControls?.minimize();
  const handleMaximize = () => runtime.windowControls?.maximize();
  const handleClose = () => runtime.windowControls?.close();

  const buttonBase = "no-drag flex items-center justify-center w-10 h-10 transition-all duration-200 active:scale-90 active:brightness-110 relative group rounded-xl";
  const iconBase = "text-slate-600/70 transition-all duration-200";

  return (
    <div className="flex items-center gap-1 ml-2">
      {/* Minimizar */}
      <button onClick={handleMinimize} className={cn(buttonBase, "hover:bg-blue-500")} aria-label="Minimizar">
        <Minus size={16} className={cn(iconBase, "group-hover:text-white group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]")} strokeWidth={2.5} />
      </button>
      
      {/* Maximizar */}
      <button onClick={handleMaximize} className={cn(buttonBase, "hover:bg-blue-500")} aria-label="Maximizar">
        {isMaximized ? (
          <Copy size={14} className={cn(iconBase, "group-hover:text-white group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]")} strokeWidth={2.5} />
        ) : (
          <Square size={13} className={cn(iconBase, "group-hover:text-white group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]")} strokeWidth={2.5} />
        )}
      </button>

      {/* Fechar */}
      <button onClick={handleClose} className={cn(buttonBase, "hover:bg-red-500")} aria-label="Fechar">
        <X size={16} className={cn(iconBase, "group-hover:text-white group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]")} strokeWidth={2.5} />
      </button>
    </div>
  );
}
