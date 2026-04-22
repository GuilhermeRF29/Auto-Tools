import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Eye, EyeOff, MessageSquareWarning, ShieldAlert, X } from 'lucide-react';
import { cn } from '../utils/cn';

type DialogTone = 'info' | 'success' | 'warning' | 'danger';
type DialogKind = 'alert' | 'confirm' | 'prompt';
type PromptInputType = 'text' | 'password';

interface BaseDialogOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: DialogTone;
}

interface PromptDialogOptions extends BaseDialogOptions {
  defaultValue?: string;
  placeholder?: string;
  inputType?: PromptInputType;
}

interface InternalDialog {
  kind: DialogKind;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  tone: DialogTone;
  defaultValue: string;
  placeholder: string;
  inputType: PromptInputType;
}

interface DialogContextData {
  showAlert: (input: string | BaseDialogOptions) => Promise<void>;
  showConfirm: (input: string | BaseDialogOptions) => Promise<boolean>;
  showPrompt: (input: PromptDialogOptions) => Promise<string | null>;
}

const DialogContext = createContext<DialogContextData>({} as DialogContextData);

const toOptions = (input: string | BaseDialogOptions): BaseDialogOptions => {
  if (typeof input === 'string') {
    return { message: input };
  }
  return input;
};

const buildDialog = (kind: DialogKind, options: BaseDialogOptions | PromptDialogOptions): InternalDialog => {
  const defaultTitles: Record<DialogKind, string> = {
    alert: 'Aviso',
    confirm: 'Confirmação',
    prompt: 'Confirmação de Segurança',
  };

  const defaultConfirmTexts: Record<DialogKind, string> = {
    alert: 'Ok, entendi',
    confirm: 'Confirmar',
    prompt: 'Confirmar',
  };

  return {
    kind,
    title: options.title || defaultTitles[kind],
    message: options.message,
    confirmText: options.confirmText || defaultConfirmTexts[kind],
    cancelText: options.cancelText || 'Cancelar',
    tone: options.tone || 'info',
    defaultValue: 'defaultValue' in options ? (options.defaultValue || '') : '',
    placeholder: 'placeholder' in options ? (options.placeholder || '') : '',
    inputType: 'inputType' in options ? (options.inputType || 'text') : 'text',
  };
};

export const DialogProvider = ({ children }: { children: ReactNode }) => {
  const [dialog, setDialog] = useState<InternalDialog | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const resolverRef = useRef<((value: any) => void) | null>(null);

  const closeDialog = useCallback((result: any) => {
    if (resolverRef.current) {
      resolverRef.current(result);
      resolverRef.current = null;
    }
    setDialog(null);
    setInputValue('');
    setShowSecret(false);
  }, []);

  const openDialog = useCallback((nextDialog: InternalDialog) => {
    setDialog(nextDialog);
    setInputValue(nextDialog.defaultValue || '');
    setShowSecret(false);

    return new Promise<any>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!dialog) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') {
          event.stopImmediatePropagation();
        }
        if (dialog.kind === 'alert') {
          closeDialog(undefined);
          return;
        }
        if (dialog.kind === 'confirm') {
          closeDialog(false);
          return;
        }
        closeDialog(null);
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') {
          event.stopImmediatePropagation();
        }
        if (dialog.kind === 'alert') {
          closeDialog(undefined);
          return;
        }
        if (dialog.kind === 'confirm') {
          closeDialog(true);
          return;
        }
        closeDialog(inputValue);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeDialog, dialog, inputValue]);

  const value = useMemo<DialogContextData>(() => ({
    showAlert: async (input) => {
      const options = toOptions(input);
      await openDialog(buildDialog('alert', options));
    },
    showConfirm: async (input) => {
      const options = toOptions(input);
      return Boolean(await openDialog(buildDialog('confirm', options)));
    },
    showPrompt: async (input) => {
      return await openDialog(buildDialog('prompt', input));
    },
  }), [openDialog]);

  const toneMeta = {
    info: {
      icon: <MessageSquareWarning size={18} />,
      iconClass: 'bg-blue-100 text-blue-700',
      chipClass: 'text-blue-700 bg-blue-50 border-blue-100',
    },
    success: {
      icon: <CheckCircle2 size={18} />,
      iconClass: 'bg-emerald-100 text-emerald-700',
      chipClass: 'text-emerald-700 bg-emerald-50 border-emerald-100',
    },
    warning: {
      icon: <AlertTriangle size={18} />,
      iconClass: 'bg-amber-100 text-amber-700',
      chipClass: 'text-amber-700 bg-amber-50 border-amber-100',
    },
    danger: {
      icon: <ShieldAlert size={18} />,
      iconClass: 'bg-rose-100 text-rose-700',
      chipClass: 'text-rose-700 bg-rose-50 border-rose-100',
    },
  } as const;

  const tone = dialog ? toneMeta[dialog.tone] : toneMeta.info;

  return (
    <DialogContext.Provider value={value}>
      {children}

      <AnimatePresence>
        {dialog && (
          <div className="fixed inset-0 z-[220] flex items-center justify-center p-4">
            <motion.button
              aria-label="Fechar diálogo"
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (dialog.kind === 'alert') closeDialog(undefined);
                else if (dialog.kind === 'confirm') closeDialog(false);
                else closeDialog(null);
              }}
              className="absolute inset-0 bg-slate-950/65 backdrop-blur-md"
            />

            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.96, filter: 'blur(2px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: 14, scale: 0.96, filter: 'blur(2px)' }}
              transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              className="relative w-full max-w-md overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl"
            >
              <div className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-slate-50 px-6 py-4">
                <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-blue-200/30 blur-2xl" />
                <div className="absolute -left-8 -bottom-8 h-20 w-20 rounded-full bg-slate-200/40 blur-2xl" />

                <div className="relative flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', tone.iconClass)}>
                      {tone.icon}
                    </div>
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-wide text-slate-800">{dialog.title}</h3>
                      <span className={cn('mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider', tone.chipClass)}>
                        Auto Tools
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (dialog.kind === 'alert') closeDialog(undefined);
                      else if (dialog.kind === 'confirm') closeDialog(false);
                      else closeDialog(null);
                    }}
                    className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              <div className="px-6 pb-6 pt-5">
                <p className="whitespace-pre-line text-sm font-medium leading-relaxed text-slate-600">
                  {dialog.message}
                </p>

                {dialog.kind === 'prompt' && (
                  <div className="mt-4">
                    <label className="px-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Digite sua confirmação
                    </label>
                    <div className="mt-1.5 flex items-center overflow-hidden rounded-2xl border-2 border-slate-100 bg-slate-50 focus-within:border-blue-500 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-500/10">
                      <input
                        autoFocus
                        type={dialog.inputType === 'password' && !showSecret ? 'password' : 'text'}
                        value={inputValue}
                        onChange={(event) => setInputValue(event.target.value)}
                        placeholder={dialog.placeholder || 'Informe o valor'}
                        className="w-full bg-transparent px-4 py-3 text-sm font-bold text-slate-700 outline-none placeholder:font-medium placeholder:text-slate-300"
                      />
                      {dialog.inputType === 'password' && (
                        <button
                          type="button"
                          onClick={() => setShowSecret((prev) => !prev)}
                          className="mr-2 rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                        >
                          {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="mt-6 flex justify-end gap-2">
                  {dialog.kind !== 'alert' && (
                    <button
                      type="button"
                      onClick={() => {
                        if (dialog.kind === 'confirm') closeDialog(false);
                        else closeDialog(null);
                      }}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
                    >
                      {dialog.cancelText}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (dialog.kind === 'alert') closeDialog(undefined);
                      else if (dialog.kind === 'confirm') closeDialog(true);
                      else closeDialog(inputValue);
                    }}
                    className="rounded-2xl bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-wider text-white transition-colors hover:bg-black"
                  >
                    {dialog.confirmText}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </DialogContext.Provider>
  );
};

export const useDialog = () => {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return context;
};
