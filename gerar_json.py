from ecmwf.opendata import Client
from datetime import datetime, timedelta
import xarray as xr
import numpy as np
import pandas as pd
import os, json

# =========================
# CONFIG
# =========================

json_dir = "json"
os.makedirs(json_dir, exist_ok=True)

GRIB_TP = "tp.grib2"
GRIB_TEMP = "temp_wind.grib2"

# =========================
# CIDADES
# =========================

with open("cidades.json", encoding="utf-8-sig") as f:
    cidades = json.load(f)

def get_valor(ds, lat, lon):
    ponto = ds.sel(latitude=lat, longitude=lon, method="nearest")
    return float(ponto.values)

# =========================
# DOWNLOAD GRIBS
# =========================

def baixar_gribs(client, run_date):

    steps = list(range(0, 145, 3))

    # --- PRECIPITAÇÃO ---
    if not os.path.exists(GRIB_TP):
        print("Baixando TP...")
        client.retrieve(
            date=run_date,
            time=0,
            step=steps,
            param="tp",
            type="fc",
            levtype="sfc",
            stream="oper",
            target=GRIB_TP
        )

    # --- TEMPERATURA + VENTO ---
    if not os.path.exists(GRIB_TEMP):
        print("Baixando TEMP/WIND...")
        client.retrieve(
            date=run_date,
            time=0,
            step=steps,
            param="mx2t3/mn2t3/10fg",
            type="fc",
            levtype="sfc",
            stream="oper",
            target=GRIB_TEMP
        )

# =========================
# MAIN
# =========================

def gerar_json():

    client = Client(source="azure")

    now_br = datetime.utcnow() - timedelta(hours=3)
    run_date = now_br.strftime("%Y%m%d")

    # limpa arquivos antigos
    for f in os.listdir():
        if f.startswith("dados_") and f.endswith(".grib2"):
            os.remove(f)

    baixar_gribs(client, run_date)

    # =========================
    # ABRIR GRIBS SEPARADOS
    # =========================

    ds_tp = xr.open_dataset(
        GRIB_TP,
        engine="cfgrib",
        backend_kwargs={"indexpath": ""}
    )

    ds_temp = xr.open_dataset(
        GRIB_TEMP,
        engine="cfgrib",
        backend_kwargs={"indexpath": ""}
    )

    tp = ds_tp["tp"] * 1000.0
    tmax = ds_temp["mx2t3"] - 273.15
    tmin = ds_temp["mn2t3"] - 273.15
    wind = ds_temp["10fg"]

    run_time = pd.to_datetime(tp.time.item()).to_pydatetime()
    step_times = run_time + pd.to_timedelta(tp.step.values, unit="h")

    base_shift = timedelta(hours=3)

    resultado = {c["nome"]: {} for c in cidades}

    # =========================
    # LOOP DIÁRIO
    # =========================

    for d in range(5):

        start = run_time + base_shift + timedelta(days=d)
        end = start + timedelta(hours=24)

        i0 = np.argmin(np.abs(step_times - start))
        i1 = np.argmin(np.abs(step_times - end))

        chuva = tp.isel(step=i1) if d == 0 else tp.isel(step=i1) - tp.isel(step=i0)

        tmax_d = tmax.isel(step=slice(i0, i1)).max(dim="step")
        tmin_d = tmin.isel(step=slice(i0, i1)).min(dim="step")
        wind_d = wind.isel(step=slice(i0, i1)).max(dim="step")

        data_str = (start - base_shift).strftime("%Y-%m-%d")

        for cidade in cidades:

            nome = cidade["nome"]
            lat = cidade["latitude"]
            lon = cidade["longitude"]

            resultado[nome][data_str] = {
                "chuva": round(get_valor(chuva, lat, lon), 1),
                "temp_max": round(get_valor(tmax_d, lat, lon), 1),
                "temp_min": round(get_valor(tmin_d, lat, lon), 1),
                "vento_rajada": round(get_valor(wind_d, lat, lon), 1)
            }

    # =========================
    # SALVAR JSON
    # =========================

    out_file = os.path.join(json_dir, "previsao.json")

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(resultado, f, indent=2, ensure_ascii=False)

    print("JSON gerado com sucesso.")


if __name__ == "__main__":
    gerar_json()