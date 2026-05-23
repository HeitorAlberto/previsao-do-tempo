# -*- coding: utf-8 -*-
"""
ECMWF Open Data - Precipitação Brasil
------------------------------------

Gera:
- 5 mapas de acumulado de precipitação em 24h
- 1 mapa com acumulado total de 5 dias

Preparado para:
- GitHub Actions
- execução headless
- cache de GRIB
"""

import os
import numpy as np
import datetime as dt
import xarray as xr

# backend headless para GitHub Actions
import matplotlib
matplotlib.use("Agg")

import matplotlib.pyplot as plt
import matplotlib.colors as mcolors

import cartopy.crs as ccrs
import cartopy.feature as cfeature
import geopandas as gpd

from ecmwf.opendata import Client

# =========================================================
# CONFIG
# =========================================================
OUTDIR = "mapas"
os.makedirs(OUTDIR, exist_ok=True)

DAYS = 5

DPI = 200

LEVELS = [
    0, 1, 2.5, 5, 10, 15, 20,
    30, 40, 50, 75, 100,
    125, 150, 200, 300, 400
]

COLORS = [
    "#ffffff",
    "#d9d9d9",
    "#a6a6a6",
    "#66ff66",
    "#2dbf2d",
    "#82b4ff",
    "#1f6feb",
    "#ffff66",
    "#ff751a",
    "#e20000",
    "#780000",
    "#78502D",
    "#f2bfa5",
    "#aa57e5",
    "#4b0082",
    "#e318a6",
    "#ff80df",
]

cmap = mcolors.ListedColormap(COLORS)

norm = mcolors.BoundaryNorm(
    LEVELS,
    ncolors=len(COLORS),
    extend="max"
)

# =========================================================
# DIAS DA SEMANA
# =========================================================
DIAS_SEMANA = {
    0: "Segunda-feira",
    1: "Terça-feira",
    2: "Quarta-feira",
    3: "Quinta-feira",
    4: "Sexta-feira",
    5: "Sábado",
    6: "Domingo",
}


def format_title_date(date):

    weekday = DIAS_SEMANA[date.weekday()]

    return f"{weekday} • {date.day:02d}/{date.month:02d}/{date.year}"


# =========================================================
# CLIENTE ECMWF
# =========================================================
def get_client():

    client = Client(source="azure")

    now = dt.datetime.utcnow()

    for back in range(0, 6):

        run_date = now - dt.timedelta(days=back)

        date_str = run_date.strftime("%Y%m%d")

        try:

            client.retrieve(
                date=date_str,
                time=0,
                stream="oper",
                type="fc",
                param="tp",
                step=0,
                target="probe.grib",
            )

            if os.path.exists("probe.grib"):
                os.remove("probe.grib")

            print(f"Rodada utilizada: {date_str} 00Z")

            return client, run_date

        except Exception:
            continue

    raise RuntimeError("Nenhuma rodada válida encontrada.")


# =========================================================
# DOWNLOAD / CACHE
# =========================================================
def download_tp(client, run_date):

    run_str = run_date.strftime("%Y%m%d")

    target = f"tp_{run_str}_{DAYS}d.grib"

    # reutiliza GRIB
    if os.path.exists(target):

        print(f"Usando GRIB local: {target}")

        return target

    print("Baixando novo GRIB...")

    steps = list(range(0, (DAYS * 24) + 1, 6))

    client.retrieve(
        date=run_str,
        time=0,
        stream="oper",
        type="fc",
        param="tp",
        step=steps,
        target=target,
    )

    print(f"Download concluído: {target}")

    return target


# =========================================================
# LEITURA
# =========================================================
def load_tp(path):

    ds = xr.open_dataset(
        path,
        engine="cfgrib",
        backend_kwargs={"indexpath": ""}
    )

    tp = ds["tp"] * 1000.0

    # longitude 0-360 -> -180/180
    lon = (((tp.longitude + 180) % 360) - 180)

    tp = tp.assign_coords(longitude=lon)

    tp = tp.sortby("longitude")

    # recorte América do Sul
    tp = tp.sel(
        latitude=slice(10, -40),
        longitude=slice(-85, -25)
    )

    return tp


# =========================================================
# ACUMULADOS DIÁRIOS
# =========================================================
def daily_accum(tp, run_date):

    tp = tp.sortby("step")

    daily = []

    for d in range(1, DAYS + 1):

        t1 = np.timedelta64(d * 24, "h")
        t0 = np.timedelta64((d - 1) * 24, "h")

        a = tp.sel(step=t1, method="nearest")
        b = tp.sel(step=t0, method="nearest")

        da = (a - b).clip(min=0)

        valid_date = run_date + dt.timedelta(days=d)

        daily.append(
            {
                "data": da,
                "date": valid_date
            }
        )

    return daily


# =========================================================
# ACUMULADO TOTAL
# =========================================================
def total_accum(daily):

    total = None

    for item in daily:

        if total is None:
            total = item["data"].copy()
        else:
            total += item["data"]

    return total


# =========================================================
# ESTADOS
# =========================================================
def load_states():

    try:

        from geobr import read_state

        gdf = read_state(year=2020)

        return gdf.to_crs(4326)

    except Exception:

        world = gpd.read_file(
            gpd.datasets.get_path("naturalearth_lowres")
        )

        return world[world.name == "Brazil"].to_crs(4326)


# =========================================================
# MAPA BASE
# =========================================================
def setup_map():

    fig = plt.figure(figsize=(10, 10))

    ax = plt.axes(projection=ccrs.PlateCarree())

    ax.set_extent([-75, -30, -35, 6])

    ax.add_feature(cfeature.COASTLINE, linewidth=0.7)
    ax.add_feature(cfeature.BORDERS, linewidth=0.7)

    return fig, ax


# =========================================================
# MAPA DIÁRIO
# =========================================================
def plot_day(item, states, idx):

    data = item["data"]
    date = item["date"]

    fig, ax = setup_map()

    states.boundary.plot(
        ax=ax,
        color="black",
        linewidth=0.4,
        transform=ccrs.PlateCarree()
    )

    im = ax.contourf(
        data.longitude,
        data.latitude,
        data,
        levels=LEVELS,
        cmap=cmap,
        norm=norm,
        extend="max",
        transform=ccrs.PlateCarree(),
    )

    cbar = plt.colorbar(
        im,
        ax=ax,
        shrink=0.75,
        pad=0.02,
        ticks=LEVELS
    )

    cbar.set_label("Precipitação (mm)")
    cbar.ax.tick_params(labelsize=12)

    start = date - dt.timedelta(days=1)

    title = (
        "ECMWF • "
        f"{format_title_date(start)}"
    )

    ax.set_title(
        title,
        fontsize=13,
        weight="bold"
    )

    outfile = f"{OUTDIR}/{idx:02d}.png"

    plt.savefig(
        outfile,
        dpi=DPI,
        bbox_inches="tight"
    )

    plt.close()

    print("Gerado:", outfile)


# =========================================================
# MAPA TOTAL
# =========================================================
def plot_total(total, states, start_date):

    fig, ax = setup_map()

    states.boundary.plot(
        ax=ax,
        color="black",
        linewidth=0.4,
        transform=ccrs.PlateCarree()
    )

    im = ax.contourf(
        total.longitude,
        total.latitude,
        total,
        levels=LEVELS,
        cmap=cmap,
        norm=norm,
        extend="max",
        transform=ccrs.PlateCarree(),
    )

    cbar = plt.colorbar(
        im,
        ax=ax,
        shrink=0.75,
        pad=0.02,
        ticks=LEVELS
    )

    cbar.set_label("Precipitação acumulada (mm)")
    cbar.ax.tick_params(labelsize=12)

    start = start_date - dt.timedelta(days=1)
    end = start + dt.timedelta(days=DAYS - 1)

    dias_curto = {
        0: "Seg",
        1: "Ter",
        2: "Qua",
        3: "Qui",
        4: "Sex",
        5: "Sáb",
        6: "Dom",
    }

    start_txt = (
        f"{dias_curto[start.weekday()]}, "
        f"{start.day:02d}/{start.month:02d}"
    )

    end_txt = (
        f"{dias_curto[end.weekday()]}, "
        f"{end.day:02d}/{end.month:02d}"
    )

    title = (
        f"ECMWF • Acumulado em {DAYS} dias\n"
        f"{start_txt} até {end_txt}"
    )

    ax.set_title(
        title,
        fontsize=13,
        weight="bold"
    )

    outfile = f"{OUTDIR}/06.png"

    plt.savefig(
        outfile,
        dpi=DPI,
        bbox_inches="tight"
    )

    plt.close()

    print("Gerado:", outfile)


# =========================================================
# GERA TODOS
# =========================================================
def plot_all(daily, states):

    for i, item in enumerate(daily, start=1):

        plot_day(
            item,
            states,
            i
        )


# =========================================================
# MAIN
# =========================================================
def main():

    client, run_date = get_client()

    grib = download_tp(client, run_date)

    tp = load_tp(grib)

    states = load_states()

    daily = daily_accum(tp, run_date)

    plot_all(daily, states)

    total = total_accum(daily)

    start_date = daily[0]["date"]

    plot_total(
        total,
        states,
        start_date
    )

    print()
    print("===================================")
    print("Mapas gerados com sucesso.")
    print("Saída:", OUTDIR)
    print("===================================")


# =========================================================
# EXEC
# =========================================================
if __name__ == "__main__":
    main()