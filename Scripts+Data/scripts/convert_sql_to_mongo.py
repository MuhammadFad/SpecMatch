#!/usr/bin/env python3
import argparse
import json
import re
from typing import Any, Dict, List, Tuple, Optional, Iterable

TARGET_TABLES = {
    "MODEL", "CPU", "GPU", "MEM", "HDD", "DISPLAY", "CHASSIS",
    "MDB", "WNET", "ODD", "ACUM", "WAR", "SIST", "REGIONS"
}

# Map MODEL fields (comma-separated IDs) -> (table, output_field)
LINK_MAP: List[Tuple[str, str, str]] = [
    ("cpu", "CPU", "cpu_options"),
    ("gpu", "GPU", "gpu_options"),
    ("mem", "MEM", "mem_options"),
    ("hdd", "HDD", "storage_options"),
    ("shdd", "HDD", "secondary_storage_options"),
    ("display", "DISPLAY", "display_options"),
    ("chassis", "CHASSIS", "chassis_options"),
    ("mdb", "MDB", "motherboard_options"),
    ("wnet", "WNET", "network_options"),
    ("odd", "ODD", "odd_options"),
    ("acum", "ACUM", "battery_options"),
    ("warranty", "WAR", "warranty_options"),
    ("sist", "SIST", "os_options"),
    ("regions", "REGIONS", "regions_list"),
]

INSERT_RE = re.compile(
    r"^INSERT INTO\s+`(?P<table>[^`]+)`\s*\((?P<cols>[^)]+)\)\s*VALUES\s*(?P<values>.*)$",
    re.IGNORECASE
)

def parse_id_list(s: Optional[str]) -> List[int]:
    if s is None:
        return []
    s = str(s).strip()
    if not s or s == "0":
        return []
    out: List[int] = []
    for part in s.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            v = int(part)
        except ValueError:
            continue
        if v != 0:
            out.append(v)
    return out

def sql_unescape_string(s: str) -> str:
    # MySQL-style backslash escapes
    out = []
    i = 0
    while i < len(s):
        c = s[i]
        if c == "\\" and i + 1 < len(s):
            n = s[i + 1]
            if n == "0":
                out.append("\0")
            elif n == "b":
                out.append("\b")
            elif n == "n":
                out.append("\n")
            elif n == "r":
                out.append("\r")
            elif n == "t":
                out.append("\t")
            elif n == "Z":
                out.append("\x1A")
            else:
                out.append(n)  # includes \' and \\ etc.
            i += 2
        else:
            out.append(c)
            i += 1
    return "".join(out)

def parse_sql_value(token: str) -> Any:
    token = token.strip()
    if token.upper() == "NULL":
        return None
    if token.startswith("'") and token.endswith("'") and len(token) >= 2:
        inner = token[1:-1]
        return sql_unescape_string(inner)
    # numeric?
    # keep ints as int, decimals/floats as float
    try:
        if "." in token or "e" in token.lower():
            return float(token)
        return int(token)
    except Exception:
        return token

def split_top_level_tuples(values_blob: str) -> List[str]:
    """
    Split "(...),(...),(...)" into ["(...)", "(...)", ...]
    Handles strings with commas and parentheses inside quotes.
    """
    tuples: List[str] = []
    i = 0
    n = len(values_blob)
    in_str = False
    depth = 0
    start = None

    while i < n:
        c = values_blob[i]
        if in_str:
            if c == "\\":
                i += 2
                continue
            if c == "'":
                in_str = False
            i += 1
            continue

        if c == "'":
            in_str = True
            i += 1
            continue

        if c == "(":
            if depth == 0:
                start = i
            depth += 1
        elif c == ")":
            depth -= 1
            if depth == 0 and start is not None:
                tuples.append(values_blob[start:i+1])
                start = None
        i += 1
    return tuples

def split_tuple_values(tuple_str: str) -> List[str]:
    """
    Given "(a,'b,c',NULL)", return ["a", "'b,c'", "NULL"]
    """
    assert tuple_str.startswith("(") and tuple_str.endswith(")")
    inner = tuple_str[1:-1]
    vals: List[str] = []
    buf = []
    in_str = False
    i = 0
    n = len(inner)

    while i < n:
        c = inner[i]
        if in_str:
            buf.append(c)
            if c == "\\" and i + 1 < n:
                buf.append(inner[i+1])
                i += 2
                continue
            if c == "'":
                in_str = False
            i += 1
            continue

        if c == "'":
            in_str = True
            buf.append(c)
            i += 1
            continue

        if c == ",":
            vals.append("".join(buf).strip())
            buf = []
        else:
            buf.append(c)
        i += 1

    if buf:
        vals.append("".join(buf).strip())
    return vals

def iter_insert_blocks(path: str) -> Iterable[Tuple[str, List[str], str]]:
    """
    Yields (table, columns, values_blob) for each INSERT INTO block.
    Handles multi-line INSERT statements until ';'
    """
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        pending_table = None
        pending_cols: List[str] = []
        pending_values_parts: List[str] = []

        for line in f:
            line = line.strip()
            if not line:
                continue

            if pending_table is None:
                m = INSERT_RE.match(line)
                if not m:
                    continue
                table = m.group("table")
                if table not in TARGET_TABLES:
                    # skip inserts for tables we don't need
                    # but still must consume multiline? (we're only here if match)
                    # if statement ends on same line, ok; else skip reading until ';'
                    if not line.endswith(";"):
                        # consume until ';'
                        for cont in f:
                            if cont.strip().endswith(";"):
                                break
                    continue

                cols_raw = m.group("cols")
                cols = [c.strip().strip("`") for c in cols_raw.split(",")]
                values_part = m.group("values")

                pending_table = table
                pending_cols = cols
                pending_values_parts = [values_part]
                if line.endswith(";"):
                    blob = " ".join(pending_values_parts)[:-1]  # drop ';'
                    yield pending_table, pending_cols, blob
                    pending_table = None
                    pending_cols = []
                    pending_values_parts = []
            else:
                pending_values_parts.append(line)
                if line.endswith(";"):
                    blob = " ".join(pending_values_parts)[:-1]
                    yield pending_table, pending_cols, blob
                    pending_table = None
                    pending_cols = []
                    pending_values_parts = []

def build_table_dict(sql_path: str) -> Dict[str, Dict[int, Dict[str, Any]]]:
    """
    Returns: tables[table_name][id] = row_dict
    For MODEL we store by id too.
    """
    tables: Dict[str, Dict[int, Dict[str, Any]]] = {t: {} for t in TARGET_TABLES}

    for table, cols, blob in iter_insert_blocks(sql_path):
        tuples = split_top_level_tuples(blob)
        for t in tuples:
            vals = split_tuple_values(t)
            if len(vals) != len(cols):
                continue
            row = {cols[i]: parse_sql_value(vals[i]) for i in range(len(cols))}
            rid = row.get("id")
            if rid is None:
                continue
            try:
                rid_int = int(rid)
            except Exception:
                continue
            tables[table][rid_int] = row

    return tables

def build_laptop_documents(tables: Dict[str, Dict[int, Dict[str, Any]]]) -> List[Dict[str, Any]]:
    models = tables["MODEL"]
    docs: List[Dict[str, Any]] = []

    for mid, m in models.items():
        doc: Dict[str, Any] = {}
        doc["_id"] = mid

        # top-level laptop identity
        doc["brand"] = m.get("prod")
        doc["model"] = m.get("model")
        doc["submodel"] = m.get("submodel")
        doc["idfam"] = m.get("idfam")
        doc["inactive"] = m.get("inactive")
        doc["tags"] = m.get("tags")
        doc["extra_modelname"] = m.get("extra_modelname")
        doc["keywords"] = m.get("keywords")
        doc["msc"] = m.get("msc")
        doc["ldate"] = str(m.get("ldate")) if m.get("ldate") else None

        # links/images
        doc["link"] = m.get("link")
        doc["link2"] = m.get("link2")
        imgs = [m.get("img_1"), m.get("img_2"), m.get("img_3"), m.get("img_4")]
        doc["images"] = [x for x in imgs if x]

        missing_components: Dict[str, List[int]] = {}

        for model_field, table, out_field in LINK_MAP:
            ids = parse_id_list(m.get(model_field))
            resolved: List[Dict[str, Any]] = []
            miss: List[int] = []
            cache = tables[table]

            for i in ids:
                row = cache.get(i)
                if row is None:
                    miss.append(i)
                else:
                    resolved.append(row)

            doc[out_field] = resolved
            if miss:
                missing_components[out_field] = miss

        doc["missing_components"] = missing_components
        doc["chassis_missing"] = not bool(doc.get("chassis_options"))

        docs.append(doc)

    return docs

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--ndjson", action="store_true")
    ap.add_argument("--require-chassis", action="store_true")
    args = ap.parse_args()

    tables = build_table_dict(args.input)
    docs = build_laptop_documents(tables)

    if args.require_chassis:
        docs = [d for d in docs if d.get("chassis_options")]

    if args.ndjson:
        with open(args.output, "w", encoding="utf-8") as f:
            for d in docs:
                f.write(json.dumps(d, ensure_ascii=False) + "\n")
    else:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(docs, f, ensure_ascii=False)

    print(f"Wrote {len(docs)} laptop documents to {args.output}")

if __name__ == "__main__":
    main()
