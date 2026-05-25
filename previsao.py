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
os.makedirs(GRIB_DIR, exist_ok=True)

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
    if val < 0.2:
        return 0
    if val < 0.5:
        return 1
    if val < 0.8:
        return 2
    return 3

def main():
    try:
        client = Client(source="azure")

        now = dt.datetime.now(UTC)
        date_str = now.strftime("%Y%m%d")
        run_hour = get_run_hour()
        steps = np.array(list(range(0, 121, 6)), dtype="timedelta64[h]")

        tp = load_var(download(client, "tp", "chuva", steps, run_hour, date_str), 1.0)
        t2m = load_var(download(client, "2t", "temp", steps, run_hour, date_str))
        u10 = load_var(download(client, "10u", "u", steps, run_hour, date_str))
        v10 = load_var(download(client, "10v", "v", steps, run_hour, date_str))
        lcc = load_var(download(client, "lcc", "lcc", steps, run_hour, date_str))
        mcc = load_var(download(client, "mcc", "mcc", steps, run_hour, date_str))

        rain_daily = []
        for d in range(5):
            val_end = tp.sel(step=np.timedelta64((d + 1) * 24, "h"), method="nearest")
            val_start = tp.sel(step=np.timedelta64(d * 24, "h"), method="nearest")
            rain_daily.append((val_end - val_start).clip(min=0))

        with open(CITIES_PATH, "r", encoding="utf-8-sig") as f:
            cities = json.load(f)

        out_path = f"previsao_{run_hour:02d}Z.csv"

        with open(out_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["cidade","dt","r","tmin","tmax","wmx","c1","c2","c3","c4"])

            for city in tqdm(cities, desc="Processando"):

                lat, lon = city.get("latitude"), city.get("longitude")
                if lat is None or lon is None:
                    continue

                try:
                    r_loc = [r.sel(latitude=lat, longitude=lon, method="nearest") for r in rain_daily]

                    t2m_loc = t2m.sel(latitude=lat, longitude=lon, method="nearest")
                    u10_loc = u10.sel(latitude=lat, longitude=lon, method="nearest")
                    v10_loc = v10.sel(latitude=lat, longitude=lon, method="nearest")
                    lcc_loc = lcc.sel(latitude=lat, longitude=lon, method="nearest")
                    mcc_loc = mcc.sel(latitude=lat, longitude=lon, method="nearest")

                    # arrays rápidos (sem sel dentro do loop)
                    t2m_vals = t2m_loc.values
                    u10_vals = u10_loc.values
                    v10_vals = v10_loc.values

                    # nuvens interpoladas para mesma grade (evita conflito)
                    lcc_vals = lcc_loc.interp(step=t2m_loc.step).values
                    mcc_vals = mcc_loc.interp(step=t2m_loc.step).values

                except:
                    continue

                cidade_nome = f"{city.get('nome')} - {uf_from_code(city)}"

                for d in range(5):

                    temps = []
                    winds = []
                    clouds = []

                    for h in range(0, 24, 6):
                        idx = d * 4 + h // 6

                        temp = float(t2m_vals[idx]) - 273.15
                        u = float(u10_vals[idx])
                        v = float(v10_vals[idx])

                        wind = ((u ** 2 + v ** 2) ** 0.5) * 3.6

                        l = float(lcc_vals[idx])
                        m = float(mcc_vals[idx])

                        if l > 1:
                            l /= 100
                        if m > 1:
                            m /= 100

                        temps.append(temp)
                        winds.append(wind)
                        clouds.append(cloud_code(max(l, m)))

                    forecast_date = now + dt.timedelta(days=d)

                    writer.writerow([
                        cidade_nome,
                        forecast_date.strftime("%Y-%m-%d"),
                        round(float(r_loc[d].item()), 2),
                        round(min(temps), 2),
                        round(max(temps), 2),
                        round(max(winds), 2),
                        clouds[0],
                        clouds[1],
                        clouds[2],
                        clouds[3]
                    ])

    except Exception as e:
        print(f"[ERRO] {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()