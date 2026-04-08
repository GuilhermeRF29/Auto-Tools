/**
 * @module types
 * @description Definições centralizadas de tipos TypeScript para o Auto Tools.
 * Concentra todas as interfaces e type aliases utilizados pela aplicação.
 */

/** Identificador das views/telas disponíveis na navegação principal. */
export type View = 'dashboard' | 'dashboards' | 'presentations' | 'demand' | 'rioShare' | 'reports' | 'vault' | 'calculator' | 'tools' | 'settings' | 'history';

/** Usuário autenticado na aplicação. */
export interface User {
  id: number;
  nome: string;
  usuario?: string;
}

/** Variante visual de proposta (legado, mantido para compatibilidade). */
export type Proposal = 'A' | 'B';

/** Estilo da animação de confirmação ao iniciar um relatório. */
export type SuccessAnimationStyle = 'premium' | 'rapido';

/** Intensidade aplicada às animações de confirmação. */
export type AnimationIntensity = 'suave' | 'normal' | 'intensa';

/** Preferências visuais persistidas por usuário no frontend. */
export interface UiSettings {
  animationsEnabled: boolean;
  successAnimationStyle: SuccessAnimationStyle;
  successAnimationDurationSec: number;
  successAnimationIntensity: AnimationIntensity;
  windowsHelloEnabled: boolean;
}

/**
 * Representa uma tarefa de automação em execução ou finalizada.
 * Utilizada para rastrear o progresso na fila de processamento (ReportsView).
 */
export interface RunningTask {
  /** UUID único retornado pelo backend ao iniciar o job. */
  id: string;
  /** Nome legível do relatório (ex: "Relatório Revenue"). */
  name: string;
  /** Progresso de 0 a 100 (atualizado via SSE do backend). */
  progress: number;
  /** Alvo de progresso recebido do backend, usado para suavização visual no frontend. */
  progressTarget?: number;
  /** Estado atual da tarefa. */
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  /** Data/hora em que a tarefa foi iniciada no frontend. */
  startTime: Date;
  /** Mensagem descritiva do passo atual (ex: "Baixando arquivo..."). */
  message?: string;
}

/**
 * Sites pré-configurados para o Cofre de Senhas (VaultView).
 * Usados como opções no dropdown de adição de credenciais.
 */
export const PREDEFINED_SITES = [
  { name: 'EBUS', host: 'connext.controlesoftware.com.br', url: 'http://10.61.65.84/auth/login' },
  { name: 'ADM de Vendas', host: 'adm.autobots.com.br', url: 'http://ttadm01.jcatlm.com.br:8080/ventaboletosadm/index.zul;jsessionid=xFIW8nh_t8n9-74topChhriraeW-2Y5y-MKUCIG3.gcp-pd-ttadm-01' },
];
