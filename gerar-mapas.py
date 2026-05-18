import os
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
# PATHS (REPOSITÓRIO: previsao-do-tempo)
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
DPI = 600
SIGMA_SMOOTH = 0.35
UPSCALE_FACTOR = 4


# ============================================================
# DATA (RODADA 00Z FIXA)
# ============================================================

run_date = pd.Timestamp.utcnow().floor("D")
run_date_str = run_date.strftime("%Y%m%d")

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
# LIMPEZA (remove somente dia anterior)
# ============================================================

if os.path.exists(old_grib_file):
    try:
        os.remove(old_grib_file)
    except:
        pass


# ============================================================
# DOWNLOAD (AZURE ECMWF - CACHE DIÁRIO)
# ============================================================

if not os.path.exists(grib_file):

    print("Baixando ECMWF 00Z (Azure)...")

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
        step=list(range(24, 241, 24)),  # 10 dias
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

lon = np.where(tp.longitude.values > 180, tp.longitude.values - 360, tp.longitude.values)
tp = tp.assign_coords(longitude=lon).sortby("longitude")

tp = tp.sel(latitude=slice(10, -35), longitude=slice(-75, -30))


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
# CORES
# ============================================================

levels = [0,1,2,5,10,15,20,25,30,40,50,60,70,80,90,100,125,150,200,250,300,350,400]

colors = [
    "#ffffff","#d9d9d9","#9e9e9e",
    "#d8f3dc","#95d5b2","#2d6a4f",
    "#caf0f8","#90e0ef","#48cae4","#0077b6","#023e8a",
    "#f3e8ff","#d8b4fe","#c084fc","#9333ea",
    "#ddb892","#b08968","#7f5539",
    "#ffc2d1","#ff8fab","#ff4d6d","#ff0054"
]

cmap = mcolors.ListedColormap(colors)
norm = mcolors.BoundaryNorm(levels, cmap.N)


# ============================================================
# PROCESSAMENTO
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
    chuva_i = interp(pts).reshape(len(lat_new), len(lon_new))

    return lat_new, lon_new, chuva_i


# ============================================================
# MAPA
# ============================================================

def plot_map(data, filename, title):

    lat_new, lon_new, chuva = smooth_data(data)

    fig = plt.figure(figsize=(10, 10))
    ax = plt.axes(projection=ccrs.PlateCarree())

    ax.set_extent([-75, -30, -35, 8])

    ax.add_feature(cfeature.BORDERS, linewidth=0.5)
    ax.add_feature(cfeature.COASTLINE, linewidth=0.6)

    estados = cfeature.NaturalEarthFeature(
        category="cultural",
        name="admin_1_states_provinces_lines",
        scale="10m",
        facecolor="none"
    )
    ax.add_feature(estados, edgecolor="black", linewidth=0.3)

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

    for cidade, (x, y) in capitais.items():
        try:
            v = data.sel(longitude=x, latitude=y, method="nearest").values
            ax.text(
                x, y, f"{v:.0f}",
                fontsize=5,
                ha="center",
                va="center",
                transform=ccrs.PlateCarree(),
                bbox=dict(facecolor="white", alpha=0.6, pad=0.2, linewidth=0)
            )
        except:
            pass

    plt.title(title, fontsize=12, weight="bold")

    cbar = plt.colorbar(im, ax=ax, shrink=0.8, pad=0.02, ticks=levels)
    cbar.set_label("Chuva acumulada (mm)", fontsize=9)

    tmp = os.path.join(OUTPUT_DIR, "tmp.png")
    plt.savefig(tmp, dpi=DPI, bbox_inches="tight")
    plt.close()

    out = os.path.join(OUTPUT_DIR, filename)

    Image.open(tmp).save(out, "WEBP", quality=100, method=6)
    os.remove(tmp)

    print(f"Gerado: {filename}")


# ============================================================
# 01–10 DIÁRIOS
# ============================================================

prev = xr.zeros_like(tp.isel(step=0))

for i in range(10):

    atual = tp.isel(step=i)
    chuva_24h = atual - prev
    prev = atual

    plot_map(
        chuva_24h,
        f"{i+1:02d}.webp",
        f"Chuva 24h - Dia {i+1}"
    )


# ============================================================
# 11 ACUMULADO
# ============================================================

total = tp.isel(step=9)

plot_map(
    total,
    "11.webp",
    "Chuva acumulada 10 dias"
)