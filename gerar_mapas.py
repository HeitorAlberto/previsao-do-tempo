from ecmwf.opendata import Client
import xarray as xr
import json
import os
import numpy as np
from datetime import datetime, timedelta

# Configurações de diretório
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Usamos a data atual local para os rótulos dos botões
hoje = datetime.now()
today_str = hoje.strftime("%Y%m%d")

grib_file = os.path.join(BASE_DIR, f"tp_{today_str}.grib2")
json_file = os.path.join(BASE_DIR, "dados.json")

# 1. Download dos dados
client = Client(source="azure")
client.retrieve(
    type="fc",
    param="tp",
    step=list(range(0, 121, 3)),
    target=grib_file,
)

# 2. Processamento
ds = xr.open_dataset(grib_file, engine="cfgrib")
ds = ds.sortby("latitude")
ds = ds.sel(latitude=slice(-34, 5), longitude=slice(-75, -34))

tp = ds["tp"].load()
# Calcula a chuva incremental (mm)
tp_inc = tp.diff("step")
tp_inc = tp_inc.where(tp_inc >= 0, 0).fillna(0) * 1000

# 3. Agrupamento em Blocos de 24h
lats = ds.latitude.values
lons = ds.longitude.values
dias_semana = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]

frames_5dias = []

# Ajuste: i começa em 0 para incluir "Hoje"
for i in range(5):
    # Definimos os blocos de 8 passos (24h)
    # i=0 -> passos 0 a 8 (Hoje)
    # i=1 -> passos 8 a 16 (Amanhã)
    start_step = i * 8
    end_step = (i + 1) * 8
    
    # Soma o bloco de 24 horas
    grid_dia = tp_inc.isel(step=slice(start_step, end_step)).sum(dim="step")
    
    # Calcula data correta
    data_alvo = hoje + timedelta(days=i)
    label = f"{data_alvo.strftime('%d/%m')} - {dias_semana[data_alvo.weekday()]}"
    
    data_array = np.nan_to_num(grid_dia.values, nan=0.0)
    
    frames_5dias.append({
        "label": label,
        "precip": data_array.round(1).tolist()
    })

# 4. Estrutura Final
output = {
    "model": "ECMWF Open Data",
    "updated": datetime.now().strftime("%d/%m/%Y %H:%M"),
    "grid": {
        "lat": lats.tolist(),
        "lon": lons.tolist()
    },
    "frames_24h": frames_5dias
}

with open(json_file, "w") as f:
    json.dump(output, f)

print(f"OK! Primeiro botão agora é: {frames_5dias[0]['label']}")