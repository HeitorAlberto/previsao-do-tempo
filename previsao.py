import os
import json
import numpy as np
import datetime as dt
import xarray as xr
from ecmwf.opendata import Client
from tqdm import tqdm
import sys

CITIES_PATH = "cidades.json"
GRIB_DIR = "grib"

os.makedirs(GRIB_DIR, exist_ok=True)

WEEKDAYS = {
    0: "segunda-feira", 1: "terça-feira", 2: "quarta-feira",
    3: "quinta-feira", 4: "sexta-feira", 5: "sábado", 6: "domingo"
}

# ---------------- RUN ----------------
def get_run_hour():
    now = dt.datetime.utcnow()
    return 12 if now.hour >= 15 else 0


# ---------------- UTILS ----------------
def uf_from_code(city):
    UF_MAP = {
        "12":"AC","27":"AL","13":"AM","16":"AP","29":"BA","23":"CE","53":"DF",
        "32":"ES","52":"GO","21":"MA","31":"MG","50":"MS","51":"MT","15":"PA",
        "25":"PB","26":"PE","22":"PI","41":"PR","33":"RJ","24":"RN","43":"RS",
        "11":"RO","14":"RR","42":"SC","35":"SP","28":"SE","17":"TO"
    }
    return UF_MAP.get(str(city.get("codigo_uf", "")).zfill(2), "")


def download(client, param, name, date_str, steps, run_hour):
    path = os.path.join(GRIB_DIR, f"{name}_{date_str}_{run_hour}.grib")

    if os.path.exists(path):
        return path

    client.retrieve(
        date=date_str,
        time=run_hour,
        stream="oper",
        type="fc",
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
    return [
        (tp.sel(step=np.timedelta64((d + 1) * 24, "h"), method="nearest") -
         tp.sel(step=np.timedelta64(d * 24, "h"), method="nearest")).clip(min=0)
        for d in range(5)
    ]


# ---------------- MAIN ----------------
def main():
    try:
        client = Client(source="azure")

        now = dt.datetime.utcnow()
        date_str = now.strftime("%Y%m%d")

        run_hour = get_run_hour()
        steps = list(range(0, 121, 6))

        tp = load_var(download(client, "tp", "chuva", date_str, steps, run_hour), 1000.0)
        t2m = load_var(download(client, "2t", "temp", date_str, steps, run_hour))
        u10 = load_var(download(client, "10u", "u", date_str, steps, run_hour))
        v10 = load_var(download(client, "10v", "v", date_str, steps, run_hour))

        rain = daily_rain(tp)

        output = []

        with open(CITIES_PATH, "r", encoding="utf-8-sig") as f:
            cities = json.load(f)

        for city in tqdm(cities, desc="Processando"):
            lat, lon = city.get("latitude"), city.get("longitude")
            if lat is None or lon is None:
                continue

            try:
                r_loc = [r.sel(latitude=lat, longitude=lon, method="nearest") for r in rain]
                t2m_loc = t2m.sel(latitude=lat, longitude=lon, method="nearest")
                u10_loc = u10.sel(latitude=lat, longitude=lon, method="nearest")
                v10_loc = v10.sel(latitude=lat, longitude=lon, method="nearest")
            except:
                continue

            forecast = []

            for d in range(5):
                temps = [
                    float(t2m_loc.sel(step=np.timedelta64(d*24 + h, "h"), method="nearest").item()) - 273.15
                    for h in range(0, 24, 6)
                ]

                winds = [
                    (
                        (float(u10_loc.sel(step=np.timedelta64(d*24 + h, "h"), method="nearest").item())**2 +
                         float(v10_loc.sel(step=np.timedelta64(d*24 + h, "h"), method="nearest").item())**2
                        )**0.5
                    ) * 3.6
                    for h in range(0, 24, 6)
                ]

                date_obj = now + dt.timedelta(days=d)

                forecast.append({
                    "day": d + 1,
                    "date": date_obj.strftime("%Y-%m-%d"),
                    "weekday": WEEKDAYS[date_obj.weekday()],
                    "rain_mm": round(float(r_loc[d].item()), 2),
                    "temp_min_c": round(min(temps), 2),
                    "temp_max_c": round(max(temps), 2),
                    "wind_max_kmh": round(max(winds), 2)
                })

            output.append({
                "cidade": f"{city.get('nome')} - {uf_from_code(city)}",
                "forecast": forecast
            })

        final = {
            "generated_at": now.strftime("%Y-%m-%d %H:%M:%S"),
            "run_date": date_str,
            "run_hour": run_hour,
            "data": output
        }

        filename = f"previsao_{run_hour:02d}Z.json"

        with open(filename, "w", encoding="utf-8") as f:
            json.dump(final, f, ensure_ascii=False, indent=2)

        print(f"[OK] Gerado {filename}")

    except Exception as e:
        print(f"[ERRO] {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()