/**
 * @module dashboardRoutes
 * @description Orquestrador de rotas de Dashboard do Auto Tools.
 * 
 * Este arquivo combina os módulos individuais de dashboard:
 *   - Revenue Dashboard — análise de aplicação de receita
 *   - Demand Dashboard — forecast de demanda por mercado
 *   - Rio Share Dashboard — market share Rio x São Paulo
 *   - Channel Share Dashboard — performance de canais YoY
 * 
 * Cada módulo é responsável por sua própria lógica de negócio,
 * cache e rotas Express. Este arquivo apenas os combina em um
 * router único para montagem no server.js.
 * 
 * Estrutura de arquivos:
 *   dashboard/
 *   ├── dashboardUtils.js       — Funções utilitárias compartilhadas
 *   ├── revenueDashboard.js     — Dashboard de Revenue
 *   ├── demandDashboard.js      — Dashboard de Demanda
 *   ├── rioShareDashboard.js    — Dashboard Rio x SP
 *   └── channelShareDashboard.js — Dashboard Share de Canais
 */

import { Router } from 'express';
import revenueRouter from './dashboard/revenueDashboard.js';
import demandRouter from './dashboard/demandDashboard.js';
import rioShareRouter from './dashboard/rioShareDashboard.js';
import channelShareRouter from './dashboard/channelShareDashboard.js';

const router = Router();

// Montar todos os sub-routers de dashboard sob o mesmo prefixo
router.use(revenueRouter);
router.use(demandRouter);
router.use(rioShareRouter);
router.use(channelShareRouter);

export default router;
