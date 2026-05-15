from ecmwf.opendata import Client
import xarray as xr
import json
import os
import numpy as np
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
today = datetime.utcnow().strftime("%Y%m%d")

grib_file = os.path.join(BASE_DIR, f"tp_{today}.grib2")
json_file = os.path.join(BASE_DIR, "dados.json")

# Se quiser forçar a atualização, comente o exit(0)
if os.path.exists(json_file):
    print("Já existe JSON de hoje.")
    # exit(0) 

client = Client(source="azure")

# Busca de 0 a 120h em passos de 3h
client.retrieve(
    type="fc",
    param="tp",
    step=list(range(0, 121, 3)),
    target=grib_file,
)

ds = xr.open_dataset(grib_file, engine="cfgrib")
ds = ds.sortby("latitude")

# Recorte para a área do Brasil
ds = ds.sel(
    latitude=slice(-34, 5),
    longitude=slice(-75, -34)
)

# Carrega a variável de precipitação total (m)
tp = ds["tp"].load()

# Calcula a precipitação incremental entre os passos (em mm)
tp_inc = tp.diff("step")
tp_inc = tp_inc.where(tp_inc >= 0, 0).fillna(0) * 1000

# Acumulado móvel de 24h (8 passos de 3h)
window = 8
tp_24h = tp_inc.rolling(step=window).sum().dropna("step")

lats = ds.latitude.values
lons = ds.longitude.values
# Converter steps para horas inteiras
steps = [int(s / np.timedelta64(1, 'h')) for s in tp_24h.step.values]

frames_24h = []

for i in range(len(steps)):
    # .round(1) é essencial para diminuir o tamanho do arquivo final
    # .replace(np.nan, 0) evita que o JSON fique inválido
    data_array = tp_24h.isel(step=i).values
    data_array = np.nan_to_num(data_array, nan=0.0)
    
    frames_24h.append({
        "step": steps[i],
        "precip": data_array.round(1).tolist()
    })

output = {
    "model": "ECMWF Open Data",
    "area": "Brazil",
    "unit": "mm",
    "grid": {
        "lat": lats.tolist(),
        "lon": lons.tolist()
    },
    "frames_24h": frames_24h,
    "attribution": "ECMWF Open Data (CC BY 4.0)"
}

with open(json_file, "w") as f:
    json.dump(output, f)

print(f"Sucesso! JSON gerado com {len(frames_24h)} dias/frames.")