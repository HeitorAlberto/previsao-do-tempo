from ecmwf.opendata import Client
import xarray as xr
import json
import os
import numpy as np
from datetime import datetime, timedelta

# Configurações
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Pegamos a data atual UTC para a requisição
hoje_utc = datetime.utcnow()
data_query = hoje_utc.strftime("%Y%m%d")

grib_file = os.path.join(BASE_DIR, f"tp_{data_query}_00.grib2")
json_file = os.path.join(BASE_DIR, "dados.json")

client = Client(source="azure")

# Forçamos a rodada (time) de 00:00 UTC
try:
    client.retrieve(
        date=data_query,
        time=0,           # <--- Força a rodada de 00h
        type="fc",
        param="tp",
        step=list(range(0, 121, 3)),
        target=grib_file,
    )
except Exception as e:
    print(f"Rodada de 00h de hoje ainda não disponível. Erro: {e}")
    exit(1)

# Processamento
ds = xr.open_dataset(grib_file, engine="cfgrib")
ds = ds.sortby("latitude")
ds = ds.sel(latitude=slice(-34, 5), longitude=slice(-75, -34))

tp = ds["tp"].load()
tp_inc = tp.diff("step")
tp_inc = tp_inc.where(tp_inc >= 0, 0).fillna(0) * 1000

lats = ds.latitude.values
lons = ds.longitude.values
dias_semana = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]

frames_5dias = []

# Usamos a data da rodada para os botões
data_base = datetime.strptime(data_query, "%Y%m%d")

for i in range(5):
    start_step = i * 8
    end_step = (i + 1) * 8
    
    grid_dia = tp_inc.isel(step=slice(start_step, end_step)).sum(dim="step")
    
    # Data do botão baseada na rodada de 00h
    data_alvo = data_base + timedelta(days=i)
    label = f"{data_alvo.strftime('%d/%m')} - {dias_semana[data_alvo.weekday()]}"
    
    data_array = np.nan_to_num(grid_dia.values, nan=0.0)
    
    frames_5dias.append({
        "label": label,
        "precip": data_array.round(1).tolist()
    })

output = {
    "model": "ECMWF Global (00h UTC)",
    "updated": datetime.now().strftime("%d/%m/%Y %H:%M"),
    "grid": {"lat": lats.tolist(), "lon": lons.tolist()},
    "frames_24h": frames_5dias
}

with open(json_file, "w") as f:
    json.dump(output, f)

print(f"OK! Dados da rodada 00 UTC processados para os próximos 5 dias.")