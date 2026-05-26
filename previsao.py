import os
import json
import numpy as np
import datetime as dt
import xarray as xr
from ecmwf.opendata import Client
from tqdm import tqdm
import sys
import csv

UTC = dt.timezone.utc

CITIES_PATH = "cidades.json"
GRIB_DIR = "grib"
OUT_PATH = "previsao.csv"
os.makedirs(GRIB_DIR, exist_ok=True)

def get_run_hour():
    """
    Define automaticamente a rodada do modelo (00Z ou 12Z) 
    com base no horário UTC atual de execução.
    """
    now_utc = dt.datetime.now(UTC)
    if 3 <= now_utc.hour < 15:
        return 0
    else:
        return 12

def uf_from_code(city):
    UF_MAP = {
        "12":"AC","27":"AL","13":"AM","16":"AP","29":"BA","23":"CE","53":"DF",
        "32":"ES","52":"GO","21":"MA","31":"MG","50":"MS","51":"MT","15":"PA",
        "25":"PB","26":"PE","22":"PI","41":"PR","33":"RJ","24":"RN","43":"RS",
        "11":"RO","14":"RR","42":"SC","35":"SP","28":"SE","17":"TO"
    }
    return UF_MAP.get(str(city.get("codigo_uf", "")).zfill(2), "")

def download(client, param, name, steps, run_hour, date_str):
    path = os.path.join(GRIB_DIR, f"{name}_{run_hour:02d}.grib")

    if os.path.exists(path):
        return path

    client.retrieve(
        date=date_str,
        time=run_hour,
        model="aifs-single",
        param=param,
        step=steps,
        target=path
    )
    return path

def load_var(path, scale=1.0):
    ds = xr.open_dataset(path, engine="cfgrib", backend_kwargs={"indexpath": ""})
    var = list(ds.data_vars)[0]

    data = (ds[var] * scale).assign_coords(
        longitude=(((ds.longitude + 180) % 360) - 180)
    )
    return data.sel(latitude=slice(10, -40), longitude=slice(-85, -25)).load()

def cloud_code(val):
    if val < 0.2: return 0
    if val < 0.5: return 1
    if val < 0.8: return 2
    return 3

def load_historical_today(today_str):
    """
    Lê o CSV antigo antes de apagá-lo e guarda na memória os dados 
    do dia de hoje para cada cidade.
    """
    historical_data = {}
    if not os.path.exists(OUT_PATH):
        return historical_data

    try:
        with open(OUT_PATH, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                if row.get("dt") == today_str:
                    historical_data[row["cidade"]] = row
    except Exception as e:
        print(f"[AVISO] Não foi possível ler o CSV antigo: {e}")
    
    return historical_data

def main():
    try:
        client = Client(source="azure")

        now = dt.datetime.now(UTC)
        run_hour = get_run_hour()

        print(f"[INFO] Executando automação para a rodada das {run_hour:02d}Z (Horário UTC atual: {now.strftime('%H:%M')})")

        # Ajuste dinâmico de data
        # Se rodar de madrugada (ex: rodada 12Z do dia anterior que está sendo coletada pós-meia-noite UTC)
        if run_hour == 12 and now.hour < 15:
            base_date = now - dt.timedelta(days=1)
        else:
            base_date = now

        date_str = base_date.strftime("%Y%m%d")
        today_csv_str = base_date.strftime("%Y-%m-%d")

        # Se for rodada das 12Z, ativa o resgate do dia atual
        historical_today = {}
        if run_hour == 12:
            print(f"Carregando dados históricos de hoje ({today_csv_str}) do CSV atual...")
            historical_today = load_historical_today(today_csv_str)

        steps = list(range(0, 121, 6))

        # Downloads e Leitura
        tp = load_var(download(client, "tp", "chuva", steps, run_hour, date_str), 1.0)
        t2m = load_var(download(client, "2t", "temp", steps, run_hour, date_str))
        u10 = load_var(download(client, "10u", "u", steps, run_hour, date_str))
        v10 = load_var(download(client, "10v", "v", steps, run_hour, date_str))
        lcc = load_var(download(client, "lcc", "lcc", steps, run_hour, date_str))
        mcc = load_var(download(client, "mcc", "mcc", steps, run_hour, date_str))

        if run_hour == 0:
            day_offsets = [0, 1, 2, 3, 4]
        else:
            day_offsets = [1, 2, 3, 4]

        with open(CITIES_PATH, "r", encoding="utf-8-sig") as f:
            cities = json.load(f)

        with open(OUT_PATH, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["cidade","dt","r","tmin","tmax","wmx","c1","c2","c3","c4"])

            for city in tqdm(cities, desc="Processando"):
                lat, lon = city.get("latitude"), city.get("longitude")
                if lat is None or lon is None:
                    continue

                cidade_nome = f"{city.get('nome')} - {uf_from_code(city)}"

                # Mesclagem automática da primeira linha para rodadas da tarde (12Z)
                if run_hour == 12:
                    row_today = historical_today.get(cidade_nome)
                    if row_today:
                        writer.writerow([
                            row_today["cidade"], row_today["dt"], row_today["r"],
                            row_today["tmin"], row_today["tmax"], row_today["wmx"],
                            row_today["c1"], row_today["c2"], row_today["c3"], row_today["c4"]
                        ])
                    else:
                        writer.writerow([cidade_nome, today_csv_str, 0.0, 0.0, 0.0, 0.0, 0, 0, 0, 0])

                try:
                    tp_loc = tp.sel(latitude=lat, longitude=lon, method="nearest")
                    t2m_loc = t2m.sel(latitude=lat, longitude=lon, method="nearest")
                    u10_loc = u10.sel(latitude=lat, longitude=lon, method="nearest")
                    v10_loc = v10.sel(latitude=lat, longitude=lon, method="nearest")
                    lcc_loc = lcc.sel(latitude=lat, longitude=lon, method="nearest")
                    mcc_loc = mcc.sel(latitude=lat, longitude=lon, method="nearest")

                    t2m_vals = t2m_loc.values
                    u10_vals = u10_loc.values
                    v10_vals = v10_loc.values
                    lcc_vals = lcc_loc.interp(step=t2m_loc.step).values
                    mcc_vals = mcc_loc.interp(step=t2m_loc.step).values

                except Exception as e:
                    print(f"ERRO grade na cidade {city.get('nome')}: {e}")
                    raise

                for d in day_offsets:
                    temps, winds, clouds = [], [], []

                    if run_hour == 0:
                        step_start = d * 24
                        step_end = (d + 1) * 24
                        hours_to_check = [0, 6, 12, 18]
                    else:
                        step_start = 12 + ((d - 1) * 24)
                        step_end = 12 + (d * 24)
                        hours_to_check = [0, 6, 12, 18]

                    val_end = tp_loc.sel(step=np.timedelta64(step_end, "h"), method="nearest")
                    val_start = tp_loc.sel(step=np.timedelta64(step_start, "h"), method="nearest")
                    rain_val = float((val_end - val_start).clip(min=0).item())

                    for h in hours_to_check:
                        if run_hour == 0:
                            target_step = (d * 24) + h
                        else:
                            target_step = 12 + ((d - 1) * 24) + h

                        idx = min(target_step // 6, len(t2m_vals) - 1)

                        temp = float(t2m_vals[idx]) - 273.15
                        u, v = float(u10_vals[idx]), float(v10_vals[idx])
                        wind = ((u ** 2 + v ** 2) ** 0.5) * 3.6

                        l, m = float(lcc_vals[idx]), float(mcc_vals[idx])
                        if l > 1: l /= 100
                        if m > 1: m /= 100

                        temps.append(temp)
                        winds.append(wind)
                        clouds.append(cloud_code(max(l, m)))

                    forecast_date = base_date + dt.timedelta(days=d)

                    writer.writerow([
                        cidade_nome,
                        forecast_date.strftime("%Y-%m-%d"),
                        round(rain_val, 2),
                        round(min(temps), 2),
                        round(max(temps), 2),
                        round(max(winds), 2),
                        clouds[0], clouds[1], clouds[2], clouds[3]
                    ])

        print(f"Sucesso! {OUT_PATH} atualizado sem perder o histórico.")

    except Exception as e:
        print(f"[ERRO] {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()