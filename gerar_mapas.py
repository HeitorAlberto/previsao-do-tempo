from ecmwf.opendata import Client
import xarray as xr
import json
import os
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

today = datetime.utcnow().strftime("%Y%m%d")

grib_file = os.path.join(BASE_DIR, f"tp_{today}.grib2")
json_file = os.path.join(BASE_DIR, "dados.json")

if os.path.exists(json_file):
    print("Já existe JSON de hoje.")
    exit(0)

client = Client(source="azure")

client.retrieve(
    type="fc",
    param="tp",
    step=list(range(0, 121, 3)),
    target=grib_file,
)

ds = xr.open_dataset(grib_file, engine="cfgrib")
ds = ds.sortby("latitude")

ds = ds.sel(
    latitude=slice(-34, 5),
    longitude=slice(-75, -34)
)

tp = ds["tp"].load()

# incremental
tp_inc = tp.diff("step")
tp_inc = tp_inc.where(tp_inc >= 0, 0).fillna(0) * 1000

# ----------------------------
# ACUMULADO 24H (8 passos de 3h)
# ----------------------------

window = 8

tp_24h = tp_inc.rolling(step=window).sum().dropna("step")

lats = ds.latitude.values
lons = ds.longitude.values
steps = tp_24h.step.values

frames_24h = []

for i in range(len(steps)):
    frames_24h.append({
        "step": int(steps[i]),
        "precip": tp_24h.isel(step=i).values.tolist()
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

print("OK:", json_file)