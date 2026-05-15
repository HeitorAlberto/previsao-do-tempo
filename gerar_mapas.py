from ecmwf.opendata import Client
import xarray as xr
import json
import os
from datetime import datetime

# ----------------------------
# CONFIG
# ----------------------------

DATA_DIR = "data"
os.makedirs(DATA_DIR, exist_ok=True)

today = datetime.utcnow().strftime("%Y%m%d")

grib_file = f"{DATA_DIR}/tp_{today}.grib2"
json_file = f"{DATA_DIR}/precip_{today}.json"

# ----------------------------
# CACHE (não baixa de novo)
# ----------------------------

if os.path.exists(json_file):
    print("Já existe arquivo de hoje. Abortando download.")
    exit(0)

# ----------------------------
# DOWNLOAD ECMWF (GLOBAL)
# ----------------------------

client = Client(source="azure")

client.retrieve(
    type="fc",
    param="tp",
    step=list(range(0, 121, 3)),  # 5 dias / 3h
    target=grib_file,
)

# ----------------------------
# ABRIR GRIB
# ----------------------------

ds = xr.open_dataset(grib_file, engine="cfgrib")

# ----------------------------
# RECORTE BRASIL
# ----------------------------

ds = ds.sortby("latitude")

ds = ds.sel(
    latitude=slice(-34, 5),
    longitude=slice(-75, -34)
)

tp = ds["tp"]

# ----------------------------
# CONVERTER ACUMULADO → INCREMENTAL
# ----------------------------

tp_inc = tp.diff("step")
tp_inc = tp_inc.where(tp_inc >= 0, 0).fillna(0)

# metros → mm
tp_inc = tp_inc * 1000

# ----------------------------
# ACUMULADO 24h
# ----------------------------

steps_por_dia = 8  # 3h

tp_24h = tp_inc.rolling(step=steps_por_dia).sum()

# ----------------------------
# PREPARAR DADOS PARA LEAFLET
# ----------------------------

steps = ds.step.values
lats = ds.latitude.values
lons = ds.longitude.values

frames = []

for i, step in enumerate(steps):
    frames.append({
        "step": int(step),
        "precip": tp_inc.isel(step=i).values.tolist()
    })

# ----------------------------
# TOTAL 5 DIAS
# ----------------------------

total_5d = float(tp_inc.sum("step").mean().values)

# ----------------------------
# JSON FINAL
# ----------------------------

output = {
    "model": "ECMWF Open Data",
    "area": "Brazil",
    "unit": "mm",
    "grid": {
        "lat": lats.tolist(),
        "lon": lons.tolist()
    },
    "total_5d_mean_mm": total_5d,
    "frames": frames
}

with open(json_file, "w") as f:
    json.dump(output, f)

print("OK:", json_file)