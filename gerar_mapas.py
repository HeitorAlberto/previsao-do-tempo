from ecmwf.opendata import Client
import xarray as xr
import json
import os
import numpy as np
from datetime import datetime, timedelta

# Configurações de diretório
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
hoje_utc = datetime.utcnow()
data_query = hoje_utc.strftime("%Y%m%d")

grib_file = os.path.join(BASE_DIR, f"tp_{data_query}_00.grib2")
json_file = os.path.join(BASE_DIR, "dados.json")

# 1. VERIFICAÇÃO DO GRIB2: Só baixa se o arquivo não existir localmente
if not os.path.exists(grib_file):
    print(f"Arquivo GRIB de hoje ({data_query}) não encontrado. Iniciando download da rodada 00h...")
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
        print("Download do GRIB concluído com sucesso.")
    except Exception as e:
        print(f"Erro: A rodada de 00h do dia {data_query} pode não estar disponível ainda. Detalhes: {e}")
        exit(1)
else:
    print(f"O arquivo GRIB já existe localmente: {grib_file}. Pulando download.")

# [MUDANÇA] Removi a trava que impedia o script de rodar se o dados.json existisse.
# Agora ele vai ler o GRIB local e reescrever o JSON com a nova suavização.

print("Iniciando o processamento do Xarray com suavização bilinear...")

# 3. Processamento com Xarray
ds = xr.open_dataset(grib_file, engine="cfgrib")
ds = ds.sortby("latitude")
ds = ds.sel(latitude=slice(-34, 5), longitude=slice(-75, -34))

tp = ds["tp"].load()
tp_inc = tp.diff("step")
tp_inc = tp_inc.where(tp_inc >= 0, 0).fillna(0) * 1000

# =========================================================================
# ENGENHARIA DE SUAVIZAÇÃO: INTERPOLAÇÃO BILINEAR
# =========================================================================
print("Calculando novo grid de alta definição (0.0625°)...")
# Criamos um novo grid 4 vezes mais denso para quebrar o visual "Minecraft"
novas_lats = np.arange(-34, 5.01, 0.0625)
novas_lons = np.arange(-75, -33.99, 0.0625)

# A mágica que calcula as transições suaves de cor entre os pixels originais
tp_inc_suave = tp_inc.interp(latitude=novas_lats, longitude=novas_lons, method="bilinear")
# =========================================================================

# Substituímos as variáveis originais pelas novas coordenadas densas
lats = novas_lats
lons = novas_lons
dias_semana = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]

frames_5dias = []
data_base = datetime.strptime(data_query, "%Y%m%d")

for i in range(5):
    start_step = i * 8
    end_step = (i + 1) * 8
    
    # [MUDANÇA] Agora o agrupamento usa a matriz tp_inc_suave
    grid_dia = tp_inc_suave.isel(step=slice(start_step, end_step)).sum(dim="step")
    
    data_alvo = data_base + timedelta(days=i)
    label = f"{data_alvo.strftime('%d/%m')} - {dias_semana[data_alvo.weekday()]}"
    
    data_array = np.nan_to_num(grid_dia.values, nan=0.0)
    
    frames_5dias.append({
        "label": label,
        "precip": data_array.round(1).tolist()
    })

output = {
    "model": "ECMWF Global Suavizado (00h UTC)",
    "updated": datetime.now().strftime("%d/%m/%Y %H:%M"),
    "grid": {"lat": lats.tolist(), "lon": lons.tolist()},
    "frames_24h": frames_5dias
}

with open(json_file, "w") as f:
    json.dump(output, f)

print(f"Sucesso! Novo dados.json gerado com tamanho de {os.path.getsize(json_file) / (1024*1024):.2f} MB.")