from pymongo import MongoClient
client = MongoClient('mongodb+srv://MFahad:FahadIsSussy_Sus107@cluster0.nz6nvjs.mongodb.net/SpecMatch')
db = client['SpecMatch']

print('=== GRADE DISTRIBUTION ===')
for grade in ['S', 'A', 'B', 'C', 'D', 'F']:
    count = db['Laptops'].count_documents({'final_grade': grade})
    print(f'{grade}: {count} laptops')

print()
print('=== SCORE DISTRIBUTION ===')
pipeline = [
    {'$group': {'_id': None, 'min': {'$min': '$final_score'}, 'max': {'$max': '$final_score'}, 'avg': {'$avg': '$final_score'}}}
]
result = list(db['Laptops'].aggregate(pipeline))
if result:
    r = result[0]
    print(f"Min: {r['min']:.1f}, Max: {r['max']:.1f}, Avg: {r['avg']:.1f}")

print()
print('=== SAMPLE LAPTOPS BY GRADE ===')

# Sample from each grade
for grade in ['S', 'A', 'B', 'C', 'D', 'F']:
    laptop = db['Laptops'].find_one({'final_grade': grade})
    if laptop:
        name = laptop.get('name', 'Unknown')[:35]
        score = laptop.get('final_score', 0)
        summary = laptop.get('component_scores_summary', {})
        cpu = summary.get('cpu', 0)
        gpu = summary.get('gpu', 0)
        ram = summary.get('ram', 0)
        storage = summary.get('storage', 0)
        print(f"{grade}: {name}... | Score: {score:.1f}")
        print(f"   CPU: {cpu:.1f}, GPU: {gpu:.1f}, RAM: {ram:.1f}, Storage: {storage:.1f}")

client.close()
