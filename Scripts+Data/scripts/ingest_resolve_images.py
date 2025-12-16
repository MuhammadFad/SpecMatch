import os
import time
from typing import Optional, List, Tuple
from urllib.parse import urljoin

import requests
from pymongo import MongoClient, UpdateOne

# ====== CONFIG ======
MONGODB_URI = "mongodb+srv://MFahad:FahadIsSussy_Sus107@cluster0.nz6nvjs.mongodb.net/?appName=Cluster0" # <-- REQUIRED
DB_NAME = "SpecMatch"
COLLECTION_NAME = "Laptops"

# Candidate URL patterns:
# - If the DB has "2041_1.jpg" => try concat with these:
MODEL_BASES = [
    "https://noteb.com/res/img/models/",
    "https://noteb.com/content/res/img/models/",
]
# - If the DB has "res/img/models/2041_1.jpg" => join with these roots:
ROOT_BASES = [
    "https://noteb.com/",
    "https://noteb.com/content/",
]

REQUEST_TIMEOUT_SEC = float(os.getenv("TIMEOUT_SEC", "10"))
SLEEP_BETWEEN_REQUESTS_SEC = float(os.getenv("SLEEP_SEC", "0.15"))
BATCH_SIZE = int(os.getenv("BATCH_SIZE", "200"))

HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Referer": "https://noteb.com/",
}

URL_REGEX = r"^https?://"
# ====================


def is_url(s: str) -> bool:
    return isinstance(s, str) and (s.startswith("http://") or s.startswith("https://"))


def check_image_url(url: str, session: requests.Session) -> bool:
    """
    True if URL responds like an image (200 + Content-Type image/*).
    Uses HEAD first; falls back to GET if blocked.
    """
    try:
        r = session.head(url, allow_redirects=True, timeout=REQUEST_TIMEOUT_SEC, headers=HEADERS)
        if r.status_code == 200:
            ctype = (r.headers.get("Content-Type") or "").lower()
            return ctype.startswith("image/")
        if r.status_code in (403, 405):  # forbidden / method not allowed
            rg = session.get(url, stream=True, allow_redirects=True, timeout=REQUEST_TIMEOUT_SEC, headers=HEADERS)
            if rg.status_code == 200:
                ctype = (rg.headers.get("Content-Type") or "").lower()
                # read tiny chunk to confirm stream works
                _ = next(rg.iter_content(chunk_size=1024), b"")
                return ctype.startswith("image/")
    except requests.RequestException:
        return False
    return False


def resolve_to_absolute(img: str, session: requests.Session) -> Optional[str]:
    """
    Resolves:
      - filename like '2041_1.jpg'
      - relative path like 'res/img/models/2041_1.jpg'
    into the first working absolute URL.
    """
    if not isinstance(img, str) or not img.strip():
        return None

    img = img.strip()

    # If it's already a URL, do nothing
    if is_url(img):
        return img

    candidates: List[str] = []

    if "/" in img:  # looks like a relative path
        rel = img.lstrip("/")
        for root in ROOT_BASES:
            candidates.append(urljoin(root, rel))
    else:  # looks like a plain filename
        fname = img.lstrip("/")
        for base in MODEL_BASES:
            candidates.append(base + fname)

    for url in candidates:
        if check_image_url(url, session):
            return url
        time.sleep(SLEEP_BETWEEN_REQUESTS_SEC)

    return None


def main():
    if not MONGODB_URI:
        raise SystemExit("Missing MONGODB_URI env var. Set it before running.")

    client = MongoClient(MONGODB_URI)
    col = client[DB_NAME][COLLECTION_NAME]

    # Only docs that still have at least one non-URL string in images
    query = {
        "images": {
            "$elemMatch": {
                "$type": "string",
                "$not": {"$regex": URL_REGEX}
            }
        }
    }

    projection = {"images": 1, "image_files": 1, "image_urls_resolved": 1}

    session = requests.Session()

    scanned = 0
    modified = 0
    ops: List[UpdateOne] = []

    cursor = col.find(query, projection)

    for doc in cursor:
        scanned += 1
        images = doc.get("images", [])

        # If already all URLs, skip (extra safety)
        if isinstance(images, list) and images and all(is_url(x) for x in images if isinstance(x, str)):
            continue

        if not isinstance(images, list) or not images:
            continue

        new_images: List = []
        changed = False

        for img in images:
            if is_url(img):
                new_images.append(img)
                continue

            resolved = resolve_to_absolute(img, session)
            if resolved and resolved != img:
                new_images.append(resolved)
                changed = True
            else:
                new_images.append(img)

        # Only update if something actually changed
        if changed:
            update_doc = {
                "$set": {
                    "images": new_images,
                }
            }

            # Preserve original filenames once (do not overwrite if already present)
            if "image_files" not in doc:
                update_doc["$set"]["image_files"] = images

            # Mark resolved only if ALL are URLs now
            if all(is_url(x) for x in new_images if isinstance(x, str)):
                update_doc["$set"]["image_urls_resolved"] = True

            ops.append(UpdateOne({"_id": doc["_id"]}, update_doc))
            modified += 1

        # Bulk write in batches
        if len(ops) >= BATCH_SIZE:
            col.bulk_write(ops, ordered=False)
            ops.clear()
            print(f"Scanned={scanned}, queued_updates={modified}")

    if ops:
        col.bulk_write(ops, ordered=False)

    print(f"Done. Scanned={scanned}, updated_docs={modified}")


if __name__ == "__main__":
    main()
