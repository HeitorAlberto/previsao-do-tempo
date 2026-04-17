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

# =========================
# CARREGAR CIDADES
# =========================

with open("cidades.json", encoding="utf-8-sig") as f:
    cidades = json.load(f)

def get_valor(ds, lat, lon):
    ponto = ds.sel(latitude=lat, longitude=lon, method="nearest")
    return float(ponto.values)

# =========================
# MAIN
# =========================

def gerar_json():

    client = Client(source="azure")

    now_br = datetime.utcnow() - timedelta(hours=3)
    run_date_str = now_br.strftime("%Y%m%d")

    target_file = f"dados_{run_date_str}.grib2"

    # =========================
    # LIMPAR GRIBS ANTIGOS
    # =========================

    for f in os.listdir():
        if f.startswith("dados_") and (f.endswith(".grib2") or f.endswith(".idx")):
            if f != target_file:
                os.remove(f)

    # =========================
    # BAIXAR OU REUTILIZAR
    # =========================

    if os.path.exists(target_file):
        print("GRIB já existe. Reutilizando...")
    else:
        print("Baixando GRIB...")

        steps_all = list(range(0, 145, 3))  # até 5 dias

        client.retrieve(
            date=run_date_str,
            time=0,
            step=steps_all,
            param="tp/mx2t3/mn2t3/10fg",
            type="fc",
            levtype="sfc",
            stream="oper",
            target=target_file
        )

    # =========================
    # ABRIR GRIB
    # =========================

    ds = xr.open_dataset(
        target_file,
        engine="cfgrib",
        backend_kwargs={"indexpath": ""}
    )

    # =========================
    # VARIÁVEIS
    # =========================

    tp = ds["tp"] * 1000.0
    mx2t3 = ds["mx2t3"] - 273.15
    mn2t3 = ds["mn2t3"] - 273.15
    gust = ds["10fg"]

    run_time = pd.to_datetime(tp.time.item()).to_pydatetime()
    step_times = run_time + pd.to_timedelta(tp.step.values, unit="h")

    base_shift = timedelta(hours=3)

    resultado = {}

    for cidade in cidades:
        resultado[cidade["nome"]] = {}

    # =========================
    # LOOP DIÁRIO (5 dias)
    # =========================

    for d in range(5):

        start = run_time + base_shift + timedelta(days=d)
        end = start + timedelta(hours=24)

        i0 = np.argmin(np.abs(step_times - start))
        i1 = np.argmin(np.abs(step_times - end))

        chuva = tp.isel(step=i1) if d == 0 else tp.isel(step=i1) - tp.isel(step=i0)

        tmax = mx2t3.isel(step=slice(i0, i1)).max(dim="step")
        tmin = mn2t3.isel(step=slice(i0, i1)).min(dim="step")
        rajada = gust.isel(step=slice(i0, i1)).max(dim="step")

        data_str = (start - base_shift).strftime("%Y-%m-%d")

        for cidade in cidades:

            nome = cidade["nome"]
            lat = cidade["latitude"]
            lon = cidade["longitude"]

            resultado[nome][data_str] = {
                "chuva": round(get_valor(chuva, lat, lon), 1),
                "temp_max": round(get_valor(tmax, lat, lon), 1),
                "temp_min": round(get_valor(tmin, lat, lon), 1),
                "vento_rajada": round(get_valor(rajada, lat, lon), 1)
            }

    # =========================
    # SALVAR JSON
    # =========================

    with open(os.path.join(json_dir, "previsao.json"), "w", encoding="utf-8") as f:
        json.dump(resultado, f, indent=2, ensure_ascii=False)

    print("JSON gerado com sucesso.")


if __name__ == "__main__":
    gerar_json()