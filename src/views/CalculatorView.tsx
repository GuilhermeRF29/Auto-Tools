/**
 * @module CalculatorView
 * @description Calculadora de viabilidade de viagens (Pax Calc).
 * Modelo de elasticidade que calcula quantos passageiros extras são necessários
 * para compensar uma redução de preço, considerando custos de pedágio,
 * taxa de embarque e ocupação do veículo.
 * 
 * Features:
 * - Modo "Preço Final" e "Valor da Redução"
 * - Cadastro dinâmico de veículos (persistido no backend)
 * - Painel de resultados com Piso/Teto de equilíbrio
 * - Indicador de viabilidade técnica (capacidade do ônibus)
 */
import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Loader2, ArrowLeft, RotateCcw, Percent, DollarSign,
  TrendingUp, Bus, ArrowRight, Info, TrendingDown, Gauge,
  PlayCircle, Clock, ChevronDown, Plus, Repeat, Navigation,
  Map, Calculator, User, FileSpreadsheet, AlertCircle, CheckCircle
} from 'lucide-react';
import Card from '../components/Card';
import Button from '../components/Button';
import { useDialog } from '../context/DialogContext';

/** Formata número como moeda BRL. */
const formatBRL = (val: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
};

const CalculatorView = () => {
  const { showAlert } = useDialog();
  const [isCalculated, setIsCalculated] = useState(false);
  const [calculationResult, setCalculationResult] = useState<any>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [calcMode, setCalcMode] = useState<'final' | 'reduction'>('final');
  const [metricMode, setMetricMode] = useState<'value' | 'percent'>('value');
  const [busTypes, setBusTypes] = useState<any[]>([]);
  const [isBusDropdownOpen, setIsBusDropdownOpen] = useState(false);
  const [isSavingBus, setIsSavingBus] = useState(false);
  const [customBusName, setCustomBusName] = useState('');

  const [inputs, setInputs] = useState({
    preco_atual: '',
    preco_input: '',
    pax_atual: '',
    qtd_viagens: '',
    km_rodado: '',
    pedagio: '',
    taxa_embarque: '',
    capacidade: '',
    tipo_onibus: 'SELECIONE O VEÍCULO'
  });

  // Refs para ticker de texto overflow
  const containerRef = useRef<HTMLDivElement>(null);
  const spanRef = useRef<HTMLSpanElement>(null);
  const [scrollDistance, setScrollDistance] = useState(0);

  // Calcula distância de scroll para ticker se nome do ônibus transbordar
  useEffect(() => {
    const timer = setTimeout(() => {
      if (containerRef.current && spanRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        const textWidth = spanRef.current.scrollWidth;
        if (textWidth > containerWidth) {
          setScrollDistance(textWidth - containerWidth + 24);
        } else {
          setScrollDistance(0);
        }
      }
    }, 100);

    window.addEventListener('resize', () => setScrollDistance(0));
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', () => setScrollDistance(0));
    };
  }, [inputs.tipo_onibus, isCalculated]);

  // Carrega lista de veículos do backend
  useEffect(() => {
    fetch('/api/onibus')
      .then(res => res.json())
      .then(data => {
        const mapped = (data || []).map((b: any, idx: number) => ({
          id: idx,
          nome: Array.isArray(b) ? b[0] : (b.nome || ''),
          capacidade: Array.isArray(b) ? b[1] : (b.capacidade || 0)
        }));
        setBusTypes(mapped);
      })
      .catch(() => { });
  }, []);

  /** Envia dados para o endpoint de cálculo no backend. */
  const handleCalculate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCalculating(true);

    const p_nv = calcMode === 'reduction'
      ? Number(inputs.preco_atual) - Number(inputs.preco_input)
      : Number(inputs.preco_input);

    try {
      const response = await fetch('/api/calculate-pax', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preco_atual: Number(inputs.preco_atual),
          preco_novo: p_nv,
          pax_atual: Number(inputs.pax_atual),
          qtd_viagens: Number(inputs.qtd_viagens),
          capacidade: Number(inputs.capacidade),
          km_rodado: Number(inputs.km_rodado),
          pedagio: Number(inputs.pedagio),
          taxa_embarque: Number(inputs.taxa_embarque)
        })
      });
      const data = await response.json();
      if (data.success) {
        setCalculationResult(data.result);
        setIsCalculated(true);
      } else {
        await showAlert({ title: 'Erro no Cálculo', message: 'Erro no cálculo: ' + data.error, tone: 'danger' });
      }
    } catch (error) {
      await showAlert({ title: 'Erro de Conexão', message: 'Erro ao conectar com o servidor de cálculo.', tone: 'danger' });
    } finally {
      setIsCalculating(false);
    }
  };

  /** Seleciona ou cadastra um tipo de veículo. */
  const handleBusChange = (name: string, cap?: string) => {
    if (name === 'PERSONALIZADO') {
      setInputs({ ...inputs, tipo_onibus: 'PERSONALIZADO', capacidade: '' });
    } else {
      setInputs({ ...inputs, tipo_onibus: name, capacidade: cap || '' });
    }
    setIsBusDropdownOpen(false);
  };

  /** Salva novo veículo personalizado no backend. */
  const handleSaveBus = async () => {
    if (!customBusName || !inputs.capacidade) return;
    setIsSavingBus(true);
    try {
      const response = await fetch('/api/onibus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: customBusName,
          capacidade: Number(inputs.capacidade)
        })
      });
      const data = await response.json();
      if (data.success) {
        setBusTypes([...busTypes, { id: data.id, nome: customBusName, capacidade: Number(inputs.capacidade) }]);
        setInputs({ ...inputs, tipo_onibus: customBusName });
        setCustomBusName('');
      } else {
        await showAlert({ title: 'Falha ao Salvar', message: 'Erro ao salvar veículo personalizado.', tone: 'danger' });
      }
    } catch (e) {
      console.error(e);
      await showAlert({ title: 'Erro de Conexão', message: 'Erro de conexão ao salvar veículo.', tone: 'danger' });
    } finally {
      setIsSavingBus(false);
    }
  };

  /** Card de resultado complexo com comparativo Atual / Piso / Teto. */
  const ComplexResultCard = ({ title, current, floor, ceil, isCurrency = true, isInt = false, exceedsCapFloor = false, exceedsCapCeil = false }: any) => {
    const format = (v: any) => {
      if (v === null || v === undefined) return '-';
      if (typeof v === 'string') return v;
      if (isInt) return Math.round(v);
      return isCurrency ? formatBRL(v) : v.toFixed(1);
    };

    const getDiff = (original: number, final: number) => {
      const diff = final - original;
      if (metricMode === 'percent') {
        if (!original) return null;
        const pct = (diff / original) * 100;
        return { text: `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`, color: pct >= 0 ? 'text-green-600' : 'text-red-500', trend: pct >= 0 ? '+' : '-' };
      }
      const text = isCurrency ? formatBRL(Math.abs(diff)) : Math.abs(diff).toFixed(isInt ? 0 : 1);
      return { text: `${diff >= 0 ? '▲' : '▼'} ${text}`, color: diff >= 0 ? 'text-green-600' : 'text-red-500', trend: diff >= 0 ? '+' : '-' };
    };

    const diffFloor = current !== undefined ? getDiff(current, floor) : null;
    const diffCeil = current !== undefined ? getDiff(current, ceil) : null;

    return (
      <Card className="p-4 bg-slate-50/50 border-slate-200">
        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 text-center">{title}</h4>
        <div className="flex items-center justify-between gap-2">
          {current !== undefined && (
            <div className="flex-1 text-center">
              <span className="text-[8px] font-bold text-slate-400 block mb-1">ATUAL</span>
              <span className="text-xs font-semibold text-slate-600">{format(current)}</span>
              <div className="h-4"></div>
            </div>
          )}
          {current !== undefined && <div className="w-[1px] h-10 bg-slate-200"></div>}

          <div className="flex-1 text-center">
            <span className="text-[8px] font-bold text-amber-700 block mb-1 uppercase">{floor === ceil ? 'VALOR NOVO' : 'PISO'}</span>
            <span className={`text-base font-bold ${exceedsCapFloor ? 'text-red-600' : (floor === ceil ? 'text-blue-600' : 'text-amber-600')}`}>{format(floor)}</span>
            {diffFloor && <span className={`text-[10px] font-bold block ${diffFloor.color}`}>{diffFloor.text}</span>}
          </div>

          {floor !== ceil && (
            <>
              <div className="w-[1px] h-10 bg-slate-200"></div>
              <div className="flex-1 text-center">
                <span className="text-[8px] font-bold text-sky-700 block mb-1">TETO</span>
                <span className={`text-base font-bold ${exceedsCapCeil ? 'text-red-600' : 'text-sky-600'}`}>{format(ceil)}</span>
                {diffCeil && <span className={`text-[10px] font-bold block ${diffCeil.color}`}>{diffCeil.text}</span>}
              </div>
            </>
          )}
        </div>
      </Card>
    );
  };

  return (
    <AnimatePresence mode="wait">
      {isCalculated && calculationResult ? (
        <motion.div
          key="results"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
          className="space-y-6 pb-20"
        >
          {(() => {
            const res = calculationResult;
            const isFloorInfeasible = res.floor.pax_total > Number(inputs.capacidade);
            const isCeilInfeasible = res.ceil.pax_total > Number(inputs.capacidade);

            return (
              <>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <button
                    onClick={() => setIsCalculated(false)}
                    className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors py-2 px-3 rounded-xl hover:bg-slate-100 font-bold text-xs"
                  >
                    <ArrowLeft size={18} /> <span>VOLTAR PARA AJUSTES</span>
                  </button>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-2xl border border-slate-200">
                      <button
                        onClick={() => setMetricMode('value')}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all ${metricMode === 'value' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}
                      >
                        <DollarSign size={12} className="inline mr-1" /> VALORES
                      </button>
                      <button
                        onClick={() => setMetricMode('percent')}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all ${metricMode === 'percent' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}
                      >
                        <Percent size={12} className="inline mr-1" /> PERCENTUAL
                      </button>
                    </div>

                    <button
                      onClick={() => setIsCalculated(false)}
                      className="bg-slate-800 text-white px-3 md:px-4 py-2.5 rounded-2xl text-[10px] font-bold flex items-center gap-2 hover:bg-slate-900 transition-all shadow-lg shadow-slate-900/10"
                    >
                      <RotateCcw size={14} /> <span className="hidden md:inline">REFAZER ANÁLISE</span>
                    </button>
                  </div>
                </div>

                {/* Resumo dos parâmetros */}
                <Card className="p-6 bg-white border-slate-100 shadow-sm">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    {[
                      { icon: DollarSign, label: 'Preço Atual', value: formatBRL(Number(inputs.preco_atual)), color: 'text-slate-600' },
                      { icon: PlayCircle, label: calcMode === 'final' ? 'Preço Novo' : 'Redução', value: formatBRL(Number(inputs.preco_input)), color: 'text-blue-600' },
                      { icon: User, label: 'Pax Atual', value: `${inputs.pax_atual} pass.`, color: 'text-slate-600' },
                      { icon: Repeat, label: 'Viagens', value: `${inputs.qtd_viagens} unid.`, color: 'text-slate-600' },
                      { icon: Navigation, label: 'Distância', value: `${inputs.km_rodado} km`, color: 'text-slate-600' },
                      { icon: Map, label: 'Pedágio', value: formatBRL(Number(inputs.pedagio)), color: 'text-slate-600' },
                      { icon: FileSpreadsheet, label: 'Taxa Embarque', value: formatBRL(Number(inputs.taxa_embarque)), color: 'text-slate-600' },
                      { icon: Bus, label: 'Tipo Ônibus', value: inputs.tipo_onibus, color: 'text-indigo-600' },
                      { icon: Gauge, label: 'Capacidade', value: `${inputs.capacidade} pax`, color: 'text-slate-600' },
                      { icon: Calculator, label: 'Modo Calculadora', value: calcMode === 'final' ? 'PREÇO NOVO' : 'VALOR REDUÇÃO', color: 'text-slate-900' }
                    ].map((item, idx) => {
                      const Icon = item.icon;
                      return (
                        <div key={idx} className="flex flex-col items-center justify-center p-4 rounded-3xl bg-slate-50/50 border border-slate-100 hover:bg-white hover:shadow-lg transition-all group border-transparent hover:border-slate-200">
                          <div className="p-2 rounded-xl bg-white shadow-sm mb-3 group-hover:scale-110 transition-transform">
                            <Icon size={20} className={item.color} />
                          </div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight text-center h-4">{item.label}</span>
                          <span className={`text-sm font-black ${item.color} text-center truncate w-full`}>{item.value}</span>
                        </div>
                      );
                    })}
                  </div>
                </Card>

                {/* Alerta de inviabilidade */}
                {(isFloorInfeasible || isCeilInfeasible) && (
                  <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-4 animate-in zoom-in duration-300">
                    <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-red-500/20">
                      <AlertCircle size={20} className="text-white" />
                    </div>
                    <div>
                      <h4 className="text-red-800 font-bold text-sm uppercase">Inviabilidade Técnica</h4>
                      <p className="text-red-700 text-[10px] font-medium leading-tight">O volume de passageiros necessário excede a capacidade física do veículo ({inputs.capacidade} pax).</p>
                    </div>
                  </div>
                )}

                {/* Conclusão estratégica */}
                <div className={`border rounded-2xl p-6 flex items-start gap-5 ${isFloorInfeasible || isCeilInfeasible ? 'bg-red-50 border-red-100' : 'bg-indigo-50 border-indigo-100'}`}>
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${isFloorInfeasible || isCeilInfeasible ? 'bg-red-600' : 'bg-indigo-600'}`}>
                    <TrendingUp size={24} className="text-white" />
                  </div>
                  <div>
                    <h3 className={`font-bold mb-1 ${isFloorInfeasible || isCeilInfeasible ? 'text-red-900' : 'text-indigo-900'}`}>CONCLUSÃO ESTRATÉGICA</h3>
                    <p className={`text-sm leading-relaxed ${isFloorInfeasible || isCeilInfeasible ? 'text-red-800/80' : 'text-indigo-800/80'}`}>
                      Redução bruta de <span className="font-bold">{formatBRL(res.reducao_valor)}</span> exige um aumento de volume p/ viagem de
                      <span className={`font-bold px-1.5 ${isFloorInfeasible || isCeilInfeasible ? 'text-red-600' : ''}`}>+{res.pax_extra_floor} a +{res.pax_extra_ceil}</span> passageiros.
                      {isFloorInfeasible || isCeilInfeasible
                        ? <span className="font-black underline ml-1 text-red-700">O ônibus não comporta esse volume.</span>
                        : <span>O ponto de equilíbrio técnico é atingido com <span className="font-bold">{res.pax_extra_vlr}</span> novos pax.</span>
                      }
                    </p>
                  </div>
                </div>

                {/* Cards de resultado */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  <ComplexResultCard title="Passageiros Extra Necessários" current={0} floor={res.pax_extra_floor} ceil={res.pax_extra_ceil} isInt isCurrency={false} exceedsCapFloor={isFloorInfeasible} exceedsCapCeil={isCeilInfeasible} />
                  <ComplexResultCard title="Novo Volume Total de Pax" current={Number(inputs.pax_atual)} floor={res.floor.pax_total} ceil={res.ceil.pax_total} isInt isCurrency={false} exceedsCapFloor={isFloorInfeasible} exceedsCapCeil={isCeilInfeasible} />
                  <ComplexResultCard title="Novo Ticket Médio (Bruto)" current={Number(inputs.preco_atual)} floor={res.tarifa_liq_nova + Number(inputs.pedagio) + Number(inputs.taxa_embarque)} ceil={res.tarifa_liq_nova + Number(inputs.pedagio) + Number(inputs.taxa_embarque)} />
                  <ComplexResultCard title="Faturamento Bruto Total" current={res.rec_bruta_atual} floor={res.floor.rec_bruta} ceil={res.ceil.rec_bruta} />
                  <ComplexResultCard title="Rentabilidade (R$ / KM)" current={res.rec_km_atual} floor={res.floor.rec_km} ceil={res.ceil.rec_km} />
                  <ComplexResultCard title="Receita Líquida Total (Profit)" current={res.rec_liq_atual} floor={res.floor.rec_liq} ceil={res.ceil.rec_liq} />

                  {/* Painel Técnico */}
                  <div className="col-span-full space-y-3 mt-10">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Painel Técnico de Monitoramento</h4>
                    <Card className="p-6 sm:p-8 bg-slate-50 border-slate-200 shadow-sm border-t-4 border-t-blue-600">
                      <div className="flex flex-wrap items-center justify-center gap-y-10 gap-x-6 sm:gap-x-12 lg:gap-x-20">
                        {/* Preço Calculado */}
                        <div className="flex flex-col items-center text-center group min-w-[140px] flex-1 sm:flex-none">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 opacity-70">Preço Calculado</p>
                          <div className="bg-blue-100/50 text-blue-700 px-6 py-3 rounded-2xl font-black text-lg shadow-sm border border-blue-200/50 w-full sm:w-auto">
                             {formatBRL(Number(inputs.preco_atual) - Number(inputs.preco_input))}
                          </div>
                        </div>

                        {/* Curva de Ocupação */}
                        <div className="flex flex-col items-center gap-5 flex-1 sm:flex-none">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest opacity-60">Curva de Ocupação</p>
                          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
                            <div className="bg-slate-100 text-slate-600 px-4 sm:px-5 py-3 rounded-2xl font-black text-lg border border-slate-200 shadow-sm flex flex-col items-center min-w-[85px]">
                              <span className="text-[7px] text-slate-400 mb-0.5 font-bold tracking-widest uppercase">Atual</span>
                              {res.ocupacao_atual.toFixed(1)}%
                            </div>
                            <ArrowRight size={18} className="text-slate-300 animate-pulse hidden xs:block" />
                            <div className="bg-amber-100/60 text-amber-600 px-4 sm:px-5 py-3 rounded-2xl font-black text-lg border border-amber-200 shadow-sm flex flex-col items-center min-w-[85px]">
                              <span className="text-[7px] text-amber-500/70 mb-0.5 font-bold tracking-widest uppercase">Piso EQ</span>
                              {res.floor.ocupacao_pico.toFixed(1)}%
                            </div>
                            <ArrowRight size={18} className="text-slate-300 animate-pulse hidden xs:block" />
                            <div className="bg-sky-100/60 text-sky-600 px-4 sm:px-5 py-3 rounded-2xl font-black text-lg border border-sky-200 shadow-sm flex flex-col items-center min-w-[85px]">
                              <span className="text-[7px] text-sky-500/70 mb-0.5 font-bold tracking-widest uppercase">Teto EQ</span>
                              {res.ceil.ocupacao_pico.toFixed(1)}%
                            </div>
                          </div>
                        </div>

                        {/* Status Viabilidade */}
                        <div className="flex flex-col items-center text-center group min-w-[150px] flex-1 sm:flex-none">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 opacity-70">Conclusão Base</p>
                          <div className={`px-8 py-3.5 rounded-2xl font-black text-xs uppercase tracking-[0.15em] flex items-center justify-center gap-3 shadow-md border-2 w-full sm:w-auto ${isFloorInfeasible || isCeilInfeasible ? 'bg-red-50 text-red-600 border-red-100 shadow-red-100' : 'bg-green-50 text-green-600 border-green-100 shadow-green-100'}`}>
                            <div className={`w-3 h-3 rounded-full ${isFloorInfeasible || isCeilInfeasible ? 'bg-red-600' : 'bg-green-600'} animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.4)]`}></div>
                            {isFloorInfeasible || isCeilInfeasible ? 'INVIÁVEL' : 'VIÁVEL'}
                          </div>
                        </div>
                      </div>
                    </Card>
                  </div>
                </div>
              </>
            );
          })()}
        </motion.div>
      ) : (
        /* === FORMULÁRIO DE ENTRADA === */
        <motion.div
          key="inputs"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-200">
                <Calculator size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-800 tracking-tight">Cálculo de Viabilidade</h2>
                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest opacity-60">Analise o impacto de redução de tarifas</p>
              </div>
            </div>

            <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200">
              <button
                type="button"
                onClick={() => setCalcMode('final')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${calcMode === 'final' ? 'bg-white shadow-md text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                PREÇO FINAL
              </button>
              <button
                type="button"
                onClick={() => setCalcMode('reduction')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${calcMode === 'reduction' ? 'bg-white shadow-md text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                VALOR REDUÇÃO
              </button>
            </div>
          </div>

          <form onSubmit={handleCalculate} className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <Card className="lg:col-span-3 p-6 sm:p-10 !overflow-visible">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {/* Campos de entrada */}
                {[
                  { label: 'Preço Atual (BRL)', key: 'preco_atual', step: '0.01', placeholder: '0,00' },
                  { label: calcMode === 'final' ? 'Novo Preço Alvo' : 'Valor da Redução', key: 'preco_input', step: '0.01', placeholder: '0,00', extraClass: 'border-blue-100' },
                  { label: 'Quantidade de passageiros', key: 'pax_atual', placeholder: '0' },
                  { label: 'Quantidade de viagens', key: 'qtd_viagens', placeholder: '0' },
                  { label: 'KM da Viagem', key: 'km_rodado', placeholder: '0' },
                  { label: 'Pedágio (Total)', key: 'pedagio', step: '0.01', placeholder: '0,00' },
                  { label: 'Taxa de Embarque', key: 'taxa_embarque', step: '0.01', placeholder: '0,00' },
                ].map(field => (
                  <div key={field.key} className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">{field.label}</label>
                    <input
                      required
                      type="number"
                      step={field.step || undefined}
                      value={(inputs as any)[field.key]}
                      onChange={(e) => setInputs({ ...inputs, [field.key]: e.target.value })}
                      className={`w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-4 text-sm font-bold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 focus:bg-white transition-all outline-none ${field.extraClass || ''}`}
                      placeholder={field.placeholder}
                    />
                  </div>
                ))}

                {/* Seletor de veículo */}
                <div className="space-y-2 overflow-visible">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Veículo / Capacidade</label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsBusDropdownOpen(!isBusDropdownOpen)}
                      className="w-full bg-white border-2 border-slate-100 rounded-2xl px-4 py-4 text-xs font-black text-slate-700 flex items-center justify-between hover:border-slate-300 transition-all shadow-sm outline-none"
                    >
                      <span className="truncate mr-2 uppercase">{inputs.tipo_onibus}</span>
                      <ChevronDown size={18} className={`text-slate-400 transition-transform ${isBusDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isBusDropdownOpen && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-slate-100 rounded-2xl shadow-2xl p-2 z-[100] animate-in slide-in-from-top-2 duration-300 max-h-48 overflow-y-auto">
                        <div className="grid grid-cols-1 gap-1">
                          {busTypes.map(bus => (
                            <button
                              key={bus.id}
                              type="button"
                              onClick={() => handleBusChange(bus.nome, bus.capacidade.toString())}
                              className="w-full text-left px-4 py-3 rounded-xl hover:bg-slate-50 flex items-center justify-between group transition-all"
                            >
                              <span className="font-bold text-xs text-slate-600 group-hover:text-blue-600 uppercase">{bus.nome}</span>
                              <span className="text-[10px] font-black bg-slate-100 px-2 py-1 rounded-lg text-slate-400">{bus.capacidade} PAX</span>
                            </button>
                          ))}
                          <div className="h-[1px] bg-slate-100 my-1 mx-2"></div>
                          <button
                            type="button"
                            onClick={() => handleBusChange('PERSONALIZADO')}
                            className="w-full text-left px-4 py-3 rounded-xl hover:bg-blue-50 flex items-center gap-2 group transition-all"
                          >
                            <Plus size={14} className="text-blue-600" />
                            <span className="font-bold text-xs text-blue-600">CADASTRAR NOVO</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Capacidade (readonly) */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Capacidade do Veículo</label>
                  <input
                    disabled
                    type="number"
                    value={inputs.capacidade}
                    className="w-full bg-slate-100 border-2 border-slate-200 rounded-2xl px-5 py-4 text-sm font-bold text-slate-500 cursor-not-allowed"
                    placeholder="0"
                  />
                </div>

                {/* Formulário de cadastro de veículo personalizado */}
                {inputs.tipo_onibus === 'PERSONALIZADO' && (
                  <div className="space-y-4 animate-in slide-in-from-top-2 duration-300 lg:col-span-2 bg-blue-50/30 p-5 rounded-3xl border border-blue-100 mt-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-blue-600 uppercase">Nome do Veículo</label>
                        <input
                          type="text"
                          value={customBusName}
                          onChange={(e) => setCustomBusName(e.target.value)}
                          placeholder="EX: DD 15 METROS"
                          className="w-full bg-white border-2 border-slate-100 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-blue-500"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-blue-600 uppercase">Capacidade Real</label>
                        <input
                          type="number"
                          value={inputs.capacidade}
                          onChange={(e) => setInputs({ ...inputs, capacidade: e.target.value })}
                          placeholder="EX: 60"
                          className="w-full bg-white border-2 border-slate-100 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                    <Button onClick={handleSaveBus} disabled={isSavingBus} className="w-full py-3 text-[10px] font-black uppercase tracking-widest">
                      {isSavingBus ? 'SALVANDO...' : 'CADASTRAR E SELECIONAR VEÍCULO'}
                    </Button>
                  </div>
                )}
              </div>

              {/* Botões de ação */}
              <div className="mt-12 flex items-center gap-4">
                <Button type="submit" disabled={isCalculating} className="flex-1 py-5 text-sm font-black uppercase tracking-widest shadow-2xl shadow-blue-500/20">
                  {isCalculating ? (
                    <><Loader2 size={20} className="animate-spin mr-2" /> CALCULANDO IMPACTO...</>
                  ) : (
                    <><TrendingDown size={20} className="mr-2" /> SIMULAR IMPACTO ESTRATÉGICO</>
                  )}
                </Button>
                <button
                  type="button"
                  onClick={() => setInputs({ preco_atual: '', preco_input: '', pax_atual: '', qtd_viagens: '', km_rodado: '', pedagio: '', taxa_embarque: '', capacidade: '', tipo_onibus: 'SELECIONE O VEÍCULO' })}
                  className="px-8 py-5 rounded-2xl bg-slate-50 text-slate-400 font-bold hover:bg-slate-100 transition-all border-2 border-transparent hover:border-slate-200"
                >
                  LIMPAR
                </button>
              </div>
            </Card>

            {/* Card Lateral de Ajuda */}
            <div className="lg:col-span-1 space-y-6">
              <Card className="p-6 bg-slate-900 border-none text-white relative overflow-hidden">
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-500/20 rounded-full blur-3xl"></div>
                <Info className="text-blue-400 mb-4" size={32} />
                <h4 className="text-lg font-bold mb-2">Simulação de Equilíbrio</h4>
                <p className="text-slate-400 text-sm leading-relaxed mb-6">
                  Este simulador utiliza o modelo de elasticidade para prever quantos novos passageiros são necessários para compensar uma redução de preço.
                </p>
                <ul className="space-y-3 text-xs text-slate-300">
                  <li className="flex items-center gap-2"><CheckCircle size={14} className="text-blue-500" /> Considera custos de pedágio</li>
                  <li className="flex items-center gap-2"><CheckCircle size={14} className="text-blue-500" /> Abate taxas de embarque do lucro</li>
                  <li className="flex items-center gap-2"><CheckCircle size={14} className="text-blue-500" /> Calcula rentabilidade por KM</li>
                </ul>
              </Card>

              <Card className="p-6 border-slate-200">
                <h4 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2"><Clock size={16} /> Últimos Parâmetros</h4>
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">Modo Ativo</span>
                    <span className="font-bold text-blue-600 uppercase">{calcMode === 'final' ? 'Preço Final' : 'Redução'}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">Ônibus Ativo</span>
                    <span className="font-bold text-slate-800">{inputs.tipo_onibus}</span>
                  </div>
                </div>
              </Card>
            </div>
          </form>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CalculatorView;
