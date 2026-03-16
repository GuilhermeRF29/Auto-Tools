import math

def calculadora_elasticidade_pax(preco_atual, preco_novo, pax_atual, qtd_viagens, capacidade, km_rodado, pedagio, taxa_embarque):
    """
    Calcula quantos passageiros a mais são necessários para cobrir 
    uma redução de preço e manter a mesma receita total.
    """
    # Proteções contra divisão por zero e valores inválidos
    km_seguro = km_rodado if km_rodado > 0 else 1
    preco_novo_seguro = preco_novo if preco_novo > 0 else 0.01
    capacidade_segura = capacidade if capacidade > 0 else 46

    # 1. Situação Atual
    receita_atual_total = preco_atual * pax_atual * qtd_viagens
    receita_atual_total2 = preco_novo * pax_atual * qtd_viagens
    
    # 2. O "Buraco" na Receita
    # Se baixarmos o preço e o número de passageiros continuar o mesmo, quanto perdemos?
    reducao_por_passagem = preco_atual - preco_novo
    perda_total = reducao_por_passagem * pax_atual * qtd_viagens
    
    # 3. A Recuperação (Ponto de Equilíbrio)
    # Quantos novos passageiros, pagando o PREÇO NOVO, preenchem esse buraco?
    pax_extra_total = math.ceil(perda_total / preco_novo_seguro)
    pax_extra_por_viagem = math.ceil(pax_extra_total / qtd_viagens)
    
    # 4. Meta Final
    pax_meta_final = pax_atual + pax_extra_por_viagem
    
    # 5. Ocupação (Opcional, baseado na capacidade do ônibus)
    ocupacao_atual = (pax_atual / capacidade_segura) * 100
    ocupacao_meta = (pax_meta_final / capacidade_segura) * 100

    tarifa_por_viagem = preco_atual - (pedagio + taxa_embarque)
    tarifa_por_viagem2 = preco_novo - (pedagio + taxa_embarque)
    receita_starifa = tarifa_por_viagem * pax_atual * qtd_viagens
    receita_starifa2 = tarifa_por_viagem2 * pax_atual * qtd_viagens
    receita_km = receita_starifa / km_seguro
    receita_km2 = receita_starifa2 / km_seguro
    receita_km_pax_extra = (tarifa_por_viagem2 * (pax_extra_por_viagem + pax_atual) * qtd_viagens) / km_seguro
    receita_necessaria = tarifa_por_viagem2 * pax_meta_final * qtd_viagens

    return {
        "receita_atual": receita_atual_total,
        "receita_novo": receita_atual_total2,
        "reducao_valor": reducao_por_passagem,
        "pax_extra_por_viagem": round(pax_extra_por_viagem, 1),
        "pax_meta_final": round(pax_meta_final, 2),
        "ocupacao_atual": ocupacao_atual,
        "ocupacao_meta": ocupacao_meta,
        "receita_km": receita_km,
        "receita_km2": receita_km2,
        "receita_starifa": receita_starifa,
        "receita_starifa2": receita_starifa2,
        "receita_km_pax_extra": receita_km_pax_extra,
        "receita_necessaria": receita_necessaria,
        "tarifa_por_viagem": tarifa_por_viagem,
        "tarifa_por_viagem2": tarifa_por_viagem2
    }

preco_atual = float(input("Digite o preço atual: "))
preco_novo = float(input("Digite o preço novo: "))
pax_atual = int(input("Digite a quantidade de passageiros atual: "))
qtd_viagens = int(input("Digite a quantidade de viagens: "))

match input("Digite o tipo de ônibus: ").upper():
    case "CONV": 
        capacidade = 46
    case "CAMA EXECUTIVO": 
        capacidade = 54
    case "EXECUTIVO":
        capacidade = 46
    case "EXECUTIVO CONVENCIONAL":
        capacidade = 68
    case "CAMA CONVENCIONAL":
        capacidade = 54
    case "CAMA SEMILEITO":
        capacidade = 54
    case "SEMILEITO EXECUTIVO":
        capacidade = 68
    case "CONVENCIONAL DD":
        capacidade = 68
    case _:
        capacidade = 46

km_rodado = int(input("Digite a quantidade de km rodados: "))
pedagio = float(input("Digite o valor do pedágio: "))
taxa_embarque = float(input("Digite o valor da taxa de embarque: "))

# --- TESTE PRÁTICO (Baseado no seu Excel) ---
resultado = calculadora_elasticidade_pax(
    preco_atual, 
    preco_novo, 
    pax_atual, 
    qtd_viagens,
    capacidade,
    km_rodado,
    pedagio,
    taxa_embarque
)

print(f'')
print(f"Para baixar o preço de R${preco_atual} para R${preco_novo}:")
print(f'-> Redução do valor por passageiro: R$ {resultado['reducao_valor']}.')
print(f'-> Receita necessária: R$ {resultado['receita_necessaria']:.2f}.')
print(f"-> Você precisa de +{resultado['pax_extra_por_viagem']} passageiros por viagem.")
print(f"-> Sua meta de ocupação sobe de {resultado['ocupacao_atual']:.1f}% para {resultado['ocupacao_meta']:.1f}%.")
print(f'-> Meta de passageiros por viagem dentro do ônibus: {resultado['pax_meta_final']}.')
print(f'-> Tarifa atual: R$ {resultado['tarifa_por_viagem']:.2f}.')
print(f'-> Tarifa com a redução: R$ {resultado['tarifa_por_viagem2']:.2f}.')
print(f'-> Tarifa com a redução + passageiros extras: R$ {resultado['tarifa_por_viagem2'] + resultado['pax_extra_por_viagem'] * resultado['tarifa_por_viagem2']:.2f}.')
print(f'-> Receita atual: R${resultado['receita_atual']:.2f}.')
print(f'-> Receita com a redução: R${resultado['receita_novo']:.2f}.')
print(f'-> Receita com a redução + passageiros extras: R${resultado['receita_novo'] + resultado['pax_extra_por_viagem'] * preco_novo:.2f}.')
print(f'-> Receita por tarifa atual: R${resultado['receita_starifa']:.2f}.')
print(f'-> Receita por tarifa com a redução: R${resultado['receita_starifa2']:.2f}.')
print(f'-> Receita por tarifa com a redução + passageiros extras: R${resultado['receita_starifa2'] + resultado['pax_extra_por_viagem'] * resultado['tarifa_por_viagem2']:.2f}.')
print(f'-> Receita por km atual: R${resultado['receita_km']:.2f}.')
print(f'-> Receita por km com a redução: R${resultado['receita_km2']:.2f}.')
print(f'-> Receita por km com a redução + passageiros extras: R$ {resultado['receita_km_pax_extra']:.2f}.')
print(f'-> Diferença de receitas: R$ {resultado['receita_starifa'] - resultado['receita_necessaria']:.2f}.')
print(f'-> Diferença de receitas KM: R$ {resultado['receita_km'] - resultado['receita_km_pax_extra']:.2f}.')

