from typing import Any, TypedDict

try:
    from .tools import analyze_raster, compute_ndvi
except ImportError:
    from tools import analyze_raster, compute_ndvi

class AgentState(TypedDict):
    query: str
    image_path: str | None
    insight: str
    confidence: str
    tools_used: list
    analysis: dict[str, Any]

def parse_query_node(state: AgentState) -> AgentState:
    query_lower = state["query"].lower()
    image_path = state.get("image_path")
    analysis = state.get("analysis", {})

    if image_path:
        analysis = analyze_raster(image_path)
        state["analysis"] = analysis
        state["tools_used"] = ["Intent Router", "Rasterio", "Band Statistics", "Segmentation Detector"]
        wants_ndvi = any(term in query_lower for term in ("ndvi", "vegetation", "plant", "greenery"))
        wants_detection = any(term in query_lower for term in ("object", "detect", "building", "structure", "vehicle"))
        wants_area = any(term in query_lower for term in ("area", "size", "dimension", "resolution", "how large"))
        wants_geo = any(term in query_lower for term in ("crs", "coordinate", "where", "location", "bound"))
        if wants_ndvi:
            ndvi_result = compute_ndvi(image_path)
            if ndvi_result["status"] == "success":
                state["insight"] = f"Vegetation health: mean NDVI is {analysis['ndvi_mean']:.4f}, ranging from {analysis['ndvi_min']:.4f} to {analysis['ndvi_max']:.4f}."
            else:
                state["insight"] = f"Vegetation health: NDVI is unavailable because this {analysis['bands']}-band image does not expose a known red/NIR band pairing."
            state["confidence"] = "High" if ndvi_result["status"] == "success" else "Limited"
            if wants_detection:
                largest = analysis["detections"][0]["bbox"] if analysis["detections"] else None
                state["insight"] += f"\nStructures/objects: {analysis['detected_objects']} candidate regions detected; largest candidate bounds: {largest or 'none'}. These are image regions, not semantic building or vehicle labels."
                state["tools_used"].append("Candidate Region Detector")
            if wants_area:
                state["insight"] += f"\nScene extent: {analysis['width']} x {analysis['height']} pixels; " + (f"approximately {analysis['footprint_area']} square map units." if analysis["crs"] else "physical area is unavailable because the image has no georeferencing.")
            if wants_geo:
                state["insight"] += f"\nGeospatial reference: " + (f"CRS {analysis['crs']}; bounds {analysis['bounds']}." if analysis["crs"] else "no CRS or latitude/longitude is embedded in this image.")
        elif wants_detection:
            largest = analysis["detections"][0]["bbox"] if analysis["detections"] else None
            state["insight"] = f"Structures/objects: detected {analysis['detected_objects']} candidate regions using reflectance segmentation. Largest candidate bounds: {largest or 'none'}. These are image regions, not semantic building or vehicle labels."
            state["confidence"] = "Moderate"
            if wants_area:
                state["insight"] += f"\nScene extent: {analysis['width']} x {analysis['height']} pixels; " + (f"approximately {analysis['footprint_area']} square map units." if analysis["crs"] else "physical area is unavailable because the image has no georeferencing.")
            if wants_geo:
                state["insight"] += f"\nGeospatial reference: " + (f"CRS {analysis['crs']}; bounds {analysis['bounds']}." if analysis["crs"] else "no CRS or latitude/longitude is embedded in this image.")
        elif any(term in query_lower for term in ("area", "size", "dimension", "resolution", "how large")):
            if analysis["crs"]:
                state["insight"] = f"Scene footprint: {analysis['width']} x {analysis['height']} pixels across approximately {analysis['footprint_area']} square map units, using {analysis['crs']}."
            else:
                state["insight"] = f"Scene extent: {analysis['width']} x {analysis['height']} pixels ({analysis['pixel_count']} pixels total). Physical area is unavailable because this image has no embedded georeferencing."
            state["confidence"] = "High"
            if wants_geo:
                state["insight"] += "\nGeospatial reference: " + (f"CRS {analysis['crs']}; bounds {analysis['bounds']}." if analysis["crs"] else "no CRS or latitude/longitude is embedded in this image.")
        elif any(term in query_lower for term in ("crs", "coordinate", "where", "location", "bound")):
            if analysis["crs"]:
                state["insight"] = f"Geospatial reference: CRS {analysis['crs']}; bounds {analysis['bounds']}."
            else:
                state["insight"] = "Geospatial reference: this image has no embedded CRS or latitude/longitude, so geographic coordinates cannot be determined from the pixels alone."
            state["confidence"] = "High"
        elif any(term in query_lower for term in ("summary", "summarize", "overview", "describe", "analyze", "scene")):
            ndvi_text = f"mean NDVI {analysis['ndvi_mean']:.4f}" if analysis["ndvi_mean"] is not None else "NDVI unavailable for this band layout"
            state["insight"] = f"Scene summary: {analysis['filename']} is {analysis['width']} x {analysis['height']} pixels with {analysis['bands']} band(s). Band 1 mean is {analysis['mean_value']}; value range is {analysis['min_value']} to {analysis['max_value']}; {ndvi_text}; {analysis['detected_objects']} candidate region(s) detected."
            state["confidence"] = "High"
        elif "bright" in query_lower or "reflect" in query_lower or "intens" in query_lower:
            state["insight"] = f"For '{state['query']}', band 1 values span {analysis['min_value']} to {analysis['max_value']} with a mean of {analysis['mean_value']}."
            state["confidence"] = "High"
        else:
            state["insight"] = f"Scene summary for '{state['query']}': {analysis['width']}x{analysis['height']} pixels across {analysis['bands']} band(s). Mean band-1 value is {analysis['mean_value']}; {analysis['detected_objects']} candidate regions were segmented."
            state["confidence"] = "Moderate"
    else:
        state["insight"] = f"I received '{state['query']}', but no image is attached. Upload a GeoTIFF, PNG, JPG, or JPEG satellite image so I can calculate measurements for that question."
        state["confidence"] = "Unavailable"
        state["tools_used"] = ["Intent Router"]

    return state

def run_langgraph_workflow(query: str, image_path: str | None = None):
    initial_state = {
        "query": query,
        "image_path": image_path,
        "insight": "",
        "confidence": "",
        "tools_used": [],
        "analysis": {},
    }
    final_state = parse_query_node(initial_state)
    return {
        "query": query,
        "insight": final_state["insight"],
        "confidence": final_state["confidence"],
        "tools_used": final_state["tools_used"],
        "analysis": final_state["analysis"],
    }