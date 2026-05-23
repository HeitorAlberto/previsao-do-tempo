# -*- coding: utf-8 -*-

import os
import glob
import zipfile
import numpy as np
import pandas as pd
import xarray as xr

import matplotlib.pyplot as plt
import matplotlib.colors as mcolors

from scipy.ndimage import gaussian_filter
from scipy.interpolate import RegularGridInterpolator

import cartopy.crs as ccrs
import cartopy.feature as cfeature

from ecmwf.opendata import Client

from PIL import Image


# ============================================================
# CONFIGURAÇÕES
# ============================================================

OUTPUT_DIR = "mapas_chuva_brasil"
DATA_DIR = "dados_ecmwf"

os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)

RUN_HOUR = 0
DPI = 220

SIGMA_SMOOTH = 0.45
UPSCALE_FACTOR = 2


# ============================================================
# DATA UTC
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
# ESCALA DE CORES
# ============================================================

levels = [
    0, 1, 2, 5, 10, 15, 20, 30, 40, 50,
    75, 100, 125, 150, 200, 250, 300, 400
]

colors = [
    "#ffffff", "#d9d9d9", "#a1ffcb", "#56c588",
    "#96daff", "#05a2f6", "#fcffaa", "#fbff0a",
    "#ffc282", "#f98f1d", "#ff3737", "#971010",
    "#eecfb1", "#9c795c", "#5c3d28", "#d4aaff",
    "#9333ea"
]

cmap = mcolors.ListedColormap(colors)
norm = mcolors.BoundaryNorm(levels, cmap.N)


# ============================================================
# ARQUIVO GRIB2
# ============================================================

grib_file = os.path.join(
    DATA_DIR,
    f"ecmwf_tp_00z_{run_date_str}.grib2"
)


# ============================================================
# DOWNLOAD (SEM TXT, SÓ GRIB COMO CONTROLE)
# ============================================================

download_grib = True

if os.path.exists(grib_file):
    print("GRIB já existe no disco. Pulando download.")
    download_grib = False

if download_grib:

    print("Baixando rodada ECMWF 00Z...")

    client = Client(
        source="azure",
        model="ifs",
        resol="0p25"
    )

    client.retrieve(
        date=run_date.strftime("%Y-%m-%d"),
        time=RUN_HOUR,
        stream="oper",
        type="fc",
        step=[24, 48, 72, 96, 120],
        param=["tp"],
        target=grib_file
    )

    print("Download concluído.")


# ============================================================
# ABRIR DADOS
# ============================================================

ds = xr.open_dataset(grib_file, engine="cfgrib")
tp = ds["tp"] * 1000.0


# ============================================================
# LONGITUDE
# ============================================================

lon = tp.longitude.values
lon = np.where(lon > 180, lon - 360, lon)

tp = tp.assign_coords(longitude=lon)
tp = tp.sortby("longitude")


# ============================================================
# RECORTE BRASIL
# ============================================================

tp = tp.sel(latitude=slice(10, -35), longitude=slice(-75, -30))


# ============================================================
# INTERPOLAÇÃO SUAVE
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

    lat_new = np.linspace(lat.min(), lat.max(), len(lat) * UPSCALE_FACTOR)
    lon_new = np.linspace(lon.min(), lon.max(), len(lon) * UPSCALE_FACTOR)

    lon2d, lat2d = np.meshgrid(lon_new, lat_new)

    pts = np.array([lat2d.ravel(), lon2d.ravel()]).T

    chuva_interp = interp(pts).reshape(len(lat_new), len(lon_new))

    return lat_new, lon_new, chuva_interp


# ============================================================
# FUNÇÃO MAPA
# ============================================================

def plot_map(data, title, filename):

    lat_new, lon_new, chuva = smooth_data(data)

    fig = plt.figure(figsize=(8, 8))
    ax = plt.axes(projection=ccrs.PlateCarree())

    ax.set_extent([-75, -30, -35, 8])

    ax.add_feature(cfeature.BORDERS, linewidth=0.5)
    ax.add_feature(cfeature.COASTLINE, linewidth=0.6)

    im = ax.contourf(
        lon_new,
        lat_new,
        chuva,
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
                x, y,
                f"{valor:.0f}",
                fontsize=5,
                ha="center",
                va="center",
                transform=ccrs.PlateCarree(),
                bbox=dict(facecolor="white", alpha=0.65, pad=0.15, linewidth=0)
            )
        except:
            pass

    plt.title(title, fontsize=14, weight="bold")

    cbar = plt.colorbar(im, ax=ax, shrink=0.82)
    cbar.set_label("Chuva acumulada (mm)", fontsize=10)

    temp_png = os.path.join(OUTPUT_DIR, "temp.png")

    plt.savefig(temp_png, dpi=DPI, bbox_inches="tight")
    plt.close()

    webp_path = os.path.join(OUTPUT_DIR, filename)

    img = Image.open(temp_png)
    img.save(webp_path, "WEBP", quality=82, method=6)

    os.remove(temp_png)

    print("Salvo:", filename)


# ============================================================
# MAPAS 24H
# ============================================================

prev = xr.zeros_like(tp.isel(step=0))

for i in range(5):

    atual = tp.isel(step=i)
    chuva_24h = atual - prev
    prev = atual

    titulo = f"ECMWF 24h Dia {i+1}\n{run_date:%d/%m/%Y}"

    plot_map(chuva_24h, titulo, f"chuva_24h_dia_{i+1}.webp")


# ============================================================
# MAPA TOTAL
# ============================================================

total_5d = tp.isel(step=-1)

plot_map(
    total_5d,
    f"ECMWF Total 5 dias\n{run_date:%d/%m/%Y}",
    "chuva_total_5dias.webp"
)

print("OK")