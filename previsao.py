import os
import json
import numpy as np
import datetime as dt
import xarray as xr
from ecmwf.opendata import Client
from tqdm import tqdm
import sys
import csv

# Configurações globais
UTC = dt.timezone.utc
CITIES_PATH = "cidades.json"
GRIB_DIR = "grib"
OUT_PATH = "previsao.csv"
os.makedirs(GRIB_DIR, exist_ok=True)

def get_run_hour():
    """Define a rodada do modelo (00Z ou 12Z)."""
    now_utc = dt.datetime.now(UTC)
    if 9 <= now_utc.hour and (now_utc.hour > 9 or now_utc.minute >= 30) and now_utc.hour < 15:
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

def save_metadata(path, run_hour, date_str):
    """Gera um arquivo de auditoria com os dados técnicos do arquivo GRIB."""
    try:
        ds = xr.open_dataset(path, engine="cfgrib", backend_kwargs={"indexpath": ""})
        metadata = {
            "data_processamento": dt.datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S UTC"),
            "data_referencia_modelo": str(ds.time.values),
            "modelo": ds.attrs.get("centre", "Desconhecido"),
            "parametro_exemplo": ds.attrs.get("parameterName", "Desconhecido"),
            "execucao_solicitada": f"{date_str} {run_hour:02d}Z"
        }
        with open("metadata.txt", "w", encoding="utf-8") as f:
            for k, v in metadata.items():
                f.write(f"{k.upper()}: {v}\n")
        print(f"[INFO] Metadados registrados em metadata.txt")
    except Exception as e:
        print(f"[AVISO] Falha ao salvar metadados: {e}")

def download(client, param, name, steps, run_hour, date_str):
    """Realiza o download garantindo nomes únicos por data/rodada."""
    path = os.path.join(GRIB_DIR, f"{name}_{date_str}_{run_hour:02d}.grib")
    if os.path.exists(path):
        return path

    try:
        client.retrieve(
            date=date_str,
            time=run_hour,
            model="aifs-single",
            param=param,
            step=steps,
            target=path
        )
    except Exception as e:
        print(f"\n[AVISO CRÍTICO] Falha no download de {name}: {e}")
        sys.exit(0) # Aborta para preservar o CSV atual
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

def load_historical_today():
    historical_data = {}
    if not os.path.exists(OUT_PATH): return historical_data
    try:
        with open(OUT_PATH, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                cidade = row.get("cidade")
                if cidade and cidade not in historical_data:
                    historical_data[cidade] = row
    except Exception as e:
        print(f"[AVISO] Não foi possível ler o CSV antigo: {e}")
    return historical_data

def main():
    try:
        client = Client(source="azure")
        now = dt.datetime.now(UTC)
        run_hour = get_run_hour()

        base_date = now - dt.timedelta(days=1) if (run_hour == 12 and now.hour < 15) else now
        date_str = base_date.strftime("%Y%m%d")

        print(f"[INFO] Iniciando. Rodada Alvo: {run_hour:02d}Z | Data: {date_str}")

        historical_today = load_historical_today() if run_hour == 12 else {}
        steps = list(range(0, 121, 6))

        # Download e Auditoria
        tp_path = download(client, "tp", "chuva", steps, run_hour, date_str)
        save_metadata(tp_path, run_hour, date_str)

        tp = load_var(tp_path, 1.0)
        t2m = load_var(download(client, "2t", "temp", steps, run_hour, date_str))
        u10 = load_var(download(client, "10u", "u", steps, run_hour, date_str))
        v10 = load_var(download(client, "10v", "v", steps, run_hour, date_str))
        lcc = load_var(download(client, "lcc", "lcc", steps, run_hour, date_str))
        mcc = load_var(download(client, "mcc", "mcc", steps, run_hour, date_str))

        day_offsets = [0, 1, 2, 3, 4] if run_hour == 0 else [1, 2, 3, 4]

        with open(CITIES_PATH, "r", encoding="utf-8-sig") as f:
            cities = json.load(f)

        with open(OUT_PATH, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["cidade","dt","r","tmin","tmax","wmx","c1","c2","c3","c4"])

            for city in tqdm(cities, desc="Processando"):
                lat, lon = city.get("latitude"), city.get("longitude")
                cidade_nome = f"{city.get('nome')} - {uf_from_code(city)}"

                if run_hour == 12:
                    row_today = historical_today.get(cidade_nome)
                    if row_today:
                        writer.writerow([row_today[k] for k in ["cidade","dt","r","tmin","tmax","wmx","c1","c2","c3","c4"]])
                    else:
                        writer.writerow([cidade_nome, now.strftime("%Y-%m-%d"), 0.0, 0.0, 0.0, 0.0, 0, 0, 0, 0])

                tp_loc = tp.sel(latitude=lat, longitude=lon, method="nearest")
                t2m_vals = t2m.sel(latitude=lat, longitude=lon, method="nearest").values
                u10_vals = u10.sel(latitude=lat, longitude=lon, method="nearest").values
                v10_vals = v10.sel(latitude=lat, longitude=lon, method="nearest").values
                lcc_vals = lcc.sel(latitude=lat, longitude=lon, method="nearest").values
                mcc_vals = mcc.sel(latitude=lat, longitude=lon, method="nearest").values

                for d in day_offsets:
                    step_start = d * 24 if run_hour == 0 else 12 + ((d - 1) * 24)
                    step_end = (d + 1) * 24 if run_hour == 0 else 12 + (d * 24)
                    
                    val_end = tp_loc.sel(step=np.timedelta64(step_end, "h"), method="nearest")
                    val_start = tp_loc.sel(step=np.timedelta64(step_start, "h"), method="nearest")
                    rain_val = float((val_end - val_start).clip(min=0).item())

                    temps, winds, clouds = [], [], []
                    for h in [0, 6, 12, 18]:
                        target_step = (d * 24) + h if run_hour == 0 else 12 + ((d - 1) * 24) + h
                        idx = min(target_step // 6, len(t2m_vals) - 1)
                        
                        temps.append(float(t2m_vals[idx]) - 273.15)
                        wind = (((float(u10_vals[idx])**2) + (float(v10_vals[idx])**2))**0.5) * 3.6
                        winds.append(wind)
                        
                        l, m = float(lcc_vals[idx]), float(mcc_vals[idx])
                        clouds.append(cloud_code(max(l if l <= 1 else l/100, m if m <= 1 else m/100)))

                    writer.writerow([cidade_nome, (base_date + dt.timedelta(days=d)).strftime("%Y-%m-%d"), 
                                     round(rain_val, 2), round(min(temps), 2), round(max(temps), 2), 
                                     round(max(winds), 2), clouds[0], clouds[1], clouds[2], clouds[3]])

        print(f"Sucesso! {OUT_PATH} atualizado.")
    except Exception as e:
        print(f"[ERRO] {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()