import requests
import xml.etree.ElementTree as ET
import json
import re

def limpar_texto(texto):
    if not texto: return ""
    # Corrige problemas de codificação comuns no RSS do INMET
    return texto.encode('latin1').decode('utf-8', 'ignore')

def processar_inmet():
    url = "https://apiprevmet3.inmet.gov.br/avisos/rss"
    headers = {'User-Agent': 'Mozilla/5.0'}
    
    try:
        response = requests.get(url, headers=headers)
        root = ET.fromstring(response.content)
        lista_alertas = []

        for item in root.findall('./channel/item'):
            descricao_html = item.find('description').text
            
            # Extrair Severidade
            titulo = item.find('title').text
            sev = "Baixo"
            if "Grande Perigo" in titulo: sev = "Extremo"
            elif "Perigo" in titulo: sev = "Médio"

            # Extrair Áreas (Mesorregiões)
            # O Regex busca o que está entre "Áreas:" e a próxima tag </td>
            areas_match = re.search(r"Area: (.*?)</td>|Areas: (.*?)</td>|Ãrea: (.*?)</td>|Ãreas: (.*?)</td>", descricao_html)
            areas_texto = ""
            if areas_match:
                # Pega o primeiro grupo que não seja nulo
                areas_texto = next((g for g in areas_match.groups() if g), "")
            
            areas_limpas = [a.strip() for a in areas_texto.split(',')]

            lista_alertas.append({
                "evento": re.search(r"Evento</th><td>(.*?)</td>", descricao_html).group(1),
                "severidade": sev,
                "areas": areas_limpas,
                "inicio": re.search(r"Início</th><td>(.*?)</td>", descricao_html).group(1),
                "fim": re.search(r"Fim</th><td>(.*?)</td>", descricao_html).group(1)
            })

        with open('avisos-inmet/alertas_ativos.json', 'w', encoding='utf-8') as f:
            json.dump(lista_alertas, f, ensure_ascii=False, indent=4)

    except Exception as e:
        print(f"Erro: {e}")

if __name__ == "__main__":
    processar_inmet()