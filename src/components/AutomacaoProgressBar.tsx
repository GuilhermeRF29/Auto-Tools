import { motion } from 'motion/react';
import { cn } from '../utils/cn';

interface AutomacaoProgressBarProps {
  progress: number;
  message?: string;
  status?: 'running' | 'completed' | 'failed' | 'cancelled' | 'idle';
  className?: string;
}

export default function AutomacaoProgressBar({
  progress,
  message,
  status = 'idle',
  className,
}: AutomacaoProgressBarProps) {
  if (status === 'idle') return null;

  const isComplete = status === 'completed';
  const isError = status === 'failed' || status === 'cancelled';
  const barColor = isComplete ? 'bg-green-500' : isError ? 'bg-red-500' : 'bg-blue-500';

  return (
    <div className={cn('w-full', className)}>
      <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
        <motion.div
          className={cn('h-full rounded-full', barColor)}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(progress, 100)}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>
      {message && (
        <p className="text-xs text-slate-600 mt-1 truncate">{message}</p>
      )}
    </div>
  );
}
