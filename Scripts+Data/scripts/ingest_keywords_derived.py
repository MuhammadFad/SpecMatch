import os
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv
from pymongo import MongoClient, UpdateOne

load_dotenv()

MONGODB_URI = 'mongodb+srv://MFahad:FahadIsSussy_Sus107@cluster0.nz6nvjs.mongodb.net/'
DB_NAME = 'SpecMatch'
COLLECTION_NAME = 'Laptops'

if not MONGODB_URI:
    raise RuntimeError("Missing MONGODB_URI in .env")

# -------------------------
# Helpers
# -------------------------
def as_float(x: Any) -> Optional[float]:
    try:
        if x is None:
            return None
        if isinstance(x, bool):
            return None
        return float(x)
    except Exception:
        return None

def as_str(x: Any) -> str:
    return x if isinstance(x, str) else ""

def as_list(x: Any) -> List[Any]:
    return x if isinstance(x, list) else []

def norm_kw(s: str) -> str:
    # normalize keyword tags (stable, consistent)
    s = s.strip().lower()
    # optional: replace spaces with underscores to keep tags uniform
    s = s.replace(" ", "_")
    return s

def merge_keywords(existing: Any, new_kws: List[str]) -> List[str]:
    base = [norm_kw(as_str(k)) for k in as_list(existing) if as_str(k).strip()]
    add = [norm_kw(k) for k in new_kws if k.strip()]
    merged = list(dict.fromkeys(base + add))  # preserves order, unique
    return merged

def get_primary_display(doc: Dict[str, Any]) -> Dict[str, Any]:
    displays = as_list(doc.get("displays"))
    if displays:
        d0 = displays[0] if isinstance(displays[0], dict) else {}
        return d0
    return {}

# -------------------------
# Tag rules (edit thresholds here)
# -------------------------
def derive_tags_and_derived(doc: Dict[str, Any]) -> Tuple[List[str], Dict[str, Any]]:
    tags: List[str] = []

    # ---- pull common fields from your normalized schema ----
    chassis = doc.get("chassis") if isinstance(doc.get("chassis"), dict) else {}
    battery = doc.get("battery") if isinstance(doc.get("battery"), dict) else {}
    cpu = doc.get("cpu") if isinstance(doc.get("cpu"), dict) else {}
    gpu = doc.get("gpu") if isinstance(doc.get("gpu"), dict) else {}
    ram = doc.get("ram") if isinstance(doc.get("ram"), dict) else {}
    storage = doc.get("storage") if isinstance(doc.get("storage"), dict) else {}
    pricing = doc.get("pricing") if isinstance(doc.get("pricing"), dict) else {}
    networking = doc.get("networking") if isinstance(doc.get("networking"), dict) else {}

    d0 = get_primary_display(doc)

    weight = as_float(chassis.get("weight_kg"))
    thickness = as_float(chassis.get("thickness_mm"))
    materials = [as_str(m).lower() for m in as_list(chassis.get("materials"))]
    chassis_score = as_float(chassis.get("score"))

    battery_wh = as_float(battery.get("capacity_wh"))
    battery_score = as_float(battery.get("score"))

    cpu_score = as_float(cpu.get("score"))

    ram_gb = as_float(ram.get("size_gb"))
    storage_gb = as_float(storage.get("capacity_gb"))

    gpu_score = as_float(gpu.get("score"))
    gpu_integrated = bool(gpu.get("integrated")) if isinstance(gpu.get("integrated"), bool) else False
    gpu_name = as_str(gpu.get("name")).lower()
    gpu_mfr = as_str(gpu.get("manufacturer")).lower()

    srgb = as_float(d0.get("srgb_coverage"))
    hz = as_float(d0.get("refresh_rate_hz"))
    panel = as_str(d0.get("panel_type")).lower()
    touch = True if d0.get("touch") is True else False

    price = as_float(pricing.get("estimated_price_usd"))

    wifi_standards = [as_str(x) for x in as_list(networking.get("wifi_standards"))]

    # -------------------------
    # Mobility tags
    # -------------------------
    if weight is not None:
        if weight <= 1.47:
            tags.append("ultralight")
        elif weight <= 1.75:
            tags.append("portable")
        elif weight >= 2.21:
            tags.append("heavy")

    if thickness is not None:
        if thickness <= 17.9:
            tags.append("thin")
        elif thickness >= 21.9:
            tags.append("chunky")

    # -------------------------
    # Battery tags
    # -------------------------
    if battery_wh is not None:
        if battery_wh >= 72:
            tags.append("long_battery")
        elif battery_wh >= 60:
            tags.append("good_battery")
        elif battery_wh < 45:
            tags.append("basic_battery")
    elif battery_score is not None:
        if battery_score >= 45:
            tags.append("good_battery")
        elif battery_score < 35:
            tags.append("basic_battery")

    # -------------------------
    # Build / chassis tags
    # -------------------------
    sturdy_materials = ("metal", "aluminium", "aluminum", "magnesium", "carbon")
    has_metal = any(any(k in m for k in sturdy_materials) for m in materials)

    if has_metal or (chassis_score is not None and chassis_score >= 41):
        tags.append("sturdy")

    # "premium_build" = sturdy + portable-ish
    if ("sturdy" in tags) and (weight is not None and weight <= 1.75):
        tags.append("premium_build")

    # -------------------------
    # Display tags
    # -------------------------
    if "oled" in panel:
        tags.append("oled")

    if srgb is not None and srgb >= 90:
        tags.append("creator_display")

    if hz is not None and hz >= 120:
        tags.append("high_refresh")

    if touch:
        tags.append("touchscreen")

    # -------------------------
    # GPU / gaming tags
    # -------------------------
    # dGPU heuristic: not integrated AND has a real GPU name/vendor
    has_dgpu = (not gpu_integrated) and (len(gpu_name) > 0) and (gpu_mfr in ("nvidia", "amd", "intel") or "geforce" in gpu_name or "radeon" in gpu_name)

    if has_dgpu:
        tags.append("dgpu")

    # These thresholds depend on your score scale; tune later if needed.
    if has_dgpu and gpu_score is not None:
        if gpu_score >= 26:
            tags.append("gaming")
        elif gpu_score >= 8:
            tags.append("light_gaming")

    # esports_ready = high_refresh + dgpu
    if ("high_refresh" in tags) and ("dgpu" in tags):
        tags.append("esports_ready")

    # -------------------------
    # Office / student tags
    # -------------------------
    office_ready = True
    if cpu_score is not None and cpu_score < 18:
        office_ready = False
    if ram_gb is not None and ram_gb < 8:
        office_ready = False
    if storage_gb is not None and storage_gb < 256:
        office_ready = False

    if office_ready:
        tags.append("office")

    student_ready = office_ready and (
        ("portable" in tags) or ("ultralight" in tags) or ("good_battery" in tags) or ("long_battery" in tags)
    )
    if price is not None and price > 900:
        # optional cap; remove if you want "student" for expensive laptops too
        student_ready = False

    if student_ready:
        tags.append("student")

    # -------------------------
    # Budget tiers
    # -------------------------
    if price is not None:
        if price < 600:
            tags.append("budget")
        elif price <= 1000:
            tags.append("midrange")
        else:
            tags.append("premium")

    # -------------------------
    # Derived buckets (for filtering/debugging)
    # -------------------------
    derived: Dict[str, Any] = {
        "weight_kg": weight,
        "thickness_mm": thickness,
        "battery_wh": battery_wh,
        "battery_score": battery_score,
        "cpu_score": cpu_score,
        "gpu_score": gpu_score,
        "ram_gb": ram_gb,
        "storage_gb": storage_gb,
        "srgb": srgb,
        "hz": hz,
        "has_dgpu": has_dgpu,
        "materials": materials,
        "wifi_standards": wifi_standards,
        "price_usd": price,
        "tag_version": "v1"
    }

    # normalize tags into keyword format
    tags = [norm_kw(t) for t in tags]
    return tags, derived

# -------------------------
# Main ingestion run
# -------------------------
def main():
    client = MongoClient(MONGODB_URI)
    col = client[DB_NAME][COLLECTION_NAME]

    # Decide what to process:
    # - Process all documents (safe if you want to refresh tags)
    # - OR only docs missing derived
    query = {
        "$or": [
            {"derived": {"$exists": False}},
            {"derived.tag_version": {"$ne": "v1"}}
        ]
    }

    cursor = col.find(query, projection={"_id": 1, "keywords": 1, "cpu": 1, "gpu": 1, "ram": 1, "storage": 1,
                                         "battery": 1, "chassis": 1, "displays": 1, "pricing": 1, "networking": 1})

    batch_size = 300
    ops: List[UpdateOne] = []
    processed = 0

    for doc in cursor:
        tags, derived = derive_tags_and_derived(doc)

        new_keywords = merge_keywords(doc.get("keywords", []), tags)

        ops.append(
            UpdateOne(
                {"_id": doc["_id"]},
                {
                    "$set": {
                        "keywords": new_keywords,
                        "derived": derived,
                        "updatedAt": datetime.utcnow()
                    }
                }
            )
        )

        if len(ops) >= batch_size:
            res = col.bulk_write(ops, ordered=False)
            processed += res.modified_count
            print(f"Updated (modified) so far: {processed}")
            ops = []

    if ops:
        res = col.bulk_write(ops, ordered=False)
        processed += res.modified_count

    print(f"Done. Total modified: {processed}")
    client.close()

if __name__ == "__main__":
    main()
