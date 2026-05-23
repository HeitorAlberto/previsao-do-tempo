import os
import json
import numpy as np
import datetime as dt
import xarray as xr
from ecmwf.opendata import Client
from tqdm import tqdm

# --- CONFIGURAÇÃO ---
CITIES_PATH = "cidades.json"
GRIB_DIR = "grib"
OUT_PATH = "previsao.json"

if not os.path.exists(GRIB_DIR):
    os.makedirs(GRIB_DIR)

WEEKDAYS = {0: "segunda-feira", 1: "terça-feira", 2: "quarta-feira", 3: "quinta-feira", 4: "sexta-feira", 5: "sábado", 6: "domingo"}
PERIODS = {"madrugada": (0, 6), "manha": (6, 12), "tarde": (12, 18), "noite": (18, 24)}

# --- FUNÇÕES ---
def classify_cloud(tcc):
    if tcc < 0.2: return "céu limpo"
    elif tcc < 0.4: return "poucas nuvens"
    elif tcc < 0.7: return "parcialmente nublado"
    else: return "nublado"

def uf_from_code(city):
    uf_code = str(city.get("codigo_uf", "")).zfill(2)
    UF_MAP = {"12":"AC", "27":"AL", "13":"AM", "16":"AP", "29":"BA", "23":"CE", "53":"DF", "32":"ES", "52":"GO", "21":"MA", "31":"MG", "50":"MS", "51":"MT", "15":"PA", "25":"PB", "26":"PE", "22":"PI", "41":"PR", "33":"RJ", "24":"RN", "43":"RS", "11":"RO", "14":"RR", "42":"SC", "35":"SP", "28":"SE", "17":"TO"}
    return UF_MAP.get(uf_code, "")

def run_fallback_date(client):
    now = dt.datetime.now(dt.UTC)
    for back in range(0, 6):
        run_date = now - dt.timedelta(days=back)
        try:
            client.retrieve(date=run_date.strftime("%Y%m%d"), time=0, stream="oper", type="fc", param="tp", step=0, target="probe.grib")
            if os.path.exists("probe.grib"): os.remove("probe.grib")
            return run_date
        except: continue
    raise RuntimeError("Sem rodada disponível")

def download_cached(client, param, name, date_str, steps):
    path = os.path.join(GRIB_DIR, f"{name}_{date_str}.grib")
    if os.path.exists(path): return path
    print(f"[DOWNLOAD] {name}")
    try:
        client.retrieve(date=date_str, time=0, stream="oper", type="fc", param=param, step=steps, target=path)
    except:
        client.retrieve(date=date_str, time=0, stream="oper", type="fc", param=param, step=0, target=path)
    return path

def load_var(path, scale=1.0):
    ds = xr.open_dataset(path, engine="cfgrib", backend_kwargs={"indexpath": ""})
    var = list(ds.data_vars)[0]
    data = (ds[var] * scale).assign_coords(longitude=(((ds.longitude + 180) % 360) - 180)).sortby("longitude")
    return data.sel(latitude=slice(10, -40), longitude=slice(-85, -25)).sortby("step").load()

def daily_rain(tp):
    return [(tp.sel(step=np.timedelta64((d + 1) * 24, "h"), method="nearest") - tp.sel(step=np.timedelta64(d * 24, "h"), method="nearest")).where(lambda x: x >= 0) for d in range(5)]

def cloud_by_period(tcc_local, day_index):
    result = {}
    for name, (h0, h1) in PERIODS.items():
        samples = [float(tcc_local.sel(step=np.timedelta64(day_index * 24 + h, "h"), method="nearest").item()) for h in range(h0, h1, 6)]
        result[name] = classify_cloud(sum(samples)/len(samples)) if samples else None
    return result

# --- MAIN ---
def main():
    client = Client(source="azure")
    run_date = run_fallback_date(client)
    date_str = run_date.strftime("%Y%m%d")
    steps = list(range(0, 121, 6))

    tp, t2m = load_var(download_cached(client, "tp", "chuva", date_str, steps), 1000.0), load_var(download_cached(client, "2t", "temp", date_str, steps))
    u10, v10 = load_var(download_cached(client, "10u", "u", date_str, steps)), load_var(download_cached(client, "10v", "v", date_str, steps))
    tcc = load_var(download_cached(client, "tcc", "cloud", date_str, steps))

    rain, output = daily_rain(tp), []
    with open(CITIES_PATH, "r", encoding="utf-8-sig") as f: cities = json.load(f)

    for city in tqdm(cities, desc="Processando", unit="cidade"):
        lat, lon = city.get("latitude"), city.get("longitude")
        if lat is None or lon is None: continue
        
        try:
            r_loc = [r.sel(latitude=lat, longitude=lon, method="nearest") for r in rain]
            t2m_loc, u10_loc, v10_loc, tcc_loc = t2m.sel(latitude=lat, longitude=lon, method="nearest"), u10.sel(latitude=lat, longitude=lon, method="nearest"), v10.sel(latitude=lat, longitude=lon, method="nearest"), tcc.sel(latitude=lat, longitude=lon, method="nearest")
        except: continue

        forecast = []
        for d in range(5):
            temps = [float(t2m_loc.sel(step=np.timedelta64(d*24+h, "h"), method="nearest").item())-273.15 for h in range(0,24,6)]
            winds = [((float(u10_loc.sel(step=np.timedelta64(d*24+h, "h"), method="nearest").item())**2 + float(v10_loc.sel(step=np.timedelta64(d*24+h, "h"), method="nearest").item())**2)**0.5)*3.6 for h in range(0,24,6)]
            clouds = cloud_by_period(tcc_loc, d)
            date_obj = run_date + dt.timedelta(days=d)
            
            forecast.append({
                "day": d + 1, "date": date_obj.strftime("%Y-%m-%d"), "weekday": WEEKDAYS[date_obj.weekday()],
                "rain_mm": round(float(r_loc[d].item()), 2), "temp_min_c": round(min(temps), 2), 
                "temp_max_c": round(max(temps), 2), "wind_max_kmh": round(max(winds), 2),
                "nuvens_madrugada": clouds["madrugada"], "nuvens_manha": clouds["manha"], 
                "nuvens_tarde": clouds["tarde"], "nuvens_noite": clouds["noite"]
            })
        output.append({"cidade": f"{city.get('nome')} - {uf_from_code(city)}", "forecast": forecast})

    with open(OUT_PATH, "w", encoding="utf-8") as f: json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"\n[OK] Arquivo salvo em {OUT_PATH}")

if __name__ == "__main__":
    main()