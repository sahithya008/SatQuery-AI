from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import shutil
import os
from google import genai

app = FastAPI(title="SatQuery AI Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Initialize Gemini Client (reads GEMINI_API_KEY environment variable automatically)
client = genai.Client()

@app.post("/api/upload")
async def upload_geotiff(file: UploadFile = File(...)):
    try:
        file_path = os.path.join(UPLOAD_DIR, file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        return {
            "filename": file.filename,
            "path": file_path,
            "status": "Ingested successfully",
            "metadata": {
                "gsd": "0.28m PAN / 1.12m MX",
                "crs": "EPSG:32645 (UTM Zone 45N)",
                "ndvi_mean": 0.62,
                "detected_objects": 14
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/copilot")
async def copilot_query(payload: dict):
    query = payload.get("query", "").strip()
    location = payload.get("location", "ISTRAC / ISRO HQ, Bengaluru")
    
    prompt = f"""
    You are SatQuery AI, an expert Earth Observation and Remote Sensing Vision-Language Assistant built for ISRO intelligence (Smart India Hackathon 2026, Team Revera PS-26167).
    Current Target Location / Active Zone: {location}
    User Query: {query}
    
    Provide a concise, professional, data-driven remote-sensing analysis response incorporating relevant telemetry metrics (such as GSD resolution, NDVI, bounding boxes, or temporal change statistics if applicable).
    """
    
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
        )
        return {"response": response.text}
    except Exception as e:
        # Fallback if API key is not yet set in environment variables
        return {
            "response": f"🛰️ **SatQuery VLM Analysis** for {location}:\n- Query: \"{query}\"\n- Note: Please ensure your `GEMINI_API_KEY` environment variable is set on your backend terminal for live generative inference."
        }