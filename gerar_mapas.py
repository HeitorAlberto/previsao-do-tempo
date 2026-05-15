from ecmwf.opendata import Client
import xarray as xr
import json
import os
from datetime import datetime

# ----------------------------
# 1. Configuração
# ----------------------------

DATA_DIR = "data"
os.makedirs(DATA_DIR, exist_ok=True)

today = datetime.utcnow().strftime("%Y%m%d")

grib_file = f"{DATA_DIR}/tp_{today}.grib2"
json_file = f"{DATA_DIR}/precip_{today}.json"

# ----------------------------
# 2. Cache (não baixa de novo)
# ----------------------------

if os.path.exists(json_file):
    print("Arquivo já existe para hoje. Pulando download.")
    exit(0)

# ----------------------------
# 3. Download ECMWF (Brasil inteiro)
# ----------------------------

client = Client()

client.retrieve(
    type="fc",
    param="tp",
    step=list(range(0, 121, 3)),  # 5 dias, 3h
    target=grib_file,
)

# ----------------------------
# 4. Abrir GRIB
# ----------------------------

ds = xr.open_dataset(grib_file, engine="cfgrib")

tp = ds["tp"]

# ----------------------------
# 5. Converter acumulado → incremental
# ----------------------------

tp_inc = tp.diff("step")
tp_inc = tp_inc.where(tp_inc >= 0, 0).fillna(0)

# converter para mm (mais útil para mapa)
tp_inc = tp_inc * 1000

# ----------------------------
# 6. Acumulado 24h
# ----------------------------

steps_por_dia = 8  # 3h steps

tp_24h = tp_inc.rolling(step=steps_por_dia).sum()

# ----------------------------
# 7. Redução para JSON (grade Brasil)
# ----------------------------
# atenção: isso gera matriz completa (Leaflet pode usar direto)

steps = ds.step.values
lats = ds.latitude.values
lons = ds.longitude.values

frames = []

for i, step in enumerate(steps):
    field = tp_inc.isel(step=i).values

    frames.append({
        "step": int(step),
        "data": field.tolist()   # grid 2D (lat x lon)
    })

# ----------------------------
# 8. Acumulado total 5 dias
# ----------------------------

total_5d = float(tp_inc.sum("step").mean().values)

# ----------------------------
# 9. JSON final
# ----------------------------

output = {
    "model": "ECMWF Open Data",
    "area": "Brazil",
    "unit": "mm",
    "resolution_step_hours": 3,
    "total_5d_mean_mm": total_5d,
    "lat": lats.tolist(),
    "lon": lons.tolist(),
    "frames": frames
}

with open(json_file, "w") as f:
    json.dump(output, f)

print("OK:", json_file)