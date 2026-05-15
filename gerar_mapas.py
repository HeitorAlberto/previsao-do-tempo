from ecmwf.opendata import Client
import xarray as xr
import json
import os
from datetime import datetime

DATA_DIR = "data"
os.makedirs(DATA_DIR, exist_ok=True)

today = datetime.utcnow().strftime("%Y%m%d")

grib_file = f"{DATA_DIR}/tp_{today}.grib2"
json_file = f"{DATA_DIR}/precip_{today}.json"

if os.path.exists(json_file):
    print("Já existe arquivo de hoje.")
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

tp = ds["tp"]

tp_inc = tp.diff("step")
tp_inc = tp_inc.where(tp_inc >= 0, 0).fillna(0)
tp_inc = tp_inc * 1000

steps = tp_inc.step.values
lats = ds.latitude.values
lons = ds.longitude.values

frames = []

for i in range(len(steps)):
    frames.append({
        "step": int(steps[i]),
        "precip": tp_inc.isel(step=i).values.tolist()
    })

total_5d = float(tp_inc.sum("step").mean().values)

output = {
    "model": "ECMWF Open Data",
    "area": "Brazil",
    "unit": "mm",
    "grid": {
        "lat": lats.tolist(),
        "lon": lons.tolist()
    },
    "total_5d_mean_mm": total_5d,
    "frames": frames,
    "attribution": "ECMWF Open Data (CC BY 4.0)"
}

with open(json_file, "w") as f:
    json.dump(output, f)

print("OK:", json_file)