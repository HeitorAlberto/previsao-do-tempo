from ecmwf.opendata import Client
import xarray as xr
import json
import os
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap
from datetime import datetime, timedelta

# Configurações de diretório
BASE_DIR = os.path.dirname(os.path.abspath(__file__)) if '__file__' in locals() else os.getcwd()
os.chdir(BASE_DIR)

hoje_utc = datetime.utcnow()
data_query = hoje_utc.strftime("%Y%m%d")

grib_file = os.path.join(BASE_DIR, f"tp_{data_query}_00.grib2")
json_meta = os.path.join(BASE_DIR, "metadados.json")

# Limites geográficos estritos do seu recorte
LAT_MIN, LAT_MAX = -34, 5
LON_MIN, LON_MAX = -75, -34

# 1. DOWNLOAD DO GRIB2 (Via Azure Client)
if not os.path.exists(grib_file):
    print(f"Arquivo GRIB de hoje ({data_query}) não encontrado. Iniciando download...")
    client = Client(source="azure")
    try:
        client.retrieve(
            date=data_query,
            time=0,
            type="fc",
            param="tp",
            step=list(range(0, 121, 3)),
            target=grib_file,
        )
        print("Download do GRIB concluído.")
    except Exception as e:
        print(f"Erro no download: {e}")
        exit(1)

print("Iniciando conversão de GRIB para Imagens PNG...")

try:
    # 2. Processamento Espacial com Xarray
    ds = xr.open_dataset(grib_file, engine="cfgrib")
    ds = ds.sortby("latitude")
    ds = ds.sel(latitude=slice(LAT_MIN, LAT_MAX), longitude=slice(LON_MIN, LON_MAX))

    tp = ds["tp"].load()
    tp_inc = tp.diff("step")
    tp_inc = tp_inc.where(tp_inc >= 0, 0).fillna(0) * 1000

    # Suavização da matriz (Grid de 0.0625° para o gradiente ficar perfeito na imagem)
    novas_lats = np.arange(LAT_MIN, LAT_MAX + 0.01, 0.0625)
    novas_lons = np.arange(LON_MIN, LON_MAX + 0.01, 0.0625)
    tp_inc_suave = tp_inc.interp(latitude=novas_lats, longitude=novas_lons, method="linear")

    # 3. Configuração da sua Escala de Cores Personalizada no Matplotlib
    cores_escala = [
        '#BDBDBD', '#81C784', '#1B5E20', '#4FC3F7', '#0D47A1', 
        '#FFFF8D', '#FDD835', '#FB8C00', '#E65100', '#ff5959', 
        '#a10e0e', '#8D6E63', '#5D4037', '#DDA0DD', '#9370DB'
    ]
    niveis_chuva = [1, 3, 6, 10, 15, 20, 30, 40, 50, 75, 100, 150, 200, 300, 400]
    
    cmap_custom = ListedColormap(cores_escala)
    
    dias_semana = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]
    data_base = datetime.strptime(data_query, "%Y%m%d")
    frames_meta = []

    # 4. Geração das Imagens Dinâmicas por Dia
    for i in range(5):
        start_step = i * 8
        end_step = (i + 1) * 8
        grid_dia = tp_inc_suave.isel(step=slice(start_step, end_step)).sum(dim="step")
        
        # Inverte o eixo Y (latitude) pois imagens PNG contam os pixels de cima para baixo
        dados_imagem = np.flipud(grid_dia.values)
        
        # Mascara valores abaixo de 1mm para que o fundo fique 100% transparente
        dados_imagem_mascarados = np.ma.masked_where(dados_imagem < 1.0, dados_imagem)

        # Configura o tamanho da figura sem bordas ou eixos (Apenas dados puros)
        fig, ax = plt.subplots(figsize=(8, 8), dpi=100)
        fig.subplots_adjust(left=0, right=1, bottom=0, top=1)
        ax.axis('off')

        # Plota a matriz como imagem aplicando os limites da sua escala de chuva
        ax.imshow(
            dados_imagem_mascarados, 
            cmap=cmap_custom, 
            vmin=1, 
            vmax=400, 
            interpolation='nearest', 
            aspect='auto'
        )

        nome_imagem = f"chuva_dia_{i}.png"
        caminho_imagem = os.path.join(BASE_DIR, nome_imagem)
        
        # Salva o arquivo PNG preservando a transparência (alpha channel)
        plt.savefig(caminho_imagem, transparent=True, dpi=200, pad_inches=0)
        plt.close(fig)

        # Prepara a estrutura do metadados descritivos
        data_alvo = data_base + timedelta(days=i)
        label = f"{data_alvo.strftime('%d/%m')} - {dias_semana[data_alvo.weekday() ]}"
        
        frames_meta.append({
            "label": label,
            "arquivo": nome_imagem
        })

    # 5. Salva o arquivo de configuração leve (Metadados)
    output_meta = {
        "model": "ECMWF Global via Imagens de Alta Performance",
        "updated": datetime.now().strftime("%d/%m/%Y %H:%M"),
        "bounds": [[LAT_MIN, LON_MIN], [LAT_MAX, LON_MAX]], # Coordenadas geográficas da imagem
        "frames": frames_meta
    }

    with open(json_meta, "w") as f:
        json.dump(output_meta, f)

    print("✨ SUCESSO! Estrutura de imagens e metadados criada perfeitamente.")

except Exception as e:
    print(f"❌ Erro fatal: {e}")
    exit(1)