from pathlib import Path
from typing import Any
import base64
from io import BytesIO

import numpy as np
import rasterio
from PIL import Image, ImageDraw
from PIL import Image
from rasterio.features import shapes
from rasterio.io import MemoryFile


def _valid_values(array: np.ndarray, nodata: float | None) -> np.ndarray:
    values = array[np.isfinite(array)]
    if nodata is not None:
        values = values[values != nodata]
    return values


def _band(src: rasterio.DatasetReader, band_number: int, max_size: int = 2048) -> np.ndarray:
    scale = min(1.0, max_size / max(src.width, src.height))
    out_height = max(1, round(src.height * scale))
    out_width = max(1, round(src.width * scale))
    values = src.read(
        band_number,
        out_shape=(out_height, out_width),
        masked=True,
        resampling=rasterio.enums.Resampling.bilinear,
    ).astype(np.float32)
    return values.filled(np.nan)


def _ndvi(red: np.ndarray, nir: np.ndarray) -> np.ndarray:
    denominator = nir + red
    with np.errstate(divide="ignore", invalid="ignore"):
        result = np.divide(nir - red, denominator, out=np.full_like(nir, np.nan), where=denominator != 0)
    return np.clip(result, -1.0, 1.0)


def _bounds_for_shape(src: rasterio.DatasetReader, row: int, col: int, height: int, width: int) -> list[float]:
    scale_x = src.width / width
    scale_y = src.height / height
    left, top = src.transform * (col * scale_x, row * scale_y)
    right, bottom = src.transform * ((col + 1) * scale_x, (row + 1) * scale_y)
    return [round(left, 6), round(bottom, 6), round(right, 6), round(top, 6)]


def _detect_regions(src: rasterio.DatasetReader, image: np.ndarray, ndvi: np.ndarray | None) -> list[dict[str, Any]]:
    valid = np.isfinite(image)
    if not valid.any():
        return []

    if ndvi is not None:
        valid &= np.isfinite(ndvi)
        threshold = float(np.nanpercentile(image[valid], 70))
        mask = valid & (ndvi < 0.25) & (image > threshold)
        detection_type = "bright non-vegetated region"
    else:
        threshold = float(np.nanpercentile(image[valid], 92))
        mask = valid & (image >= threshold)
        detection_type = "high-reflectance candidate"

    if not mask.any():
        return []

    region_list = []
    transform = src.transform
    for geometry, value in shapes(mask.astype(np.uint8), mask=mask, transform=transform):
        if value != 1:
            continue
        coordinates = geometry["coordinates"][0]
        xs = [point[0] for point in coordinates]
        ys = [point[1] for point in coordinates]
        area = abs((max(xs) - min(xs)) * (max(ys) - min(ys)))
        if area <= 0:
            continue
        region_list.append({
            "type": detection_type,
            "area": round(area, 3),
            "bbox": [round(min(xs), 6), round(min(ys), 6), round(max(xs), 6), round(max(ys), 6)],
        })

    return sorted(region_list, key=lambda region: region["area"], reverse=True)[:100]


def _analyze_dataset(src: rasterio.DatasetReader, path: Path) -> dict[str, Any]:
        first_band = _band(src, 1)
        if src.count >= 8:
            red_band, nir_band = 4, 8
        elif src.count == 4:
            red_band, nir_band = 3, 4
        elif src.count == 2:
            red_band, nir_band = 1, 2
        else:
            red_band = nir_band = None
        red = _band(src, red_band) if red_band else None
        nir = _band(src, nir_band) if nir_band else None
        ndvi = _ndvi(red, nir) if nir is not None else None
        values = _valid_values(first_band, src.nodata)
        metadata: dict[str, Any] = {
            "filename": path.name,
            "width": src.width,
            "height": src.height,
            "bands": src.count,
            "dtype": src.dtypes[0],
            "crs": str(src.crs) if src.crs else None,
            "bounds": [round(value, 6) for value in src.bounds],
            "transform": list(src.transform)[:6],
            "pixel_count": int(src.width * src.height),
            "footprint_area": round(abs(src.transform.a * src.transform.e - src.transform.b * src.transform.d) * src.width * src.height, 6),
            "mean_value": round(float(np.mean(values)), 4) if values.size else None,
            "min_value": round(float(np.min(values)), 4) if values.size else None,
            "max_value": round(float(np.max(values)), 4) if values.size else None,
            "ndvi_mean": round(float(np.nanmean(ndvi)), 4) if ndvi is not None and np.isfinite(ndvi).any() else None,
            "ndvi_min": round(float(np.nanmin(ndvi)), 4) if ndvi is not None and np.isfinite(ndvi).any() else None,
            "ndvi_max": round(float(np.nanmax(ndvi)), 4) if ndvi is not None and np.isfinite(ndvi).any() else None,
        }
        regions = _detect_regions(src, first_band, ndvi)
        metadata["detected_objects"] = len(regions)
        metadata["detections"] = regions
        return metadata


def analyze_raster(image_path: str) -> dict[str, Any]:
    path = Path(image_path).resolve()
    try:
        with rasterio.open(path) as src:
            return _analyze_dataset(src, path)
    except Exception as raster_error:
        if path.suffix.lower() not in {".png", ".jpg", ".jpeg"}:
            raise raster_error

        with Image.open(path) as image:
            array = np.asarray(image.convert("RGBA" if image.mode == "RGBA" else "RGB"))
        if array.ndim == 2:
            array = array[:, :, None]
        bands = np.moveaxis(array, -1, 0)
        profile = {
            "driver": "GTiff",
            "width": array.shape[1],
            "height": array.shape[0],
            "count": bands.shape[0],
            "dtype": bands.dtype,
            "transform": rasterio.Affine.identity(),
        }
        with MemoryFile() as memory:
            with memory.open(**profile) as dataset:
                dataset.write(bands)
                return _analyze_dataset(dataset, path)


def compute_ndvi(image_path: str) -> dict[str, Any]:
    metadata = analyze_raster(image_path)
    if metadata["ndvi_mean"] is None:
        return {"status": "unavailable", "description": "The raster has fewer than two bands; NDVI requires red and near-infrared bands.", "metadata": metadata}
    return {
        "status": "success",
        "description": f"Mean NDVI is {metadata['ndvi_mean']:.4f} across a {metadata['width']}x{metadata['height']} raster.",
        "metadata": metadata,
    }


def compare_rasters(first_path: str, second_path: str) -> dict[str, Any]:
    with rasterio.open(first_path) as first, rasterio.open(second_path) as second:
        height = min(first.height, second.height, 2048)
        width = min(first.width, second.width, 2048)
        first_data = first.read(1, out_shape=(height, width), masked=True).astype(np.float32).filled(np.nan)
        second_data = second.read(1, out_shape=(height, width), masked=True).astype(np.float32).filled(np.nan)
        valid = np.isfinite(first_data) & np.isfinite(second_data)
        if not valid.any():
            raise ValueError("The two rasters have no overlapping valid pixels")
        difference = np.abs(second_data - first_data)
        threshold = float(np.nanpercentile(difference[valid], 85))
        changed = valid & (difference > threshold) if threshold > 0 else valid & (difference > 0)
        changed_percent = float(changed.sum() / valid.sum() * 100)
        return {
            "baseline": analyze_raster(first_path),
            "comparison": analyze_raster(second_path),
            "changed_pixels": int(changed.sum()),
            "valid_pixels": int(valid.sum()),
            "change_percent": round(changed_percent, 2),
            "difference_threshold": round(threshold, 6),
            "method": "absolute band-1 difference at the 85th percentile threshold",
        }


def fuse_rasters(optical_path: str, radar_path: str) -> dict[str, Any]:
    with rasterio.open(optical_path) as optical, rasterio.open(radar_path) as radar:
        height = min(optical.height, radar.height, 2048)
        width = min(optical.width, radar.width, 2048)
        optical_data = optical.read(1, out_shape=(height, width), masked=True).astype(np.float32).filled(np.nan)
        radar_data = radar.read(1, out_shape=(height, width), masked=True).astype(np.float32).filled(np.nan)
        valid = np.isfinite(optical_data) & np.isfinite(radar_data)
        if not valid.any():
            raise ValueError("The optical and radar scenes have no overlapping valid pixels")

        def normalize(values: np.ndarray) -> np.ndarray:
            low, high = np.nanpercentile(values[valid], [2, 98])
            spread = max(float(high - low), 1e-6)
            return np.clip((values - low) / spread, 0, 1)

        fused = (normalize(optical_data) + normalize(radar_data)) / 2
        active = valid & (fused >= float(np.nanpercentile(fused[valid], 75)))
        return {
            "optical": analyze_raster(optical_path),
            "radar": analyze_raster(radar_path),
            "valid_pixels": int(valid.sum()),
            "fused_mean": round(float(np.nanmean(fused[valid])), 4),
            "high_response_percent": round(float(active.sum() / valid.sum() * 100), 2),
            "method": "per-scene 2nd-98th percentile normalization followed by equal-weight fusion",
        }


def create_fusion_preview(optical_path: str, radar_path: str) -> str:
    with rasterio.open(optical_path) as optical, rasterio.open(radar_path) as radar:
        height = min(optical.height, radar.height, 512)
        width = min(optical.width, radar.width, 512)
        optical_data = optical.read(1, out_shape=(height, width), masked=True).astype(np.float32).filled(np.nan)
        radar_data = radar.read(1, out_shape=(height, width), masked=True).astype(np.float32).filled(np.nan)
    valid = np.isfinite(optical_data) & np.isfinite(radar_data)
    if not valid.any():
        raise ValueError("The optical and radar scenes have no overlapping valid pixels")

    def normalize(values: np.ndarray) -> np.ndarray:
        low, high = np.nanpercentile(values[valid], [2, 98])
        return np.clip((values - low) / max(float(high - low), 1e-6), 0, 1)

    optical_norm = normalize(optical_data)
    radar_norm = normalize(radar_data)
    fused = (optical_norm + radar_norm) / 2
    rgb = np.zeros((*fused.shape, 3), dtype=np.uint8)
    rgb[..., 0] = (fused * 255).astype(np.uint8)
    rgb[..., 1] = (optical_norm * 180).astype(np.uint8)
    rgb[..., 2] = (radar_norm * 220).astype(np.uint8)

    panel_width, panel_height = 360, 300
    canvas = Image.new("RGB", (panel_width * 3, 430), (12, 18, 32))
    draw = ImageDraw.Draw(canvas)
    panels = [
        ("OPTICAL NORMALIZED", optical_norm),
        ("RADAR NORMALIZED", radar_norm),
        ("FUSED RESPONSE", rgb),
    ]
    for index, (label, values) in enumerate(panels):
        if values.ndim == 2:
            panel = Image.fromarray((values * 255).astype(np.uint8), mode="L").convert("RGB")
        else:
            panel = Image.fromarray(values, mode="RGB")
        panel.thumbnail((panel_width, panel_height))
        x = index * panel_width
        canvas.paste(panel, (x, 28))
        draw.text((x + 12, 8), label, fill=(245, 180, 50))

    histogram, _ = np.histogram(fused[valid], bins=20, range=(0, 1))
    maximum = max(int(histogram.max()), 1)
    graph_top, graph_bottom = 345, 410
    graph_left, graph_right = 40, panel_width * 3 - 30
    draw.text((graph_left, 325), "Fused response distribution", fill=(220, 225, 235))
    bar_width = (graph_right - graph_left) / len(histogram)
    for index, count in enumerate(histogram):
        bar_height = int((count / maximum) * (graph_bottom - graph_top))
        x1 = int(graph_left + index * bar_width)
        x2 = int(graph_left + (index + 1) * bar_width - 2)
        draw.rectangle((x1, graph_bottom - bar_height, x2, graph_bottom), fill=(230, 150, 45))
    output = BytesIO()
    canvas.save(output, format="PNG", optimize=True)
    return f"data:image/png;base64,{base64.b64encode(output.getvalue()).decode('ascii')}"


def create_change_preview(first_path: str, second_path: str) -> str:
    with rasterio.open(first_path) as first, rasterio.open(second_path) as second:
        height = min(first.height, second.height, 1024)
        width = min(first.width, second.width, 1024)
        first_data = first.read(1, out_shape=(height, width), masked=True).astype(np.float32).filled(np.nan)
        second_data = second.read(1, out_shape=(height, width), masked=True).astype(np.float32).filled(np.nan)
    valid = np.isfinite(first_data) & np.isfinite(second_data)
    if not valid.any():
        raise ValueError("The two rasters have no overlapping valid pixels")
    difference = np.abs(second_data - first_data)
    threshold = float(np.nanpercentile(difference[valid], 85))
    changed = valid & (difference > threshold) if threshold > 0 else valid & (difference > 0)

    values = np.where(valid, first_data, 0)
    low, high = np.nanpercentile(values[valid], [2, 98])
    grayscale = np.clip((values - low) / max(float(high - low), 1e-6) * 255, 0, 255).astype(np.uint8)
    preview = np.stack([grayscale, grayscale, grayscale], axis=-1)
    preview[changed] = np.array([230, 70, 55], dtype=np.uint8)
    image = Image.fromarray(preview, mode="RGB")
    output = BytesIO()
    image.save(output, format="PNG", optimize=True)
    encoded = base64.b64encode(output.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"