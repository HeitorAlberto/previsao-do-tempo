import os
import locale
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
# LOCALE PT-BR
# ============================================================

try:
    locale.setlocale(locale.LC_TIME, "pt_BR.UTF-8")
except:
    try:
        locale.setlocale(locale.LC_TIME, "Portuguese_Brazil.1252")
    except:
        pass


# ============================================================
# PATHS
# ============================================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

OUTPUT_DIR = os.path.join(BASE_DIR, "mapas")
DATA_DIR = os.path.join(BASE_DIR, "dados_ecmwf")

os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)


# ============================================================
# CONFIG
# ============================================================

RUN_HOUR = 0
DPI = 400
SIGMA_SMOOTH = 0.35
UPSCALE_FACTOR = 4


# ============================================================
# DATA (RODADA 00Z FIXA COM BASE NA DATA LOCAL)
# ============================================================

# Garante que a data de referência respeite o dia civil local (ex: 18/05)
run_date = pd.Timestamp.now().floor("D")
run_date_str = run_date.strftime("%Y%m%d")
run_date_label = run_date.strftime("%d/%m/%Y")

prev_date_str = (run_date - pd.Timedelta(days=1)).strftime("%Y%m%d")


# ============================================================
# GRIB PADRÃO
# ============================================================

grib_file = os.path.join(
    DATA_DIR,
    f"ecmwf_{run_date_str}_00z.grib2"
)

old_grib_file = os.path.join(
    DATA_DIR,
    f"ecmwf_{prev_date_str}_00z.grib2"
)


# ============================================================
# LIMPEZA
# ============================================================

if os.path.exists(old_grib_file):
    try:
        os.remove(old_grib_file)
    except:
        pass


# ============================================================
# DOWNLOAD (AZURE ECMWF)
# ============================================================

if not os.path.exists(grib_file):

    print(f"Baixando ECMWF 00Z do dia {run_date_label} (Azure)...")

    client = Client(
        source="azure",
        model="ifs",
        resol="0p25"
    )

    client.retrieve(
        date=run_date.strftime("%Y-%m-%d"),
        time=0,
        stream="oper",
        type="fc",
        step=list(range(24, 241, 24)),
        param=["tp"],
        target=grib_file
    )

    print(f"Download concluído: {grib_file}")

else:
    print(f"Usando cache: {grib_file}")


# ============================================================
# DADOS
# ============================================================

ds = xr.open_dataset(grib_file, engine="cfgrib")
tp = ds["tp"] * 1000.0

lon = np.where(
    tp.longitude.values > 180,
    tp.longitude.values - 360,
    tp.longitude.values
)

tp = tp.assign_coords(longitude=lon).sortby("longitude")

tp = tp.sel(
    latitude=slice(10, -35),
    longitude=slice(-75, -30)
)


# ============================================================
# CORES (ESCALA REFORMULADA)
# ============================================================

levels = [
    0, 1, 3, 6, 10, 15, 20, 25, 30, 40, 50,
    60, 70, 80, 90, 100, 125, 150, 200, 250, 300, 350, 400
]

colors = [
    # 0 a 1: Branco
    "#ffffff",
    
    # 1 a 3: Cinza claro ao escuro
    "#e0e0e0", "#8e8e8e",
    
    # 3 a 6 e 6 a 10: Verde claro ao escuro
    "#d8f3dc", "#2d6a4f",
    
    # 10 a 15 e 15 a 20: Azul claro ao escuro
    "#90e0ef", "#0077b6",
    
    # 20 a 25 e 25 a 30: Amarelo claro ao escuro
    "#fff3b0", "#ffcc00",
    
    # 30 a 40 e 40 a 50: Laranja claro ao escuro
    "#ffb703", "#fb8500",
    
    # 50 a 60, 60 a 70, 70 a 80, 80 a 90: Vermelho claro ao escuro
    ffb3b3, "#ff4d4d", "#ff0000", "#b30000",
    
    # 90 a 100, 100 a 125, 125 a 150: Marrom claro ao escuro
    "#ddb892", "#b08968", "#7f5539",
    
    # 150 a 200, 200 a 250, 250 a 300: Lilás claro ao escuro
    "#f3e8ff", "#c084fc", "#9333ea",
    
    # 300 a 350 e 350 a 400: Rosa claro ao escuro
    "#ffc2d1", "#ff0054"
]

cmap = mcolors.ListedColormap(colors)
norm = mcolors.BoundaryNorm(levels, cmap.N)


# ============================================================
# FUNÇÕES
# ============================================================

def smooth_data(data):

    chuva = gaussian_filter(
        data.values,
        sigma=SIGMA_SMOOTH
    )

    lat = data.latitude.values
    lon = data.longitude.values

    interp = RegularGridInterpolator(
        (lat, lon),
        chuva,
        bounds_error=False,
        fill_value=np.nan
    )

    lat_new = np.linspace(
        lat.min(),
        lat.max(),
        len(lat) * UPSCALE_FACTOR
    )

    lon_new = np.linspace(
        lon.min(),
        lon.max(),
        len(lon) * UPSCALE_FACTOR
    )

    lon2d, lat2d = np.meshgrid(
        lon_new,
        lat_new
    )

    pts = np.array([
        lat2d.ravel(),
        lon2d.ravel()
    ]).T

    chuva_i = interp(pts).reshape(
        len(lat_new),
        len(lon_new)
    )

    return lat_new, lon_new, chuva_i


# ============================================================
# MAPA
# ============================================================

def plot_map(data, filename, subtitle, target_date):

    lat_new, lon_new, chuva = smooth_data(data)

    fig = plt.figure(figsize=(10, 10))

    ax = plt.axes(
        projection=ccrs.PlateCarree()
    )

    ax.set_extent([
        -75, -30,
        -35, 8
    ])

    ax.add_feature(
        cfeature.BORDERS,
        linewidth=0.5
    )

    ax.add_feature(
        cfeature.COASTLINE,
        linewidth=0.6
    )

    estados = cfeature.NaturalEarthFeature(
        category="cultural",
        name="admin_1_states_provinces_lines",
        scale="10m",
        facecolor="none"
    )

    ax.add_feature(
        estados,
        edgecolor="black",
        linewidth=0.3
    )

    im = ax.contourf(
        lon_new,
        lat_new,
        chuva,
        levels=levels,
        cmap=cmap,
        norm=norm,
        transform=ccrs.PlateCarree(),
        extend="max"
    )

    # ========================================================
    # HEADER (FORMATADO EM PT-BR)
    # ========================================================

    # Força a tradução dos dias da semana baseada no locale configurado
    weekday = target_date.strftime("%A").capitalize()
    date_label = target_date.strftime("%d/%m")

    header = (
        f"{weekday}, {date_label}\n\n"
        f"Rodada: 00Z {run_date_label}"
    )

    ax.text(
        0.02,
        0.98,
        header,
        transform=ax.transAxes,
        ha="left",
        va="top",
        fontsize=9,
        bbox=dict(
            facecolor="white",
            alpha=0.7,
            edgecolor="none"
        )
    )

    # ========================================================
    # COLORBAR
    # ========================================================

    cbar = plt.colorbar(
        im,
        ax=ax,
        shrink=0.8,
        pad=0.02,
        ticks=levels
    )

    cbar.set_label(
        "Chuva acumulada (mm)",
        fontsize=9
    )

    # ========================================================
    # SAVE
    # ========================================================

    tmp = os.path.join(
        OUTPUT_DIR,
        "tmp.png"
    )

    plt.savefig(
        tmp,
        dpi=DPI,
        bbox_inches="tight"
    )

    plt.close()

    out = os.path.join(
        OUTPUT_DIR,
        filename
    )

    Image.open(tmp).save(
        out,
        "WEBP",
        quality=100,
        method=6
    )

    os.remove(tmp)

    print(f"Gerado: {filename}")


# ============================================================
# 01–10 DIÁRIOS
# ============================================================

prev = xr.zeros_like(
    tp.isel(step=0)
)

for i in range(10):

    atual = tp.isel(step=i)

    chuva_24h = atual - prev

    prev = atual

    # Garante que o passo 1 (i=0) seja D+1 (Amanhã) correto baseado na data base real
    target_date = run_date + pd.Timedelta(days=i + 1)

    plot_map(
        chuva_24h,
        f"{i+1:02d}.webp",
        "Acumulado diário",
        target_date
    )


# ============================================================
# 11 ACUMULADO
# ============================================================

total = tp.isel(step=9)

target_date = run_date + pd.Timedelta(days=10)

plot_map(
    total,
    "11.webp",
    "Acumulado 10 dias",
    target_date
)