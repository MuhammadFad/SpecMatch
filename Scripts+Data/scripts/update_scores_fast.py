from pymongo import MongoClient

MONGO_URI = "mongodb+srv://MFahad:FahadIsSussy_Sus107@cluster0.nz6nvjs.mongodb.net/SpecMatch"

# Max values in database (for normalization to 0-100)
MAX_SCORES = {
    "cpu": 80.4549,
    "gpu": 93.3184,
    "ram": 95.6218,
    "storage": 24.8172,
    "display": 91.3
}

# Power curve exponent (0.6 = more boost to mid-range, 1.0 = linear)
CURVE_POWER = 0.6

def main():
    print("=" * 60)
    print("LAPTOP SCORE CALCULATOR (Power Curve)")
    print("=" * 60)
    
    client = MongoClient(MONGO_URI)
    db = client["SpecMatch"]
    
    print(" Connected!")
    count = db["Laptops"].count_documents({})
    print(f" Found {count} laptops")
    
    
    print(f" Calculating scores with power curve (^{CURVE_POWER})...")
    
    # Pipeline with POWER CURVE: (normalized/100)^0.6 * 100
    # This boosts mid-range scores higher
    pipeline = [
        {
            "$addFields": {
                # Step 1: Normalize to 0-1 range
                "_cpu_norm": { "$min": [1, { "$divide": [{ "$ifNull": ["$cpu.score", 0] }, MAX_SCORES["cpu"]] }] },
                "_gpu_norm": { "$min": [1, { "$divide": [{ "$ifNull": ["$gpu.score", 0] }, MAX_SCORES["gpu"]] }] },
                "_ram_norm": { "$min": [1, { "$divide": [{ "$ifNull": ["$ram.score", 0] }, MAX_SCORES["ram"]] }] },
                "_storage_norm": { "$min": [1, { "$divide": [{ "$ifNull": ["$storage.score", 0] }, MAX_SCORES["storage"]] }] },
                "_display_norm": { "$min": [1, { "$divide": [{ "$ifNull": [{ "$arrayElemAt": ["$displays.score", 0] }, 0] }, MAX_SCORES["display"]] }] }
            }
        },
        {
            "$addFields": {
                # Step 2: Apply power curve (x^0.6 * 100) - boosts mid-range scores
                "_cpu": { "$multiply": [{ "$pow": ["$_cpu_norm", CURVE_POWER] }, 100] },
                "_gpu": { "$multiply": [{ "$pow": ["$_gpu_norm", CURVE_POWER] }, 100] },
                "_ram": { "$multiply": [{ "$pow": ["$_ram_norm", CURVE_POWER] }, 100] },
                "_storage": { "$multiply": [{ "$pow": ["$_storage_norm", CURVE_POWER] }, 100] },
                "_display": { "$multiply": [{ "$pow": ["$_display_norm", CURVE_POWER] }, 100] }
            }
        },
        {
            "$addFields": {
                # Step 3: Weighted average - CPU=30%, GPU=30%, RAM=20%, Storage=10%, Display=10%
                "final_score": {
                    "$round": [
                        {
                            "$add": [
                                { "$multiply": ["$_cpu", 0.30] },
                                { "$multiply": ["$_gpu", 0.30] },
                                { "$multiply": ["$_ram", 0.20] },
                                { "$multiply": ["$_storage", 0.10] },
                                { "$multiply": ["$_display", 0.10] }
                            ]
                        },
                        2
                    ]
                }
            }
        },
        {
            "$unset": ["_cpu", "_gpu", "_ram", "_storage", "_display", "_cpu_norm", "_gpu_norm", "_ram_norm", "_storage_norm", "_display_norm"]
        },
        {
            "$merge": {
                "into": "Laptops",
                "whenMatched": "merge",
                "whenNotMatched": "discard"
            }
        }
    ]
    
    db["Laptops"].aggregate(pipeline)
    print(" Done!")
    
    # Show results
    print("\n" + "=" * 60)
    print("TOP 5 LAPTOPS")
    print("=" * 60)
    
    for i, laptop in enumerate(db["Laptops"].find().sort("final_score", -1).limit(5), 1):
        name = laptop.get("name", "Unknown")[:40]
        score = laptop.get("final_score", 0)
        print(f"{i}. {name}... | Score: {score}")
    
    print("\n" + "=" * 60)
    print("BOTTOM 5 LAPTOPS")
    print("=" * 60)
    
    for i, laptop in enumerate(db["Laptops"].find().sort("final_score", 1).limit(5), 1):
        name = laptop.get("name", "Unknown")[:40]
        score = laptop.get("final_score", 0)
        print(f"{i}. {name}... | Score: {score}")
    
    # Stats
    stats_pipeline = [{"$group": {"_id": None, "min": {"$min": "$final_score"}, "max": {"$max": "$final_score"}, "avg": {"$avg": "$final_score"}}}]
    stats = list(db["Laptops"].aggregate(stats_pipeline))[0]
    print(f"\n Min: {stats['min']:.1f} | Max: {stats['max']:.1f} | Avg: {stats['avg']:.1f}")
    
    # Show score distribution
    print("\n Score Distribution:")
    ranges = [(90, 100, "90-100"), (80, 90, "80-89"), (70, 80, "70-79"), (60, 70, "60-69"), (50, 60, "50-59"), (0, 50, "0-49")]
    for low, high, label in ranges:
        cnt = db["Laptops"].count_documents({"final_score": {"$gte": low, "$lt": high}})
        pct = (cnt / count) * 100
        print(f"   {label}: {cnt} ({pct:.1f}%)")
    
    client.close()
    print("\nAll done!")


if __name__ == "__main__":
    main()
