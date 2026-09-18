backend run command :
uvicorn backend.main:app --reload --port 8000

frontend run command :
npm run dev

Supported satellite image formats:
- GeoTIFF: `.tif`, `.tiff`
- General raster images: `.png`, `.jpg`, `.jpeg`

Upload a scene from the Dashboard to run metadata extraction, band statistics,
NDVI when compatible bands are available, and candidate-region detection. Upload
two scenes in Change Intelligence for pixel-based comparison, or use them in
Multimodal Fusion for normalized overlapping-pixel analysis.