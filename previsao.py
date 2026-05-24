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

def daily_rain(tp):
    rain_daily = []
    for d in range(5):
        val_end = tp.sel(step=np.timedelta64((d + 1) * 24, "h"), method="nearest")
        val_start = tp.sel(step=np.timedelta64(d * 24, "h"), method="nearest")
        daily = (val_end - val_start).clip(min=0)
        rain_daily.append(daily)
    return rain_daily

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
        target_date = now - dt.timedelta(days=1) if now.hour < 6 else now
        date_str = target_date.strftime("%Y%m%d")
        run_hour = get_run_hour()
        steps = list(range(0, 121, 6))

        tp = load_var(download(client, "tp", "chuva", date_str, steps, run_hour), 1.0)
        t2m = load_var(download(client, "2t", "temp", date_str, steps, run_hour))
        u10 = load_var(download(client, "10u", "u", date_str, steps, run_hour))
        v10 = load_var(download(client, "10v", "v", date_str, steps, run_hour))
        lcc = load_var(download(client, "lcc", "lcc", date_str, steps, run_hour))
        mcc = load_var(download(client, "mcc", "mcc", date_str, steps, run_hour))

        rain = daily_rain(tp)

        with open(CITIES_PATH, "r", encoding="utf-8-sig") as f:
            cities = json.load(f)

        out_path = f"previsao_{run_hour:02d}Z.csv"

        with open(out_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)

            writer.writerow([
                "cidade","dt","r","tmin","tmax","wmx","c1","c2","c3","c4"
            ])

            for city in tqdm(cities, desc="Processando"):

                lat, lon = city.get("latitude"), city.get("longitude")
                if lat is None or lon is None:
                    continue

                try:
                    r_loc = [r.sel(latitude=lat, longitude=lon, method="nearest") for r in rain]
                    t2m_loc = t2m.sel(latitude=lat, longitude=lon, method="nearest")
                    u10_loc = u10.sel(latitude=lat, longitude=lon, method="nearest")
                    v10_loc = v10.sel(latitude=lat, longitude=lon, method="nearest")
                    lcc_loc = lcc.sel(latitude=lat, longitude=lon, method="nearest")
                    mcc_loc = mcc.sel(latitude=lat, longitude=lon, method="nearest")
                except:
                    continue

                cidade_nome = f"{city.get('nome')} - {uf_from_code(city)}"

                for d in range(5):

                    temps = [
                        float(
                            t2m_loc.sel(step=np.timedelta64(d*24+h, "h"), method="nearest").item()
                        ) - 273.15
                        for h in range(0, 24, 6)
                    ]

                    winds = [
                        (
                            (float(
                                u10_loc.sel(step=np.timedelta64(d*24+h, "h"), method="nearest").item()
                            ) ** 2 +
                             float(
                                v10_loc.sel(step=np.timedelta64(d*24+h, "h"), method="nearest").item()
                             ) ** 2
                            ) ** 0.5
                        ) * 3.6
                        for h in range(0, 24, 6)
                    ]

                    clouds = []
                    for h in range(0, 24, 6):
                        step_val = np.timedelta64(d*24 + h, "h")

                        l = float(lcc_loc.sel(step=step_val, method="nearest").item())
                        m = float(mcc_loc.sel(step=step_val, method="nearest").item())

                        if l > 1:
                            l /= 100
                        if m > 1:
                            m /= 100

                        clouds.append(cloud_code(max(l, m)))

                    forecast_date = target_date + dt.timedelta(days=d)

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