import { BarChart3, Clock3, PieChart, TrendingUp } from 'lucide-react';
import { motion } from 'motion/react';
import Card from '../components/Card';
import type { View } from '../types';

const DASHBOARD_CARDS: Array<{
  id: 'presentations' | 'demand' | 'rioShare' | 'channelShare';
  title: string;
  description: string;
  eta: string;
  icon: typeof BarChart3;
  gradient: string;
}> = [
  {
    id: 'presentations',
    title: 'Revenue Application',
    description: 'Indicadores de revenue, filtros por periodo e visao analitica completa.',
    eta: '~10 a 20s',
    icon: BarChart3,
    gradient: 'from-slate-900 via-cyan-900 to-blue-900',
  },
  {
    id: 'demand',
    title: 'Dashboard de Demanda',
    description: 'APV por mercado, comparativo historico e janela de D-1 ate D+60.',
    eta: '~15 a 30s',
    icon: TrendingUp,
    gradient: 'from-slate-900 via-emerald-900 to-cyan-900',
  },
  {
    id: 'rioShare',
    title: 'Dashboard RIO x SP',
    description: 'Share de mercado por empresa, filtros multiselecao e leitura da base RIO x SAO.',
    eta: '~10 a 25s',
    icon: BarChart3,
    gradient: 'from-slate-900 via-blue-900 to-indigo-900',
  },
  {
    id: 'channelShare',
    title: 'Share de canais',
    description: 'Apresentacao das tabelas de receita, passageiros e ticket medio do Busca Dados.',
    eta: '~5 a 15s',
    icon: PieChart,
    gradient: 'from-slate-900 via-rose-900 to-orange-900',
  },
];

const DashboardsHubView = ({ setView }: { setView: (view: View) => void }) => {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-black tracking-tight text-slate-800">Dashboards</h2>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
          Selecione qual dashboard deseja abrir
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {DASHBOARD_CARDS.map((item, index) => {
          const Icon = item.icon;
          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card
                onClick={() => setView(item.id)}
                className={`h-[290px] p-5 text-white bg-gradient-to-br ${item.gradient} border-none`}
              >
                <div className="flex h-full flex-col justify-between">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-black tracking-tight">{item.title}</h3>
                      <p className="mt-2 text-xs font-semibold leading-relaxed text-white/80">{item.description}</p>
                    </div>
                    <div className="rounded-2xl bg-white/15 p-3 shadow-sm">
                      <Icon size={20} />
                    </div>
                  </div>

                  <div className="inline-flex w-fit items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-[11px] font-black uppercase tracking-widest">
                    <Clock3 size={14} />
                    Carga estimada: {item.eta}
                  </div>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default DashboardsHubView;