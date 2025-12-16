import os
from datetime import datetime
from typing import Any, Dict, List, Set, Tuple

from dotenv import load_dotenv
from pymongo import MongoClient, UpdateOne

load_dotenv()

MONGODB_URI = 'mongodb+srv://MFahad:FahadIsSussy_Sus107@cluster0.nz6nvjs.mongodb.net/'
DB_NAME = 'SpecMatch'
COLLECTION_NAME = 'Laptops'


if not MONGODB_URI:
    raise RuntimeError("Missing MONGODB_URI in .env")


def as_list(x: Any) -> List[Any]:
    return x if isinstance(x, list) else []


def as_str(x: Any) -> str:
    return x if isinstance(x, str) else ""


def kw_norm(s: str) -> str:
    return as_str(s).strip().lower().replace(" ", "_")


def pick_first_display(doc: Dict[str, Any]) -> Dict[str, Any]:
    displays = as_list(doc.get("displays"))
    if displays and isinstance(displays[0], dict):
        return displays[0]
    return {}


# Controlled vocab buckets (only use words from this set in the semantic string)
USE_CASE_KWS = {
    "student": "students",
    "office": "office work",
    "gaming": "gaming",
    "light_gaming": "light gaming",
    "esports_ready": "esports",
    "creator_display": "content creation",
}

STRENGTH_KWS = {
    "ultralight": "ultralight",
    "portable": "portable",
    "thin": "thin",
    "sturdy": "sturdy build",
    "premium_build": "premium build",
    "long_battery": "long battery life",
    "good_battery": "good battery life",
    "oled": "OLED display",
    "high_refresh": "high refresh display",
    "touchscreen": "touchscreen",
    "dgpu": "dedicated graphics",
}

# “negative” tags become tradeoffs
TRADEOFF_KWS = {
    "heavy": "heavy",
    "chunky": "thick chassis",
    "basic_battery": "basic battery life",
}

# Budget tiers (if present)
BUDGET_KWS = {
    "budget": "budget-friendly",
    "midrange": "midrange value",
    "premium": "premium pricing",
}


def build_semantic_text(doc: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
    brand = as_str(doc.get("brand")).strip()
    name = as_str(doc.get("name")).strip()

    # Keywords are already enriched by your previous script
    kws = {kw_norm(k) for k in as_list(doc.get("keywords")) if as_str(k).strip()}

    # Optional derived (helps tradeoffs if some tags missing)
    derived = doc.get("derived") if isinstance(doc.get("derived"), dict) else {}

    # Use cases
    use_cases: List[str] = []
    for k, label in USE_CASE_KWS.items():
        if k in kws:
            use_cases.append(label)

    # If none, add a safe default
    if not use_cases:
        use_cases = ["everyday productivity"]

    # Strengths
    strengths: List[str] = []
    for k, label in STRENGTH_KWS.items():
        if k in kws:
            strengths.append(label)

    # Tradeoffs from negative tags
    tradeoffs: List[str] = []
    for k, label in TRADEOFF_KWS.items():
        if k in kws:
            tradeoffs.append(label)

    # Add “basic display” tradeoff if we *don’t* have any display positives
    has_display_strength = any(k in kws for k in ("oled", "creator_display", "high_refresh"))
    if not has_display_strength:
        tradeoffs.append("basic display")

    # Budget/value sentence (optional)
    budget_line = None
    for k, label in BUDGET_KWS.items():
        if k in kws:
            budget_line = label
            break

    # Form factor
    d0 = pick_first_display(doc)
    touch = (d0.get("touch") is True) or ("touchscreen" in kws)

    form_factor = "standard laptop"
    # If you later add "two_in_one" tag to keywords, this will just work:
    if "two_in_one" in kws or "2_in_1" in kws or "twoinone" in kws:
        form_factor = "2-in-1 convertible"

    touch_label = "touch" if touch else "non-touch"

    # Keep it short and consistent
    parts = []
    if brand and name:
        parts.append(f"{brand} {name}.")
    elif name:
        parts.append(f"{name}.")
    elif brand:
        parts.append(f"{brand} laptop.")

    parts.append("Best for: " + ", ".join(use_cases) + ".")

    if strengths:
        # cap list length so string stays dense
        parts.append("Strengths: " + ", ".join(strengths[:6]) + ".")

    if budget_line:
        parts.append(f"Value: {budget_line}.")

    # Deduplicate tradeoffs while preserving order
    seen = set()
    tradeoffs_dedup = []
    for t in tradeoffs:
        if t not in seen:
            seen.add(t)
            tradeoffs_dedup.append(t)

    if tradeoffs_dedup:
        parts.append("Tradeoffs: " + ", ".join(tradeoffs_dedup[:5]) + ".")

    parts.append(f"Form factor: {form_factor}, {touch_label}.")

    semantic_text = " ".join(parts).strip()

    meta = {
        "version": "v1",
        "generated_at": datetime.utcnow(),
        "source": "brand,name,keywords,derived",
    }
    return semantic_text, meta


def main():
    client = MongoClient(MONGODB_URI)
    col = client[DB_NAME][COLLECTION_NAME]

    # Only generate if missing or outdated version
    query = {
        "$or": [
            {"semantic_text": {"$exists": False}},
            {"semantic_text": ""},
            {"semantic_text_meta.version": {"$ne": "v1"}},
        ]
    }

    projection = {
        "_id": 1,
        "brand": 1,
        "name": 1,
        "keywords": 1,
        "derived": 1,
        "displays": 1,
        "semantic_text": 1,
        "semantic_text_meta": 1,
    }

    cursor = col.find(query, projection=projection)

    ops: List[UpdateOne] = []
    batch_size = 300
    modified = 0

    for doc in cursor:
        semantic_text, meta = build_semantic_text(doc)

        ops.append(
            UpdateOne(
                {"_id": doc["_id"]},
                {"$set": {
                    "semantic_text": semantic_text,
                    "semantic_text_meta": meta,
                    "updatedAt": datetime.utcnow(),
                }}
            )
        )

        if len(ops) >= batch_size:
            res = col.bulk_write(ops, ordered=False)
            modified += res.modified_count
            print(f"Updated so far: {modified}")
            ops = []

    if ops:
        res = col.bulk_write(ops, ordered=False)
        modified += res.modified_count

    print(f"Done. Total modified: {modified}")
    client.close()


if __name__ == "__main__":
    main()
