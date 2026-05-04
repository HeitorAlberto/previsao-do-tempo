import requests
import xml.etree.ElementTree as ET
import json
import re

def processar_inmet():
    url = "https://apiprevmet3.inmet.gov.br/avisos/rss"
    # Cabeçalho para evitar bloqueio de bot
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        
        # Força o decode para evitar problemas com acentuação no XML do INMET
        conteudo = response.content.decode('utf-8', errors='ignore')
        root = ET.fromstring(conteudo)
        lista_alertas = []

        for item in root.findall('./channel/item'):
            titulo = item.find('title').text or ""
            descricao_html = item.find('description').text or ""
            
            # 1. Severidade
            severidade = "Desconhecido"
            if "Perigo Potencial" in titulo: severidade = "Baixo"
            elif "Grande Perigo" in titulo: severidade = "Extremo"
            elif "Perigo" in titulo: severidade = "Médio"

            # 2. Áreas Afetadas (Mesorregiões)
            # O Regex cobre as variações de codificação que o INMET envia no RSS
            areas_match = re.search(r"(?:Ãrea|Ãreas|Área|Áreas): (.*?)</td>", descricao_html)
            areas_texto = areas_match.group(1) if areas_match else ""
            
            # Limpeza de nomes: remove espaços extras e ignora itens vazios
            lista_areas = [a.strip() for a in areas_texto.split(',') if a.strip()]

            # 3. Nome do Evento
            evento_match = re.search(r"Evento</th><td>(.*?)</td>", descricao_html)
            evento = evento_match.group(1) if evento_match else "Aviso Meteorológico"

            # 4. Horários de Vigência (Útil para mostrar no site)
            inicio_match = re.search(r"Início</th><td>(.*?)</td>", descricao_html)
            fim_match = re.search(r"Fim</th><td>(.*?)</td>", descricao_html)

            lista_alertas.append({
                "evento": evento,
                "severidade": severidade,
                "areas": lista_areas,
                "inicio": inicio_match.group(1) if inicio_match else "",
                "fim": fim_match.group(1) if fim_match else "",
                "link": item.find('link').text
            })

        # Salva o arquivo na pasta correta para o GitHub Actions
        with open('avisos-inmet/alertas_ativos.json', 'w', encoding='utf-8') as f:
            json.dump(lista_alertas, f, ensure_ascii=False, indent=4)
            
        print(f"Sucesso! {len(lista_alertas)} alertas processados.")

    except Exception as e:
        print(f"Erro ao processar INMET: {e}")

if __name__ == "__main__":
    processar_inmet()