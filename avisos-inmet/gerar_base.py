import requests
import json
import os

def baixar_referencia_ibge():
    caminho_arquivo = 'avisos-inmet/referencia_locais.json'
    
    # VERIFICAÇÃO: Se o arquivo já existe, o script encerra aqui
    if os.path.exists(caminho_arquivo):
        print(f"A base de referência '{caminho_arquivo}' já existe. Pulando download.")
        return

    print("Arquivo não encontrado. Acessando API do IBGE para gerar a base...")
    url = "https://servicodados.ibge.gov.br/api/v1/localidades/municipios"
    
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        municipios = response.json()
        
        mapeamento = {}
        
        for m in municipios:
            nome_cidade = m.get('nome')
            microrregiao = m.get('microrregiao')
            
            if microrregiao:
                mesorregiao = microrregiao.get('mesorregiao')
                if mesorregiao:
                    nome_meso = mesorregiao.get('nome')
                    sigla_uf = mesorregiao.get('UF', {}).get('sigla')
                    
                    if nome_cidade and sigla_uf:
                        # Chave padronizada: "SÃO MIGUEL DOS CAMPOS - AL"
                        chave = f"{nome_cidade} - {sigla_uf}".upper()
                        mapeamento[chave] = {
                            "meso": nome_meso,
                            "uf": sigla_uf
                        }
        
        # Cria a pasta caso ela não exista (segurança extra)
        os.makedirs(os.path.dirname(caminho_arquivo), exist_ok=True)
        
        with open(caminho_arquivo, 'w', encoding='utf-8') as f:
            json.dump(mapeamento, f, ensure_ascii=False, indent=4)
            
        print(f"Sucesso! {len(mapeamento)} cidades mapeadas e salvas.")

    except Exception as e:
        print(f"Erro ao gerar base do IBGE: {e}")

if __name__ == "__main__":
    baixar_referencia_ibge()