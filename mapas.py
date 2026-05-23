import os
import json
import numpy as np
import pandas as pd
import xarray as xr

import matplotlib
matplotlib.use("Agg")

import matplotlib.pyplot as plt
import matplotlib.colors as mcolors

from scipy.ndimage import gaussian_filter
from scipy.interpolate import RegularGridInterpolator

import cartopy.crs as ccrs
import cartopy.feature as cfeature

from ecmwf.opendata import Client
from PIL import Image

# ============================================================
# CONFIG
# ============================================================

OUTPUT_DIR = "mapas"
DATA_DIR = "dados_ecmwf"
META_FILE = os.path.join(DATA_DIR, "ecmwf_cache_meta.json")

os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)

RUN_HOUR = 0
DPI = 220

SIGMA_SMOOTH = 0.45
UPSCALE_FACTOR = 2

# ============================================================
# DATA DO PIPELINE (SEMPRE ATUAL)
# ============================================================

utc_now = pd.Timestamp.now(tz="UTC")
run_date = utc_now.floor("D")
run_date_str = run_date.strftime("%Y%m%d")

# ============================================================
# CAPITAIS
# ============================================================

capitais = {
    "Rio Branco": (-67.81, -9.97),
    "Maceió": (-35.74, -9.66),
    "Macapá": (-51.05, 0.03),
    "Manaus": (-60.02, -3.10),
    "Salvador": (-38.50, -12.97),
    "Fortaleza": (-38.54, -3.73),
    "Brasília": (-47.88, -15.79),
    "Vitória": (-40.31, -20.31),
    "Goiânia": (-49.25, -16.68),
    "São Luís": (-44.30, -2.53),
    "Cuiabá": (-56.10, -15.60),
    "Campo Grande": (-54.62, -20.45),
    "Belo Horizonte": (-43.94, -19.92),
    "Belém": (-48.48, -1.45),
    "João Pessoa": (-34.86, -7.12),
    "Curitiba": (-49.27, -25.42),
    "Recife": (-34.88, -8.05),
    "Teresina": (-42.81, -5.09),
    "Rio de Janeiro": (-43.20, -22.90),
    "Natal": (-35.20, -5.79),
    "Porto Alegre": (-51.23, -30.03),
    "Porto Velho": (-63.90, -8.76),
    "Boa Vista": (-60.67, 2.82),
    "Florianópolis": (-48.55, -27.59),
    "São Paulo": (-46.63, -23.55),
    "Aracaju": (-37.07, -10.91),
    "Palmas": (-48.33, -10.18),
}

# ============================================================
# CORES (INALTERADO)
# ============================================================

levels = [0,1,2,5,10,15,20,30,40,50,75,100,125,150,200,250,300,400]

colors = [
    "#ffffff","#d9d9d9","#a1ffcb","#56c588","#96daff",
    "#05a2f6","#fcffaa","#fbff0a","#ffc282","#f98f1d",
    "#ff3737","#971010","#eecfb1","#9c795c","#5c3d28",
    "#d4aaff","#9333ea"
]

cmap = mcolors.ListedColormap(colors)
norm = mcolors.BoundaryNorm(levels, cmap.N)

# ============================================================
# CACHE
# ============================================================

grib_file = os.path.join(DATA_DIR, f"ecmwf_tp_00z_{run_date_str}.grib2")


def cache_ok():
    return os.path.exists(grib_file)


def save_meta(source_date):
    with open(META_FILE, "w") as f:
        json.dump({
            "run_date": run_date_str,
            "ecmwf_source_date": source_date,
            "file_exists": True
        }, f)

# ============================================================
# DOWNLOAD COM FALLBACK
# ============================================================

def fetch_ecmwf(date_obj, label):

    print(f"ECMWF tentativa: {label} ({date_obj:%Y-%m-%d})")

    client = Client(source="azure", model="ifs", resol="0p25")

    client.retrieve(
        date=date_obj.strftime("%Y-%m-%d"),
        time=RUN_HOUR,
        stream="oper",
        type="fc",
        step=[24,48,72,96,120],
        param=["tp"],
        target=grib_file
    )


def download_ecmwf():

    if cache_ok():
        print("CACHE OK")
        return

    # 1 - dia atual
    try:
        fetch_ecmwf(run_date, "dia atual")
        save_meta(run_date_str)
        print("OK: dia atual")
        return
    except Exception as e:
        print("Falha dia atual:", e)

    # 2 - fallback dia anterior
    fallback = run_date - pd.Timedelta(days=1)

    try:
        fetch_ecmwf(fallback, "dia anterior")
        save_meta(fallback.strftime("%Y%m%d"))
        print("OK: dia anterior")
        return
    except Exception as e:
        print("Falha fallback:", e)

    raise RuntimeError("ECMWF indisponível")

# ============================================================
# LOAD
# ============================================================

def load_data():

    ds = xr.open_dataset(
        grib_file,
        engine="cfgrib",
        backend_kwargs={"indexpath": ""}
    )

    tp = ds["tp"] * 1000.0

    lon = tp.longitude.values
    lon = np.where(lon > 180, lon - 360, lon)

    tp = tp.assign_coords(longitude=lon).sortby("longitude")
    tp = tp.sel(latitude=slice(10, -35), longitude=slice(-75, -30))

    return tp

# ============================================================
# PROCESSAMENTO
# ============================================================

def smooth(data):

    z = gaussian_filter(data.values, sigma=0.45)

    lat = data.latitude.values
    lon = data.longitude.values

    interp = RegularGridInterpolator(
        (lat, lon),
        z,
        bounds_error=False,
        fill_value=np.nan
    )

    lat_n = np.linspace(lat.min(), lat.max(), len(lat)*2)
    lon_n = np.linspace(lon.min(), lon.max(), len(lon)*2)

    lon2, lat2 = np.meshgrid(lon_n, lat_n)

    pts = np.array([lat2.ravel(), lon2.ravel()]).T
    out = interp(pts).reshape(len(lat_n), len(lon_n))

    return lat_n, lon_n, out

# ============================================================
# MAPA
# ============================================================

def plot(data, title, filename):

    lat, lon, z = smooth(data)

    fig = plt.figure(figsize=(8, 8))
    ax = plt.axes(projection=ccrs.PlateCarree())

    ax.set_extent([-75, -30, -35, 8])

    ax.add_feature(cfeature.BORDERS, linewidth=0.5)
    ax.add_feature(cfeature.COASTLINE, linewidth=0.6)

    im = ax.contourf(
        lon, lat, z,
        levels=levels,
        cmap=cmap,
        norm=norm,
        extend="max",
        transform=ccrs.PlateCarree()
    )

    for nome, (x, y) in capitais.items():
        try:
            v = data.sel(longitude=x, latitude=y, method="nearest").values
            ax.text(x, y, f"{v:.0f}",
                    fontsize=5,
                    ha="center",
                    va="center",
                    transform=ccrs.PlateCarree(),
                    bbox=dict(facecolor="white", alpha=0.6, pad=0.1))
        except:
            pass

    plt.title(title, fontsize=13)

    plt.colorbar(im, ax=ax, shrink=0.8, ticks=levels)

    tmp = os.path.join(OUTPUT_DIR, "tmp.png")
    plt.savefig(tmp, dpi=DPI, bbox_inches="tight")
    plt.close()

    out = os.path.join(OUTPUT_DIR, filename)

    Image.open(tmp).save(out, "WEBP", quality=82)
    os.remove(tmp)

    print("Salvo:", filename)

# ============================================================
# EXECUÇÃO
# ============================================================

def main():

    download_ecmwf()
    tp = load_data()

    prev = xr.zeros_like(tp.isel(step=0))

    for i in range(5):

        atual = tp.isel(step=i)
        chuva = atual - prev
        prev = atual

        ini = run_date + pd.Timedelta(days=i)
        fim = run_date + pd.Timedelta(days=i+1)

        title = f"ECMWF 00Z - {ini:%d/%m} → {fim:%d/%m}"

        plot(chuva, title, f"chuva_24h_{i+1}.webp")

    plot(tp.isel(step=-1),
         f"ECMWF 00Z - total 5 dias",
         "chuva_total.webp")

    print("OK")

# ============================================================

if __name__ == "__main__":
    main()