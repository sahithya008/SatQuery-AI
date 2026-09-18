import rasterio
import numpy as np

def compute_ndvi(image_path: str):
    try:
        with rasterio.open(image_path) as src:
            count = src.count
            if count >= 8:
                red = src.read(4).astype(float)
                nir = src.read(8).astype(float)
            elif count >= 2:
                red = src.read(1).astype(float)
                nir = src.read(2).astype(float)
            else:
                data = src.read(1).astype(float)
                return {
                    "description": f"Processed single-band raster. Dimensions: {src.width}x{src.height}, Mean Value: {float(np.mean(data)):.2f}",
                    "status": "success"
                }

            denominator = (nir + red)
            denominator[denominator == 0] = 1e-10
            ndvi = (nir - red) / denominator
            mean_ndvi = float(np.mean(ndvi))

            return {
                "description": f"Real GeoTIFF processed successfully. Mean NDVI index: {mean_ndvi:.4f} (Grid: {src.width}x{src.height}px).",
                "status": "success"
            }
    except Exception as e:
        return {
            "description": f"Failed to parse raster data: {str(e)}",
            "status": "error"
        }