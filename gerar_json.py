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

def get(ds, var, lat, lon):
    return float(ds[var].sel(latitude=lat, longitude=lon, method="nearest").values)

# =========================
# SAFE VARIABLE GETTER
# =========================

def get_var(ds, candidates):
    for c in candidates:
        if c in ds.data_vars:
            return ds[c]
    raise KeyError(f"Nenhuma variável encontrada em {candidates}. Disponíveis: {list(ds.data_vars)}")

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

    # =========================
    # OPEN GRIBS
    # =========================

    ds_tp = xr.open_dataset(FILES["tp"], engine="cfgrib", backend_kwargs={"indexpath": ""})
    ds_tmax = xr.open_dataset(FILES["tmax"], engine="cfgrib", backend_kwargs={"indexpath": ""})
    ds_tmin = xr.open_dataset(FILES["tmin"], engine="cfgrib", backend_kwargs={"indexpath": ""})
    ds_wind = xr.open_dataset(FILES["wind"], engine="cfgrib", backend_kwargs={"indexpath": ""})

    # =========================
    # SAFE VARIABLE MAPPING
    # =========================

    tp = get_var(ds_tp, ["tp"]) * 1000.0

    tmax = get_var(ds_tmax, ["mx2t3"]) - 273.15
    tmin = get_var(ds_tmin, ["mn2t3"]) - 273.15

    # cfgrib pode expor como fg10
    wind = get_var(ds_wind, ["10fg", "fg10"])

    # =========================
    # TIME AXIS
    # =========================

    run_time = pd.to_datetime(tp.time.item()).to_pydatetime()
    steps = run_time + pd.to_timedelta(tp.step.values, unit="h")

    base = timedelta(hours=3)

    resultado = {c["nome"]: {} for c in cidades}

    # =========================
    # LOOP DIÁRIO
    # =========================

    for d in range(5):

        start = run_time + base + timedelta(days=d)
        end = start + timedelta(hours=24)

        i0 = np.argmin(np.abs(steps - start))
        i1 = np.argmin(np.abs(steps - end))

        chuva = tp.isel(step=i1) if d == 0 else tp.isel(step=i1) - tp.isel(step=i0)

        tmax_d = tmax.isel(step=slice(i0, i1)).max("step")
        tmin_d = tmin.isel(step=slice(i0, i1)).min("step")
        wind_d = wind.isel(step=slice(i0, i1)).max("step")

        data_str = (start - base).strftime("%Y-%m-%d")

        for c in cidades:

            nome = c["nome"]
            lat = c["latitude"]
            lon = c["longitude"]

            resultado[nome][data_str] = {
                "chuva": round(get(chuva, "tp", lat, lon), 1),
                "temp_max": round(get(tmax_d, None, lat, lon), 1),
                "temp_min": round(get(tmin_d, None, lat, lon), 1),
                "vento_max": round(get(wind_d, None, lat, lon), 1)
            }

    # =========================
    # SAVE JSON
    # =========================

    out = os.path.join(json_dir, "previsao.json")

    with open(out, "w", encoding="utf-8") as f:
        json.dump(resultado, f, indent=2, ensure_ascii=False)

    print("JSON gerado com sucesso")

if __name__ == "__main__":
    gerar()