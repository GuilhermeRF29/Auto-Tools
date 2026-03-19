import math

def calculadora_elasticidade_pax(preco_atual, preco_novo, pax_atual, qtd_viagens, capacidade, km_rodado, pedagio, taxa_embarque):
    """
    Calcula o equilíbrio de passageiros considerando custos extras (pedágio, taxa de embarque)
    e métricas de receita por KM.
    """
    # Proteções contra divisão por zero e valores inválidos
    km_seguro = km_rodado if km_rodado > 0 else 1
    preco_novo_seguro = preco_novo if preco_novo > 0 else 0.01
    capacidade_segura = capacidade if capacidade > 0 else 46

    # 1. Situação Atual e Comparação Simples
    receita_atual_total = preco_atual * pax_atual * qtd_viagens
    rec_atual_com_novo_preco = preco_novo * pax_atual * qtd_viagens
    reducao_por_passagem = preco_atual - preco_novo
    perda_total_bruta = reducao_por_passagem * pax_atual * qtd_viagens
    
    # 2. Tariffas Líquidas (Descontando custos fixos por passagem)
    tarifa_liq_atual = preco_atual - (pedagio + taxa_embarque)
    tarifa_liq_nova = preco_novo - (pedagio + taxa_embarque)
    
    # Receitas Líquidas (Sem Pedágio/Taxa)
    rec_liq_atual = tarifa_liq_atual * pax_atual * qtd_viagens
    rec_liq_novo_sem_extra = tarifa_liq_nova * pax_atual * qtd_viagens
    
    # 3. Ponto de Equilíbrio (Pax Extra)
    # Quantos passageiros novos no preço novo cobrem a perda?
    pax_extra_total_preciso = perda_total_bruta / preco_novo_seguro
    pax_extra_por_viagem_preciso = pax_extra_total_preciso / qtd_viagens
    
    # Arredondamentos (Teto e Piso)
    pax_extra_floor = math.floor(pax_extra_por_viagem_preciso)
    pax_extra_ceil = math.ceil(pax_extra_por_viagem_preciso)
    
    # 4. Metas e Ocupação
    pax_meta_floor = pax_atual + pax_extra_floor
    pax_meta_ceil = pax_atual + pax_extra_ceil
    
    ocupacao_atual = (pax_atual / capacidade_segura) * 100
    ocupacao_meta_precisa = ((pax_atual + pax_extra_por_viagem_preciso) / capacidade_segura) * 100
    
    # 5. Métrica de Receita por KM
    rec_km_atual = rec_liq_atual / km_seguro
    rec_km_novo_sem_extra = rec_liq_novo_sem_extra / km_seguro
    
    # Funções auxiliares para calcular receitas finais baseadas em pax real (inteiro)
    def calc_resultados_pax(pax_extra_inteiro):
        pax_total = pax_atual + pax_extra_inteiro
        # Receita Bruta Final
        rec_bruta_final = (pax_total * preco_novo) * qtd_viagens
        # Receita Líquida Final (Tarifa)
        rec_liq_final = (pax_total * tarifa_liq_nova) * qtd_viagens
        # Receita KM Final
        rec_km_final = rec_liq_final / km_seguro
        
        # Diferenças (Final - Original Atual)
        # Se negativo, significa lucro em relação ao estado inicial
        dif_rec_liq = rec_liq_atual - rec_liq_final
        dif_rec_km = rec_km_atual - rec_km_final
        
        return {
            "rec_bruta": rec_bruta_final,
            "rec_liq": rec_liq_final,
            "rec_km": rec_km_final,
            "dif_rec_liq": dif_rec_liq,
            "dif_rec_km": dif_rec_km,
            "pax_total": pax_total
        }

    res_floor = calc_resultados_pax(pax_extra_floor)
    res_ceil = calc_resultados_pax(pax_extra_ceil)

    return {
        # Inputs e Base
        "reducao_valor": reducao_por_passagem,
        "tarifa_liq_atual": tarifa_liq_atual,
        "tarifa_liq_nova": tarifa_liq_nova,
        "ocupacao_atual": ocupacao_atual,
        "ocupacao_meta": ocupacao_meta_precisa,
        
        # Passageiros
        "pax_extra_vlr": round(pax_extra_por_viagem_preciso, 2),
        "pax_extra_floor": pax_extra_floor,
        "pax_extra_ceil": pax_extra_ceil,
        
        # Receitas Atuais
        "rec_bruta_atual": receita_atual_total,
        "rec_liq_atual": rec_liq_atual,
        "rec_km_atual": rec_km_atual,
        
        # Resultados PISO (↓)
        "floor": res_floor,
        # Resultados TETO (↑)
        "ceil": res_ceil
    }

def get_capacidade(tipo_onibus):
    if not tipo_onibus:
        return 46
    
    # Se o tipo_onibus já for um número (string de número), retorna ele convertido
    try:
        val = float(str(tipo_onibus).replace(",", "."))
        if val > 0:
            return val
    except (ValueError, TypeError):
        pass

    bus_map = {
        "CONV": 46,
        "CONVENCIONAL": 46,
        "CAMA EXECUTIVO": 54,
        "EXECUTIVO": 46,
        "EXECUTIVO CONVENCIONAL": 68,
        "CAMA CONVENCIONAL": 54,
        "CAMA SEMILEITO": 54,
        "SEMILEITO EXECUTIVO": 68,
        "CONVENCIONAL DD": 68
    }
    return bus_map.get(tipo_onibus.upper(), 46)

