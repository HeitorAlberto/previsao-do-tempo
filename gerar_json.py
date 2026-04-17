from ecmwf.opendata import Client
from datetime import datetime, timedelta
import xarray as xr
import numpy as np
import pandas as pd
import json, os

# =========================
# CONFIG
# =========================

json_dir = "json"
os.makedirs(json_dir, exist_ok=True)

FILES = {
    "tp": "tp.grib2",
    "tmax": "tmax.grib2",
    "tmin": "tmin.grib2",
    "wind": "wind.grib2"
}

# =========================
# CIDADES
# =========================

with open("cidades.json", encoding="utf-8-sig") as f:
    cidades = json.load(f)

# =========================
# INTERPOLAÇÃO SEGURA
# =========================

def get(da, lat, lon):
    return float(da.interp(latitude=lat, longitude=lon).values)

# =========================
# DOWNLOAD
# =========================

def baixar(client, run_date):

    steps = list(range(0, 145, 3))

    if not os.path.exists(FILES["tp"]):
        client.retrieve(
            date=run_date, time=0, step=steps,
            param="tp", type="fc", levtype="sfc",
            stream="oper", target=FILES["tp"]
        )

    if not os.path.exists(FILES["tmax"]):
        client.retrieve(
            date=run_date, time=0, step=steps,
            param="mx2t3", type="fc", levtype="sfc",
            stream="oper", target=FILES["tmax"]
        )

    if not os.path.exists(FILES["tmin"]):
        client.retrieve(
            date=run_date, time=0, step=steps,
            param="mn2t3", type="fc", levtype="sfc",
            stream="oper", target=FILES["tmin"]
        )

    if not os.path.exists(FILES["wind"]):
        client.retrieve(
            date=run_date, time=0, step=steps,
            param="10fg", type="fc", levtype="sfc",
            stream="oper", target=FILES["wind"]
        )

# =========================
# MAIN
# =========================

def gerar():

    client = Client(source="azure")

    now = datetime.utcnow() - timedelta(hours=3)
    run_date = now.strftime("%Y%m%d")

    baixar(client, run_date)

    ds_tp = xr.open_dataset(FILES["tp"], engine="cfgrib", backend_kwargs={"indexpath": ""})
    ds_tmax = xr.open_dataset(FILES["tmax"], engine="cfgrib", backend_kwargs={"indexpath": ""})
    ds_tmin = xr.open_dataset(FILES["tmin"], engine="cfgrib", backend_kwargs={"indexpath": ""})
    ds_wind = xr.open_dataset(FILES["wind"], engine="cfgrib", backend_kwargs={"indexpath": ""})

    tp = ds_tp["tp"] * 1000.0
    tmax = ds_tmax["mx2t3"] - 273.15
    tmin = ds_tmin["mn2t3"] - 273.15
    wind = ds_wind["fg10"]

    run_time = pd.to_datetime(tp.time.item()).to_pydatetime()
    steps = run_time + pd.to_timedelta(tp.step.values, unit="h")

    base = timedelta(hours=3)

    resultado = {c["nome"]: {} for c in cidades}

    # =========================
    # DIAS
    # =========================

    for d in range(5):

        start = run_time + base + timedelta(days=d)
        end = start + timedelta(hours=24)

        mask = (steps > start) & (steps <= end)

        if not np.any(mask):
            continue

        chuva_sel = tp.sel(step=mask)
        tmax_sel = tmax.sel(step=mask)
        tmin_sel = tmin.sel(step=mask)
        wind_sel = wind.sel(step=mask)

        chuva = chuva_sel.sum("step")
        tmax_d = tmax_sel.max("step")
        tmin_d = tmin_sel.min("step")
        wind_d = wind_sel.max("step")

        data_str = (start - base).strftime("%Y-%m-%d")

        for c in cidades:

            nome = c["nome"]
            lat = c["latitude"]
            lon = c["longitude"]

            resultado[nome][data_str] = {
                "chuva": round(get(chuva, lat, lon), 1),
                "temp_max": round(get(tmax_d, lat, lon), 1),
                "temp_min": round(get(tmin_d, lat, lon), 1),
                "vento_max": round(get(wind_d, lat, lon), 1)
            }

    # =========================
    # OUTPUT
    # =========================

    out = os.path.join(json_dir, "previsao.json")

    with open(out, "w", encoding="utf-8") as f:
        json.dump(resultado, f, indent=2, ensure_ascii=False)

    print("JSON gerado com sucesso")

if __name__ == "__main__":
    gerar()