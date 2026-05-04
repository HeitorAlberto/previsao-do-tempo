import requests
import xml.etree.ElementTree as ET
import json
import re

def processar_inmet():
    # Endpoint RSS do INMET
    url = "https://apiprevmet3.inmet.gov.br/avisos/rss"
    
    # Header para evitar bloqueios e simular navegador real
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
    }
    
    try:
        print("Solicitando dados ao INMET...")
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        
        # O INMET costuma ter problemas de encoding. Forçamos a decodificação ignorando erros
        # para que o XML não quebre no parser.
        conteudo = response.content.decode('utf-8', errors='ignore')
        root = ET.fromstring(conteudo)
        
        lista_alertas = []

        for item in root.findall('./channel/item'):
            titulo = item.find('title').text or ""
            descricao_html = item.find('description').text or ""
            link_aviso = item.find('link').text or ""
            
            # 1. Extração da Severidade baseada no Título
            severidade = "Desconhecido"
            if "Perigo Potencial" in titulo: 
                severidade = "Baixo"
            elif "Grande Perigo" in titulo: 
                severidade = "Extremo"
            elif "Perigo" in titulo: 
                severidade = "Médio"

            # 2. Extração das Áreas (Regex Robusto)
            # Este regex captura: Área, Áreas, Ãrea ou Ãreas e limpa o HTML em volta
            pattern_areas = r"(?:Area|Área|Ãrea|Ã\srea)s?:\s*(.*?)</td>"
            areas_match = re.search(pattern_areas, descricao_html, re.IGNORECASE)
            
            lista_areas = []
            if areas_match:
                # Remove tags HTML que possam ter sobrado dentro do texto
                texto_puro = re.sub(r'<.*?>', '', areas_match.group(1))
                # Divide por vírgula e remove espaços em branco
                lista_areas = [a.strip() for a in texto_puro.split(',') if a.strip()]

            # 3. Extração do Evento (Ex: Chuvas Intensas, Onda de Calor)
            evento_match = re.search(r"Evento</th><td>(.*?)</td>", descricao_html)
            evento = evento_match.group(1) if evento_match else "Aviso Meteorológico"

            # 4. Extração de Início e Fim
            inicio_match = re.search(r"Início</th><td>(.*?)</td>", descricao_html)
            fim_match = re.search(r"Fim</th><td>(.*?)</td>", descricao_html)
            
            # Montagem do objeto de alerta
            alerta = {
                "evento": evento,
                "severidade": severidade,
                "areas": lista_areas,
                "inicio": inicio_match.group(1) if inicio_match else "",
                "fim": fim_match.group(1) if fim_match else "",
                "link": link_aviso
            }
            
            lista_alertas.append(alerta)

        # Caminho onde o arquivo será salvo (compatível com a estrutura do seu projeto)
        caminho_arquivo = 'avisos-inmet/alertas_ativos.json'
        
        with open(caminho_arquivo, 'w', encoding='utf-8') as f:
            json.dump(lista_alertas, f, ensure_ascii=False, indent=4)
            
        print(f"Sucesso! {len(lista_alertas)} alertas processados e salvos em {caminho_arquivo}.")

    except Exception as e:
        print(f"Erro crítico ao processar INMET: {e}")

if __name__ == "__main__":
    processar_inmet()