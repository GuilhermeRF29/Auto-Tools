import math

def calculadora_elasticidade_pax(preco_atual, preco_novo, pax_atual, qtd_viagens, capacidade, km_rodado, pedagio, taxa_embarque, fator_giro=1.0):
    """
    Calcula o equilíbrio de passageiros considerando custos extras e fator de giro (multiponto).
    fator_giro: 1.0 (direto), > 1.0 (multiponto, onde cada poltrona é vendida mais de uma vez).
    """
    # Proteções contra divisão por zero e valores inválidos
    km_seguro = km_rodado if km_rodado > 0 else 1
    capacidade_segura = capacidade if capacidade > 0 else 46
    giro_seguro = fator_giro if fator_giro >= 1.0 else 1.0
    
    # Capacidade Efetiva (Considerando o giro total da viagem)
    capacidade_efetiva = capacidade_segura * giro_seguro

    # 1. Situação Atual (Preços Brutos)
    receita_atual_total = preco_atual * pax_atual * qtd_viagens
    reducao_por_passagem = preco_atual - preco_novo
    
    # 2. Tariffas Líquidas (Descontando custos fixos por passagem: pedágio e taxa)
    tarifa_liq_atual = preco_atual - (pedagio + taxa_embarque)
    tarifa_liq_nova = preco_novo - (pedagio + taxa_embarque)
    
    # Receitas Líquidas Totais (O que a empresa de fato recebe)
    rec_liq_atual = tarifa_liq_atual * pax_atual * qtd_viagens
    rec_liq_novo_sem_extra = tarifa_liq_nova * pax_atual * qtd_viagens
    
    # Perda Real de Faturamento Líquido (Gap a ser coberto)
    perda_total_liq = rec_liq_atual - rec_liq_novo_sem_extra
    
    # 3. Ponto de Equilíbrio (Pax Extra)
    # Quantos passageiros novos cobrem a perda líquida?
    # Usamos tarifa_liq_nova_segura como divisor pois cada pax extra contribui apenas com o valor líquido
    tarifa_liq_nova_segura = tarifa_liq_nova if tarifa_liq_nova > 0 else 0.01
    pax_extra_total_preciso = perda_total_liq / tarifa_liq_nova_segura
    pax_extra_por_viagem_preciso = pax_extra_total_preciso / qtd_viagens
    
    # Arredondamentos (Teto e Piso)
    pax_extra_floor = math.floor(pax_extra_por_viagem_preciso)
    pax_extra_ceil = math.ceil(pax_extra_por_viagem_preciso)
    
    # 4. Cálculo de Ocupação Instantânea (Pico)
    # No modo multiponto, a ocupação que limita é o pico, não o acumulado.
    # Ocupação = (Pax_Total / Giro) / Capacidade_Fisica
    def calc_ocupacao_pico(pax_total_viagem):
        pax_no_pico = pax_total_viagem / giro_seguro
        return (pax_no_pico / capacidade_segura) * 100

    ocupacao_atual = calc_ocupacao_pico(pax_atual)
    ocupacao_meta_precisa = calc_ocupacao_pico(pax_atual + pax_extra_por_viagem_preciso)
    
    # 5. Métrica de Receita por KM
    rec_km_atual = rec_liq_atual / km_seguro
    
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
        dif_rec_liq = rec_liq_atual - rec_liq_final
        dif_rec_km = rec_km_atual - rec_km_final
        
        return {
            "rec_bruta": rec_bruta_final,
            "rec_liq": rec_liq_final,
            "rec_km": rec_km_final,
            "dif_rec_liq": dif_rec_liq,
            "dif_rec_km": dif_rec_km,
            "pax_total": pax_total,
            "ocupacao_pico": calc_ocupacao_pico(pax_total)
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
        "giro_fator": giro_seguro,
        "capacidade_fisica": capacidade_segura,
        "capacidade_efetiva": capacidade_efetiva,
        
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
        "ceil": res_ceil,
        
        # Metas extras
        "pax_total_meta_vlr": pax_atual + pax_extra_por_viagem_preciso
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

