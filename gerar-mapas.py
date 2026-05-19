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
    pass


# ============================================================
# OTIMIZAÇÕES
# ============================================================

plt.rcParams["path.simplify"] = True
plt.rcParams["path.simplify_threshold"] = 1.0


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

DPI = 300
QUALITY_WEBP = 86

SIGMA_SMOOTH = 0.55
UPSCALE_FACTOR = 5

FIGSIZE = (9, 9)


# ============================================================
# DATA DA RODADA
# ============================================================

now_br = (
    pd.Timestamp.now(tz="America/Sao_Paulo")
    .tz_localize(None)
)

run_date = now_br.floor("D")

run_date_str = run_date.strftime("%Y%m%d")
run_date_label = run_date.strftime("%d/%m/%Y")

prev_date = run_date - pd.Timedelta(days=1)
prev_date_str = prev_date.strftime("%Y%m%d")


# ============================================================
# ARQUIVOS GRIB
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
# DOWNLOAD ECMWF
# ============================================================

if not os.path.exists(grib_file):

    print(f"Tentando baixar ECMWF 00Z ({run_date_label})...")

    client = Client(
        source="azure",
        model="ifs",
        resol="0p25"
    )

    try:

        client.retrieve(
            date=run_date.strftime("%Y-%m-%d"),
            time=0,
            stream="oper",
            type="fc",
            step=list(range(24, 241, 24)),
            param=["tp"],
            target=grib_file
        )

    except Exception:

        print("Rodada atual indisponível.")
        print("Usando rodada anterior...")

        run_date = run_date - pd.Timedelta(days=1)

        run_date_str = run_date.strftime("%Y%m%d")
        run_date_label = run_date.strftime("%d/%m/%Y")

        grib_file = os.path.join(
            DATA_DIR,
            f"ecmwf_{run_date_str}_00z.grib2"
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

    print("Download concluído.")

else:

    print(f"Usando cache: {grib_file}")


# ============================================================
# LEITURA
# ============================================================

ds = xr.open_dataset(
    grib_file,
    engine="cfgrib"
)

tp = ds["tp"] * 1000.0


# ============================================================
# LONGITUDE
# ============================================================

lon = np.where(
    tp.longitude.values > 180,
    tp.longitude.values - 360,
    tp.longitude.values
)

tp = tp.assign_coords(
    longitude=lon
).sortby("longitude")


# ============================================================
# RECORTE
# ============================================================

tp = tp.sel(
    latitude=slice(10, -35),
    longitude=slice(-75, -30)
)


# ============================================================
# ESCALA DE CORES
# ============================================================

levels = [
    0, 1, 3, 5, 10, 15, 20, 30, 40, 50,
    60, 75, 100, 125, 150, 200, 250, 300, 400
]

colors = [

    # Branco / cinza
    "#ffffff",
    "#b8b8b8",
    "#6b6b6b",

    # Verde
    "#d8f3dc",
    "#95d5b2",
    "#52b788",

    # Azul
    "#a9def9",
    "#48cae4",
    "#0077b6",

    # Amarelo
    "#faeaac",
    "#f6d864",

    # Laranja
    "#f48c06",

    # Vermelhos
    "#ff4d4d",
    "#e00000",
    "#8b0000",

    # Marrons
    "#c29d8f",
    "#5d4037",

    # Roxos
    "#9d4edd",
    "#7b2cbf",

    # Rosa extremo
    "#ff4d8d"
]

cmap = mcolors.ListedColormap(colors)

norm = mcolors.BoundaryNorm(
    levels,
    cmap.N
)


# ============================================================
# TEXTO PT-BR
# ============================================================

def formatar_data_ptbr(data):

    dias = {
        "Monday": "Segunda",
        "Tuesday": "Terça",
        "Wednesday": "Quarta",
        "Thursday": "Quinta",
        "Friday": "Sexta",
        "Saturday": "Sábado",
        "Sunday": "Domingo"
    }

    dia_semana_en = data.strftime("%A")

    dia_semana = dias.get(
        dia_semana_en,
        dia_semana_en
    )

    return f"{dia_semana}, {data.strftime('%d/%m/%Y')}"


# ============================================================
# SUAVIZAÇÃO
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

    chuva_interp = interp(pts).reshape(
        len(lat_new),
        len(lon_new)
    )

    return lat_new, lon_new, chuva_interp


# ============================================================
# MAPA
# ============================================================

def plot_map(data, filename, target_date):

    lat_new, lon_new, chuva = smooth_data(data)

    fig = plt.figure(figsize=FIGSIZE)

    ax = plt.axes(
        projection=ccrs.PlateCarree()
    )

    ax.set_extent([
        -75,
        -30,
        -35,
        8
    ])

    # Fundo
    ax.set_facecolor("#f8f8f8")

    # Países
    ax.add_feature(
        cfeature.BORDERS,
        linewidth=0.5,
        edgecolor="black"
    )

    # Costa
    ax.add_feature(
        cfeature.COASTLINE,
        linewidth=0.6
    )

    # Estados
    estados = cfeature.NaturalEarthFeature(
        category="cultural",
        name="admin_1_states_provinces_lines",
        scale="10m",
        facecolor="none"
    )

    ax.add_feature(
        estados,
        edgecolor="black",
        linewidth=0.25,
        alpha=0.6
    )

    # Chuva
    im = ax.contourf(
        lon_new,
        lat_new,
        chuva,
        levels=levels,
        cmap=cmap,
        norm=norm,
        transform=ccrs.PlateCarree(),
        extend="max",
        antialiased=False
    )

    # ========================================================
    # HEADER
    # ========================================================

    if target_date is not None:

        header = (
            f"{formatar_data_ptbr(target_date)}\n"
            f"Rodada: 00Z {run_date_label}"
        )

    else:

        header = (
            f"Acumulado de 10 dias\n"
            f"Rodada: 00Z {run_date_label}"
        )

    ax.text(
        0.015,
        0.985,
        header,
        transform=ax.transAxes,
        ha="left",
        va="top",
        fontsize=10,
        fontweight="bold",
        color="black",
        bbox=dict(
            facecolor="white",
            edgecolor="none",
            alpha=0.82,
            boxstyle="round,pad=0.35"
        )
    )

    # ========================================================
    # COLORBAR
    # ========================================================

    cbar = plt.colorbar(
        im,
        ax=ax,
        shrink=0.82,
        pad=0.02,
        ticks=levels
    )

    cbar.set_label(
        "Chuva acumulada (mm)",
        fontsize=10
    )

    cbar.ax.tick_params(
        labelsize=8
    )

    # ========================================================
    # SAVE
    # ========================================================

    temp_png = os.path.join(
        OUTPUT_DIR,
        "tmp.png"
    )

    plt.savefig(
        temp_png,
        dpi=DPI,
        bbox_inches="tight"
    )

    plt.close()

    output_file = os.path.join(
        OUTPUT_DIR,
        filename
    )

    Image.open(temp_png).save(
        output_file,
        "WEBP",
        quality=QUALITY_WEBP,
        method=6
    )

    os.remove(temp_png)

    print(f"Gerado: {filename}")


# ============================================================
# MAPAS DIÁRIOS
# ============================================================

prev = xr.zeros_like(
    tp.isel(step=0)
)

for i in range(10):

    atual = tp.isel(step=i)

    chuva_24h = atual - prev

    prev = atual

    target_date = run_date + pd.Timedelta(days=i)

    plot_map(
        chuva_24h,
        f"{i+1:02d}.webp",
        target_date
    )


# ============================================================
# ACUMULADO TOTAL (10 DIAS)
# ============================================================

total = tp.isel(step=9)

periodo_inicio = run_date
periodo_fim = run_date + pd.Timedelta(days=9)

plot_map(
    total,
    "11.webp",
    None
)

print("Finalizado.")
