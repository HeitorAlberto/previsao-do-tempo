# -*- coding: utf-8 -*-
import os
import numpy as np
import datetime as dt
import xarray as xr
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
import cartopy.crs as ccrs
import cartopy.feature as cfeature
from ecmwf.opendata import Client

# =========================================================
# CONFIGURAÇÕES
# =========================================================
OUTDIR = "mapas"
os.makedirs(OUTDIR, exist_ok=True)
DAYS = 5
DPI = 200
# Área de recorte [N, O, S, L]
AREA_RECORTE = [10, -85, -40, -25]

LEVELS = [0, 1, 2.5, 5, 10, 15, 20, 30, 40, 50, 75, 100, 125, 150, 200, 300, 400]
COLORS = ["#ffffff", "#d9d9d9", "#a6a6a6", "#66ff66", "#2dbf2d", "#a5c9ff", "#1f6feb", 
          "#ffff66", "#ff751a", "#e20000", "#780000", "#78502D", "#f2bfa5", "#aa57e5", 
          "#4b0082", "#e318a6", "#ff80df"]

cmap = mcolors.ListedColormap(COLORS)
norm = mcolors.BoundaryNorm(LEVELS, ncolors=len(COLORS), extend="max")

DIAS_SEMANA = {0: "Segunda", 1: "Terça", 2: "Quarta", 3: "Quinta", 4: "Sexta", 5: "Sábado", 6: "Domingo"}

def format_title_date(date):
    return f"{DIAS_SEMANA[date.weekday()]} • {date.day:02d}/{date.month:02d}"

# =========================================================
# DOWNLOAD E PROCESSAMENTO (GRIB)
# =========================================================
def get_client():
    client = Client(source="azure")
    now = dt.datetime.utcnow()
    # Pega a rodada mais recente disponível
    run_date = now - dt.timedelta(hours=6) 
    return client, run_date

def download_tp(client, run_date):
    run_str = run_date.strftime("%Y%m%d")
    target = f"tp_{run_str}_{DAYS}d.grib"
    
    if os.path.exists(target):
        return target
    
    steps = list(range(0, (DAYS * 24) + 1, 6))
    client.retrieve(
        date=run_str, time=0, stream="oper", type="fc", param="tp",
        step=steps, area=AREA_RECORTE, target=target
    )
    return target

def load_tp(path):
    # Mantido o engine cfgrib conforme sua preferência
    ds = xr.open_dataset(path, engine="cfgrib", backend_kwargs={"indexpath": ""})
    tp = ds["tp"] * 1000.0
    return tp

def daily_accum(tp, run_date):
    tp = tp.sortby("step")
    daily = []
    for d in range(1, DAYS + 1):
        da = (tp.sel(step=d*24, method="nearest") - tp.sel(step=(d-1)*24, method="nearest")).clip(min=0)
        daily.append({"data": da, "date": run_date + dt.timedelta(days=d)})
    return daily

def setup_map():
    fig = plt.figure(figsize=(10, 10))
    ax = plt.axes(projection=ccrs.PlateCarree())
    # O set_extent segue a ordem: [Oeste, Leste, Sul, Norte]
    ax.set_extent([AREA_RECORTE[1], AREA_RECORTE[3], AREA_RECORTE[2], AREA_RECORTE[0]])
    ax.add_feature(cfeature.COASTLINE, linewidth=0.7)
    ax.add_feature(cfeature.BORDERS, linewidth=0.7)
    return fig, ax

def plot_item(data, date, title_str, outfile):
    fig, ax = setup_map()
    im = ax.contourf(data.longitude, data.latitude, data, levels=LEVELS, cmap=cmap, norm=norm, 
                     extend="max", transform=ccrs.PlateCarree())
    cbar = plt.colorbar(im, ax=ax, shrink=0.75, pad=0.02, ticks=LEVELS)
    cbar.set_label("Precipitação (mm)")
    ax.set_title(title_str, fontsize=13, weight="bold")
    plt.savefig(outfile, dpi=DPI, bbox_inches="tight")
    plt.close()

# =========================================================
# MAIN
# =========================================================
def main():
    client, run_date = get_client()
    grib = download_tp(client, run_date)
    tp = load_tp(grib)
    daily = daily_accum(tp, run_date)
    
    # Plot diários
    for i, item in enumerate(daily, start=1):
        plot_item(item["data"], item["date"], f"ECMWF • {format_title_date(item['date']-dt.timedelta(days=1))}", f"{OUTDIR}/{i:02d}.png")
    
    # Plot total
    total = sum(d["data"] for d in daily)
    start_txt = format_title_date(daily[0]["date"] - dt.timedelta(days=1))
    end_txt = format_title_date(daily[-1]["date"] - dt.timedelta(days=1))
    plot_item(total, None, f"ECMWF • Acumulado {DAYS} dias\n{start_txt} até {end_txt}", f"{OUTDIR}/06.png")

if __name__ == "__main__":
    main()
