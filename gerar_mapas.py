from ecmwf.opendata import Client
import xarray as xr
import json
import os
import numpy as np
from datetime import datetime, timedelta

# Configurações de diretório
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
today_str = datetime.utcnow().strftime("%Y%m%d")

grib_file = os.path.join(BASE_DIR, f"tp_{today_str}.grib2")
json_file = os.path.join(BASE_DIR, "dados.json")

# 1. Download dos dados (0 a 120h = 5 dias)
client = Client(source="azure")
client.retrieve(
    type="fc",
    param="tp",
    step=list(range(0, 121, 3)),
    target=grib_file,
)

# 2. Carregamento e Processamento com Xarray
ds = xr.open_dataset(grib_file, engine="cfgrib")
ds = ds.sortby("latitude")

# Recorte para a área de interesse (Brasil aproximado)
ds = ds.sel(
    latitude=slice(-34, 5),
    longitude=slice(-75, -34)
)

tp = ds["tp"].load()

# Calcula a chuva incremental (a cada 3h) e converte para mm (*1000)
tp_inc = tp.diff("step")
tp_inc = tp_inc.where(tp_inc >= 0, 0).fillna(0) * 1000

# 3. Agrupamento em Blocos de 24h (5 Dias)
lats = ds.latitude.values
lons = ds.longitude.values
dias_semana = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]

frames_5dias = []
data_base = datetime.strptime(today_str, "%Y%m%d")

# Cada dia tem 8 passos de 3 horas (8 * 3 = 24h)
for i in range(1, 6):
    end_step = i * 8
    start_step = end_step - 8
    
    # Soma o bloco de 24 horas
    grid_dia = tp_inc.isel(step=slice(start_step, end_step)).sum(dim="step")
    
    # Calcula data e nome do dia
    data_alvo = data_base + timedelta(days=i)
    label = f"{data_alvo.strftime('%d/%m')} - {dias_semana[data_alvo.weekday()]}"
    
    # Limpeza de dados: remove NaNs e arredonda para diminuir o JSON
    data_array = np.nan_to_num(grid_dia.values, nan=0.0)
    
    frames_5dias.append({
        "label": label,
        "precip": data_array.round(1).tolist()
    })

# 4. Estrutura Final do JSON
output = {
    "model": "ECMWF Open Data",
    "updated": datetime.now().strftime("%d/%m/%Y %H:%M"),
    "grid": {
        "lat": lats.tolist(),
        "lon": lons.tolist()
    },
    "frames_24h": frames_5dias
}

# Salva o arquivo
with open(json_file, "w") as f:
    json.dump(output, f)

print(f"OK! JSON gerado com sucesso: {json_file}")
print(f"Total de quadros: {len(frames_5dias)} dias.")