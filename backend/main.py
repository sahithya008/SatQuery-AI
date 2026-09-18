from pathlib import Path
from uuid import uuid4
import base64
from io import BytesIO
from html import escape

from fastapi import FastAPI, UploadFile, File, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import os
from google import genai
from google.genai import types
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import Image as PdfImage, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

try:
    from .agent import run_langgraph_workflow
    from .tools import analyze_raster, compare_rasters, create_change_preview, create_fusion_preview, fuse_rasters
except ImportError:
    from agent import run_langgraph_workflow
    from tools import analyze_raster, compare_rasters, create_change_preview, create_fusion_preview, fuse_rasters

app = FastAPI(title="SatQuery AI Backend", version="1.0.0")

frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000,http://localhost:3001")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in frontend_origin.split(",") if origin.strip()],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", Path(__file__).resolve().parent / "uploads")).resolve()
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(100 * 1024 * 1024)))
ALLOWED_EXTENSIONS = {".tif", ".tiff", ".png", ".jpg", ".jpeg"}


class CopilotRequest(BaseModel):
    query: str = Field(min_length=1, max_length=4000)
    location: str = Field(default="ISTRAC / ISRO HQ, Bengaluru", max_length=200)
    image_path: str | None = Field(default=None, max_length=500)


class ChangeDetectionRequest(BaseModel):
    epoch1: str = Field(default="2020-01 Baseline (Landsat-8)", max_length=120)
    epoch2: str = Field(default="2026-09 Current (Cartosat-3)", max_length=120)
    location: str = Field(default="ISTRAC / ISRO HQ, Bengaluru", max_length=200)
    baseline_path: str | None = Field(default=None, max_length=500)
    comparison_path: str | None = Field(default=None, max_length=500)


class FusionRequest(BaseModel):
    optical_path: str | None = Field(default=None, max_length=500)
    radar_path: str | None = Field(default=None, max_length=500)


class ReportRequest(BaseModel):
    generated_at: str = Field(max_length=80)
    location: str = Field(max_length=200)
    coordinates: list[float] = Field(min_length=2, max_length=2)
    messages: list[dict[str, str]] = Field(default_factory=list)
    scene: dict[str, object] | None = None
    change_detection: dict[str, object] | None = None
    fusion: dict[str, object] | None = None

try:
    client = genai.Client()
except Exception:
    client = None


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "satquery-api", "ai_enabled": client is not None}


def resolve_upload_path(value: str | None) -> Path | None:
    if not value:
        return None
    candidate = Path(value).resolve()
    if candidate.parent != UPLOAD_DIR or not candidate.is_file():
        raise HTTPException(status_code=400, detail="The requested raster is not a valid uploaded scene")
    return candidate


@app.post("/api/upload")
async def upload_scene(file: UploadFile = File(...)):
    extension = Path(file.filename or "").suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Supported satellite images: GeoTIFF, PNG, JPG, and JPEG")

    stored_name = f"{uuid4().hex}{extension}"
    file_path = (UPLOAD_DIR / stored_name).resolve()
    if file_path.parent != UPLOAD_DIR:
        raise HTTPException(status_code=400, detail="Invalid upload path")

    try:
        bytes_written = 0
        with file_path.open("wb") as buffer:
            while chunk := await file.read(1024 * 1024):
                bytes_written += len(chunk)
                if bytes_written > MAX_UPLOAD_BYTES:
                    file_path.unlink(missing_ok=True)
                    raise HTTPException(status_code=413, detail="File exceeds the maximum upload size")
                buffer.write(chunk)

        try:
            metadata = analyze_raster(str(file_path))
        except Exception as exc:
            file_path.unlink(missing_ok=True)
            raise HTTPException(status_code=422, detail=f"The uploaded satellite image is not readable: {exc}")
        
        return {
            "filename": file.filename,
            "path": str(file_path),
            "size": bytes_written,
            "status": "Ingested successfully",
            "metadata": metadata,
        }
    except HTTPException:
        raise
    except Exception as exc:
        file_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=str(exc))

@app.post("/api/copilot")
async def copilot_query(payload: CopilotRequest):
    query = payload.query.strip()
    location = payload.location.strip()
    image_path = resolve_upload_path(payload.image_path)

    try:
        workflow = run_langgraph_workflow(query, str(image_path) if image_path else None)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Raster analysis failed: {exc}")
    
        prompt = f"""
You are SatQuery AI, an Earth-observation analyst. Answer the user's exact question
using the attached image when present and the computed raster evidence below.
Target label: {location}
User question: {query}
Computed evidence: {workflow['analysis']}

Rules:
- Answer the question directly in the first sentence.
- Separate observations from interpretations.
- Never invent coordinates, dates, sensors, objects, or measurements.
- If the image is an ordinary RGB image without CRS, say that geographic location
    and physical area cannot be determined from pixels alone.
- If the question asks for buildings or vehicles, only claim them if the image
    visibly supports it; otherwise report candidate regions as candidates.
- Include a short Evidence line and a Limitation line.
"""
    
    if client:
        try:
            contents: list[object] = [prompt]
            if image_path:
                mime_type = {
                    ".png": "image/png",
                    ".jpg": "image/jpeg",
                    ".jpeg": "image/jpeg",
                    ".tif": "image/tiff",
                    ".tiff": "image/tiff",
                }.get(image_path.suffix.lower(), "application/octet-stream")
                contents.append(types.Part.from_bytes(data=image_path.read_bytes(), mime_type=mime_type))
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=contents,
            )
            return {**workflow, "response": response.text, "location": location, "answer_source": "gemini-vision"}
        except Exception:
            pass
            
    return {
        **workflow,
        "response": f"Direct answer: {workflow['insight']}\n\nEvidence: Computed from the uploaded raster using {', '.join(workflow['tools_used'])}.\nLimitation: A local raster agent can measure pixels and known bands, but it cannot reliably identify semantic objects or infer missing geolocation.",
        "location": location,
        "answer_source": "local-raster-agent",
    }

@app.post("/api/change-detection")
async def change_detection(payload: ChangeDetectionRequest):
    baseline_path = resolve_upload_path(payload.baseline_path)
    comparison_path = resolve_upload_path(payload.comparison_path)
    if not baseline_path or not comparison_path:
        raise HTTPException(status_code=400, detail="Upload both baseline and comparison satellite images first")
    try:
        result = compare_rasters(str(baseline_path), str(comparison_path))
        result["preview_data_url"] = create_change_preview(str(baseline_path), str(comparison_path))
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Change detection failed: {exc}")
    return {"status": "success", "location": payload.location, "epoch1": payload.epoch1, "epoch2": payload.epoch2, **result}


@app.post("/api/fusion")
async def multimodal_fusion(payload: FusionRequest):
    optical_path = resolve_upload_path(payload.optical_path)
    radar_path = resolve_upload_path(payload.radar_path)
    if not optical_path or not radar_path:
        raise HTTPException(status_code=400, detail="Upload both optical and radar satellite images first")
    try:
        result = fuse_rasters(str(optical_path), str(radar_path))
        result["preview_data_url"] = create_fusion_preview(str(optical_path), str(radar_path))
        return {"status": "success", **result}
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Fusion failed: {exc}")


def pdf_image(data_url: object, max_width: float = 7.0 * inch, max_height: float = 4.4 * inch):
    if not isinstance(data_url, str) or "," not in data_url:
        return None
    try:
        image = PdfImage(BytesIO(base64.b64decode(data_url.split(",", 1)[1])))
        scale = min(max_width / image.imageWidth, max_height / image.imageHeight, 1)
        image.drawWidth = image.imageWidth * scale
        image.drawHeight = image.imageHeight * scale
        return image
    except Exception:
        return None


@app.post("/api/report")
async def generate_report(payload: ReportRequest):
    buffer = BytesIO()
    document = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=42, leftMargin=42, topMargin=42, bottomMargin=42)
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="ReportTitle", parent=styles["Title"], alignment=TA_CENTER, textColor=colors.HexColor("#b45309"), spaceAfter=18))
    styles.add(ParagraphStyle(name="Section", parent=styles["Heading2"], textColor=colors.HexColor("#b45309"), spaceBefore=14, spaceAfter=8))
    styles.add(ParagraphStyle(name="Small", parent=styles["BodyText"], fontSize=8.5, leading=11))
    story = [Paragraph("SatQuery AI Intelligence Report", styles["ReportTitle"]), Paragraph(f"Generated: {escape(payload.generated_at)}<br/>Target: {escape(payload.location)}<br/>Selected coordinates: {payload.coordinates[0]}, {payload.coordinates[1]}", styles["Small"]), Spacer(1, 12)]

    story.append(Paragraph("Scene Summary", styles["Section"]))
    scene_rows = [[escape(str(key)), escape(str(value))] for key, value in (payload.scene or {}).items() if key not in {"detections", "transform"}]
    story.append(Table([["Metric", "Value"], *scene_rows] if scene_rows else [["Status", "No scene uploaded"]], colWidths=[1.8 * inch, 5.1 * inch], style=[("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#fef3c7")), ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")), ("FONTSIZE", (0, 0), (-1, -1), 8)]))

    story.append(Paragraph("Copilot Chat Query", styles["Section"]))
    for message in payload.messages:
        role = escape(message.get("role", "unknown").upper())
        text = escape(message.get("text", "")).replace("\n", "<br/>")
        story.append(Paragraph(f"<b>{role}</b>: {text}", styles["Small"]))
        story.append(Spacer(1, 4))

    story.append(Paragraph("Multi-Temporal Change Intelligence", styles["Section"]))
    change = payload.change_detection or {}
    story.append(Paragraph(escape(str(change.get("summary", "No change-detection run recorded."))).replace("\n", "<br/>"), styles["Small"]))
    change_image = pdf_image(change.get("preview_data_url"))
    if change_image:
        story.extend([Spacer(1, 8), change_image])

    story.append(Paragraph("Multimodal Radar & Optical Fusion", styles["Section"]))
    fusion = payload.fusion or {}
    story.append(Paragraph(escape(str(fusion.get("summary", "No fusion run recorded."))).replace("\n", "<br/>"), styles["Small"]))
    fusion_image = pdf_image(fusion.get("preview_data_url"))
    if fusion_image:
        story.extend([Spacer(1, 8), fusion_image])

    story.append(Paragraph("Geospatial Intelligence", styles["Section"]))
    geospatial = payload.scene or {}
    story.append(Paragraph(f"CRS: {escape(str(geospatial.get('crs') or 'Not embedded'))}<br/>Bounds: {escape(str(geospatial.get('bounds') or 'Unavailable'))}<br/>Selected map location: {escape(payload.location)}", styles["Small"]))
    document.build(story)
    return Response(content=buffer.getvalue(), media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=satquery-intelligence-report.pdf"})