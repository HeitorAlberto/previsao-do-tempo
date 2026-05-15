from ecmwf.opendata import Client
import xarray as xr
import json
import numpy as np
import os

# ----------------------------
# 1. Download do ECMWF
# ----------------------------

client = Client()

client.retrieve(
    type="fc",
    param="tp",                 # total precipitation
    step=list(range(0, 121, 3)),  # 0 a 120h (5 dias, cada 3h)
    target="tp.grib2",
)

# ----------------------------
# 2. Abrir GRIB
# ----------------------------

ds = xr.open_dataset("tp.grib2", engine="cfgrib")

tp = ds["tp"]

# ----------------------------
# 3. Converter acumulado → incremental
# ----------------------------

tp_inc = tp.diff("step")
tp_inc = tp_inc.where(tp_inc >= 0, 0)

# primeira posição não tem diff válido
tp_inc = tp_inc.fillna(0)

# ----------------------------
# 4. Acumulado 24h
# (passo de 3h → 8 passos por dia)
# ----------------------------

steps_por_dia = 8

tp_24h = tp_inc.rolling(step=steps_por_dia).sum()

# ----------------------------
# 5. Preparar dados para JSON
# (reduzido: média espacial por step)
# ----------------------------

steps = ds.step.values

hourly = []

for i, step in enumerate(steps):
    hourly.append({
        "step": int(step),
        "precip_mean": float(tp_inc.isel(step=i).mean().values),
        "precip_max": float(tp_inc.isel(step=i).max().values),
    })

# ----------------------------
# 6. Acumulado total 5 dias
# ----------------------------

total_5d = float(tp_inc.sum("step").mean().values)

# ----------------------------
# 7. Montar JSON final
# ----------------------------

output = {
    "model": "ECMWF Open Data",
    "variable": "tp",
    "unit": "m (water equivalent)",
    "total_5d_mean": total_5d,
    "resolution_step_hours": 3,
    "time_series": hourly
}

# ----------------------------
# 8. Salvar arquivo
# ----------------------------

os.makedirs("mapas", exist_ok=True)

with open("mapas/precip.json", "w") as f:
    json.dump(output, f, indent=2)

print("OK: JSON gerado")