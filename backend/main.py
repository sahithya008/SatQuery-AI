import os
from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="SatQuery AI Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploaded_rasters"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@app.post("/api/upload")
async def upload_raster(file: UploadFile = File(...)):
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as buffer:
        buffer.write(await file.read())
    return {"status": "success", "path": file_path, "filename": file.filename}

@app.post("/api/query")
async def execute_query(query: str = Form(...), image_path: str = Form(...)):
    # Simulated LangGraph Agentic Response based on BigEarthNet / Rasterio processing
    query_lower = query.lower()
    
    if "ndvi" in query_lower or "vegetation" in query_lower:
        insight = "Calculated Mean NDVI: 0.682 (Healthy Dense Canopy across target raster bands)."
        tools = ["Rasterio Band Math (B4/B8)", "BigEarthNet Indexer"]
        confidence = "99.4%"
    elif "flood" in query_lower or "water" in query_lower:
        insight = "SAR Backscatter analysis detected water surface inundation covering approximately 14.2 km²."
        tools = ["Sentinel-1 SAR C-Band Matrix", "Threshold Segmentation"]
        confidence = "98.8%"
    else:
        insight = f"Spatial query processed successfully for target scene '{os.path.basename(image_path)}'."
        tools = ["SAM-RS Grounding Model", "LangGraph Agent"]
        confidence = "99.1%"

    return {
        "query": query,
        "insight": insight,
        "tools_used": tools,
        "confidence": confidence
    }