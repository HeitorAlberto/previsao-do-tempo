# ============================================================
# MAPAS ECMWF - COM CACHE INTELIGENTE
# ============================================================

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
# DATA
# ============================================================

utc_now = pd.Timestamp.utcnow()
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
# CORES (inalterado)
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
# CACHE ECMWF
# ============================================================

grib_file = os.path.join(DATA_DIR, f"ecmwf_tp_00z_{run_date_str}.grib2")

def cache_is_valid():

    if not os.path.exists(grib_file):
        return False

    if not os.path.exists(META_FILE):
        return False

    try:
        with open(META_FILE, "r") as f:
            meta = json.load(f)

        return (
            meta.get("run_date") == run_date_str and
            meta.get("run_hour") == RUN_HOUR and
            meta.get("file_exists") is True
        )
    except:
        return False


def update_cache_meta():

    meta = {
        "run_date": run_date_str,
        "run_hour": RUN_HOUR,
        "file_exists": True
    }

    with open(META_FILE, "w") as f:
        json.dump(meta, f)


def download_ecmwf():

    if cache_is_valid():
        print("CACHE OK - usando GRIB existente")
        return

    print("Baixando ECMWF (cache miss)...")

    client = Client(source="azure", model="ifs", resol="0p25")

    client.retrieve(
        date=run_date.strftime("%Y-%m-%d"),
        time=RUN_HOUR,
        stream="oper",
        type="fc",
        step=[24,48,72,96,120],
        param=["tp"],
        target=grib_file
    )

    update_cache_meta()
    print("Download concluído + cache atualizado")

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
# SUAVIZAÇÃO
# ============================================================

def smooth_data(data):

    chuva = gaussian_filter(data.values, sigma=SIGMA_SMOOTH)

    lat = data.latitude.values
    lon = data.longitude.values

    interp = RegularGridInterpolator(
        (lat, lon),
        chuva,
        bounds_error=False,
        fill_value=np.nan
    )

    lat_new = np.linspace(lat.min(), lat.max(), len(lat)*UPSCALE_FACTOR)
    lon_new = np.linspace(lon.min(), lon.max(), len(lon)*UPSCALE_FACTOR)

    lon2d, lat2d = np.meshgrid(lon_new, lat_new)

    pts = np.array([lat2d.ravel(), lon2d.ravel()]).T

    chuva_interp = interp(pts).reshape(len(lat_new), len(lon_new))

    return lat_new, lon_new, chuva_interp

# ============================================================
# MAPA
# ============================================================

def plot_map(data, title, filename):

    lat_new, lon_new, chuva = smooth_data(data)

    fig = plt.figure(figsize=(8, 8))
    ax = plt.axes(projection=ccrs.PlateCarree())

    ax.set_extent([-75, -30, -35, 8])

    try:
        ax.add_feature(cfeature.BORDERS, linewidth=0.5)
        ax.add_feature(cfeature.COASTLINE, linewidth=0.6)

        estados = cfeature.NaturalEarthFeature(
            category="cultural",
            name="admin_1_states_provinces_lines",
            scale="10m",
            facecolor="none"
        )

        ax.add_feature(estados, edgecolor="black", linewidth=0.3)

    except:
        pass

    im = ax.contourf(
        lon_new, lat_new, chuva,
        levels=levels,
        cmap=cmap,
        norm=norm,
        extend="max",
        transform=ccrs.PlateCarree()
    )

    for cidade, (x, y) in capitais.items():
        try:
            valor = data.sel(longitude=x, latitude=y, method="nearest").values

            ax.text(
                x, y, f"{valor:.0f}",
                fontsize=5,
                ha="center",
                va="center",
                transform=ccrs.PlateCarree(),
                bbox=dict(facecolor="white", alpha=0.65, pad=0.15, linewidth=0)
            )
        except:
            pass

    plt.title(title, fontsize=13, weight="bold")

    cbar = plt.colorbar(im, ax=ax, shrink=0.82, pad=0.02, ticks=levels)
    cbar.set_label("Chuva acumulada (mm)")

    temp_png = os.path.join(OUTPUT_DIR, "temp.png")

    plt.savefig(temp_png, dpi=DPI, bbox_inches="tight")
    plt.close()

    out = os.path.join(OUTPUT_DIR, filename)

    img = Image.open(temp_png)
    img.save(out, "WEBP", quality=82, method=6, optimize=True)

    os.remove(temp_png)

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
        chuva_24h = atual - prev
        prev = atual

        inicio = run_date + pd.Timedelta(days=i)
        fim = run_date + pd.Timedelta(days=i+1)

        title = (
            f"ECMWF 0.25° - Chuva 24h\n"
            f"{inicio:%d/%m/%Y} → {fim:%d/%m/%Y}"
        )

        plot_map(chuva_24h, title, f"chuva_24h_dia_{i+1}.webp")

    total = tp.isel(step=-1)

    plot_map(
        total,
        f"ECMWF 0.25° - Chuva total 5 dias\nRodada {run_date:%d/%m/%Y}",
        "chuva_total_5dias.webp"
    )

    print("Processo finalizado")

if __name__ == "__main__":
    main()