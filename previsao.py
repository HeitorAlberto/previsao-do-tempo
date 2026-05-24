import os
import json
import numpy as np
import datetime as dt
import xarray as xr
from ecmwf.opendata import Client
from tqdm import tqdm
import sys

# Ajuste para garantir timezone-aware
UTC = dt.timezone.utc

CITIES_PATH = "cidades.json"
GRIB_DIR = "grib"
os.makedirs(GRIB_DIR, exist_ok=True)

WEEKDAYS = {
    0: "segunda-feira", 1: "terça-feira", 2: "quarta-feira",
    3: "quinta-feira", 4: "sexta-feira", 5: "sábado", 6: "domingo"
}

def get_run_hour():
    return 0

def uf_from_code(city):
    UF_MAP = {
        "12":"AC","27":"AL","13":"AM","16":"AP","29":"BA","23":"CE","53":"DF",
        "32":"ES","52":"GO","21":"MA","31":"MG","50":"MS","51":"MT","15":"PA",
        "25":"PB","26":"PE","22":"PI","41":"PR","33":"RJ","24":"RN","43":"RS",
        "11":"RO","14":"RR","42":"SC","35":"SP","28":"SE","17":"TO"
    }
    return UF_MAP.get(str(city.get("codigo_uf", "")).zfill(2), "")

def download(client, param, name, date_str, steps, run_hour):
    path = os.path.join(GRIB_DIR, f"{name}_{date_str}_{run_hour:02d}.grib")
    if os.path.exists(path): return path
    client.retrieve(date=date_str, time=run_hour, model="aifs-single", param=param, step=steps, target=path)
    return path

def load_var(path, scale=1.0):
    ds = xr.open_dataset(path, engine="cfgrib", backend_kwargs={"indexpath": ""})
    var = list(ds.data_vars)[0]
    data = (ds[var] * scale).assign_coords(longitude=(((ds.longitude + 180) % 360) - 180))
    return data.sel(latitude=slice(10, -40), longitude=slice(-85, -25)).load()

def daily_rain(tp):
    rain_daily = []
    for d in range(5):
        val_end = tp.sel(step=np.timedelta64((d + 1) * 24, "h"), method="nearest")
        val_start = tp.sel(step=np.timedelta64(d * 24, "h"), method="nearest")
        daily = (val_end - val_start).clip(min=0)
        rain_daily.append(daily)
    return rain_daily

def descrever_nuvens(lcc_val, mcc_val):
    # AIFS retorna frações de 0 a 1. Normaliza se necessário.
    cobertura_max = max(lcc_val, mcc_val)
    if cobertura_max < 0.2: return "Céu claro a poucas nuvens"
    if cobertura_max < 0.5: return "Céu parcialmente nublado"
    if cobertura_max < 0.8: return "Predomínio de nuvens"
    return "Céu encoberto"

def main():
    try:
        client = Client(source="azure")
        now = dt.datetime.now(UTC)
        target_date = now - dt.timedelta(days=1) if now.hour < 6 else now
        date_str = target_date.strftime("%Y%m%d")
        run_hour = get_run_hour()
        steps = list(range(0, 121, 6))

        # IMPORTANTE: Escala de precipitação definida como 1.0 para o AIFS
        tp = load_var(download(client, "tp", "chuva", date_str, steps, run_hour), 1.0)
        t2m = load_var(download(client, "2t", "temp", date_str, steps, run_hour))
        u10 = load_var(download(client, "10u", "u", date_str, steps, run_hour))
        v10 = load_var(download(client, "10v", "v", date_str, steps, run_hour))
        lcc = load_var(download(client, "lcc", "lcc", date_str, steps, run_hour))
        mcc = load_var(download(client, "mcc", "mcc", date_str, steps, run_hour))

        rain = daily_rain(tp)
        
        with open(CITIES_PATH, "r", encoding="utf-8-sig") as f:
            cities = json.load(f)

        output = []
        for city in tqdm(cities, desc="Processando"):
            lat, lon = city.get("latitude"), city.get("longitude")
            if lat is None or lon is None: continue

            try:
                r_loc = [r.sel(latitude=lat, longitude=lon, method="nearest") for r in rain]
                t2m_loc = t2m.sel(latitude=lat, longitude=lon, method="nearest")
                u10_loc = u10.sel(latitude=lat, longitude=lon, method="nearest")
                v10_loc = v10.sel(latitude=lat, longitude=lon, method="nearest")
                lcc_loc = lcc.sel(latitude=lat, longitude=lon, method="nearest")
                mcc_loc = mcc.sel(latitude=lat, longitude=lon, method="nearest")
            except: continue

            forecast = []
            for d in range(5):
                temps = [float(t2m_loc.sel(step=np.timedelta64(d*24+h, "h"), method="nearest").item()) - 273.15 for h in range(0, 24, 6)]
                winds = [((float(u10_loc.sel(step=np.timedelta64(d*24+h, "h"), method="nearest").item())**2 + float(v10_loc.sel(step=np.timedelta64(d*24+h, "h"), method="nearest").item())**2)**0.5) * 3.6 for h in range(0, 24, 6)]
                
                periodos = {}
                for h in range(0, 24, 6):
                    step_val = np.timedelta64(d*24 + h, "h")
                    l = float(lcc_loc.sel(step=step_val, method="nearest").item())
                    l = l/100 if l > 1 else l
                    m = float(mcc_loc.sel(step=step_val, method="nearest").item())
                    m = m/100 if m > 1 else m
                    periodos[f"{h:02d}h"] = {"cloud_desc": descrever_nuvens(l, m)}

                forecast_date = target_date + dt.timedelta(days=d)
                forecast.append({
                    "day": d + 1, "date": forecast_date.strftime("%Y-%m-%d"), "weekday": WEEKDAYS[forecast_date.weekday()],
                    "rain_mm": round(float(r_loc[d].item()), 2), "temp_min_c": round(min(temps), 2),
                    "temp_max_c": round(max(temps), 2), "wind_max_kmh": round(max(winds), 2), "periods": periodos
                })

            output.append({"cidade": f"{city.get('nome')} - {uf_from_code(city)}", "forecast": forecast})

        with open(f"previsao_{run_hour:02d}Z.json", "w", encoding="utf-8") as f:
            json.dump({"generated_at": now.strftime("%Y-%m-%d %H:%M:%S"), "data": output}, f, ensure_ascii=False, indent=2)

    except Exception as e:
        print(f"[ERRO] {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()