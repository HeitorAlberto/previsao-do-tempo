import os
import json
import numpy as np
import datetime as dt
import xarray as xr
from ecmwf.opendata import Client
from tqdm import tqdm
import csv

UTC = dt.timezone.utc

CITIES_PATH = "cidades.json"
GRIB_DIR = "grib"

OUT_00Z = "previsao_00z.csv"
OUT_12Z = "previsao_12z.csv"

os.makedirs(GRIB_DIR, exist_ok=True)


# ----------------------------
# RUN LOGIC
# ----------------------------
def get_run_hour():
    now = dt.datetime.now(UTC)
    return 0 if 0 <= now.hour < 12 else 12


# ----------------------------
# JSON SAFE LOAD
# ----------------------------
def load_json(path):
    with open(path, "r", encoding="utf-8-sig") as f:
        return json.load(f)


# ----------------------------
# UF MAP
# ----------------------------
UF_MAP = {
    "12":"AC","27":"AL","13":"AM","16":"AP","29":"BA","23":"CE","53":"DF",
    "32":"ES","52":"GO","21":"MA","31":"MG","50":"MS","51":"MT","15":"PA",
    "25":"PB","26":"PE","22":"PI","41":"PR","33":"RJ","24":"RN","43":"RS",
    "11":"RO","14":"RR","42":"SC","35":"SP","28":"SE","17":"TO"
}

def uf_from_code(city):
    return UF_MAP.get(str(city.get("codigo_uf", "")).zfill(2), "")


# ----------------------------
# DOWNLOAD
# ----------------------------
def download(client, param, name, steps, date, hour):
    dir_path = os.path.join(GRIB_DIR, date)
    os.makedirs(dir_path, exist_ok=True)

    file_path = os.path.join(dir_path, f"{name}_{hour:02d}.grib")

    if os.path.exists(file_path) and os.path.getsize(file_path) > 0:
        return file_path

    client.retrieve(
        date=date,
        time=hour,
        model="aifs-single",
        param=param,
        step=steps,
        target=file_path
    )

    return file_path


# ----------------------------
# LOAD VAR
# ----------------------------
def load_var(path, scale=1.0, is_rain=False):
    ds = xr.open_dataset(path, engine="cfgrib", backend_kwargs={"indexpath": ""})
    var = list(ds.data_vars)[0]

    data = ds[var] * scale
    data = data.assign_coords(longitude=(((ds.longitude + 180) % 360) - 180))

    if is_rain:
        data = data.diff(dim="step", label="lower")

    return data.load()


def extract_point(ds, lat, lon):
    return ds.sel(latitude=lat, longitude=lon, method="nearest").values


# ----------------------------
# CLOUD CLASSIFICATION
# ----------------------------
def cloud_code(v):
    v = np.clip(v, 0, 1)
    if v < 0.2:
        return 0
    if v < 0.4:
        return 1
    if v < 0.7:
        return 2
    return 3


# ----------------------------
# PROCESS
# ----------------------------
def process(run_hour, out_file):

    client = Client(source="azure")
    date = dt.datetime.now(UTC).strftime("%Y%m%d")

    steps = list(range(0, 241, 6))

    tp = load_var(download(client, "tp", "chuva", steps, date, run_hour), 1.0, True)
    t2m = load_var(download(client, "2t", "temp", steps, date, run_hour))
    u10 = load_var(download(client, "10u", "u", steps, date, run_hour))
    v10 = load_var(download(client, "10v", "v", steps, date, run_hour))
    lcc = load_var(download(client, "lcc", "lcc", steps, date, run_hour))
    mcc = load_var(download(client, "mcc", "mcc", steps, date, run_hour))

    cities = load_json(CITIES_PATH)

    results = []

    for city in tqdm(cities, desc=f"Run {run_hour}Z"):

        lat = city["latitude"]
        lon = city["longitude"]
        name = f'{city["nome"]} - {uf_from_code(city)}'

        tp_p = extract_point(tp, lat, lon)
        t2m_p = extract_point(t2m, lat, lon)
        u10_p = extract_point(u10, lat, lon)
        v10_p = extract_point(v10, lat, lon)
        lcc_p = extract_point(lcc, lat, lon)
        mcc_p = extract_point(mcc, lat, lon)

        for d in range(10):

            day = dt.datetime.now(UTC) + dt.timedelta(days=d)

            base = d * 4
            idx = [base, base+1, base+2, base+3]

            rains = np.clip(tp_p[idx], 0, None)
            temps = t2m_p[idx] - 273.15
            winds = np.sqrt(u10_p[idx]**2 + v10_p[idx]**2) * 3.6

            # FIX PRINCIPAL: normalização correta (0–1)
            clouds = np.maximum(lcc_p[idx], mcc_p[idx]) / 100.0

            results.append([
                name,
                day.strftime("%Y-%m-%d"),
                *[round(x, 2) for x in rains],
                round(float(np.min(temps)), 2),
                round(float(np.max(temps)), 2),
                round(float(np.max(winds)), 2),
                cloud_code(clouds[0]),
                cloud_code(clouds[1]),
                cloud_code(clouds[2]),
                cloud_code(clouds[3]),
            ])

    with open(out_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "cidade","dt",
            "r1","r2","r3","r4",
            "tmin","tmax","wmx",
            "c1","c2","c3","c4"
        ])
        writer.writerows(results)


# ----------------------------
# ENTRYPOINT
# ----------------------------
if __name__ == "__main__":
    run = get_run_hour()

    if run == 0:
        process(0, OUT_00Z)
    else:
        process(12, OUT_12Z)