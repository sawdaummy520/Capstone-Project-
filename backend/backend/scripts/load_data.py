"""
Load BUET (primary) + accidents_v2 (news).
Uses BUET's native 'month' and 'hour_is_default' columns for accuracy.
"""
import sys
import re
from pathlib import Path
import pandas as pd
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).parent.parent))

from database import SessionLocal, engine
import models


DISTRICT_COORDS = {
    "Dhaka": (23.8103, 90.4125), "Chattogram": (22.3569, 91.7832),
    "Rajshahi": (24.3745, 88.6042), "Khulna": (22.8456, 89.5403),
    "Sylhet": (24.8949, 91.8687), "Barishal": (22.7010, 90.3535),
    "Rangpur": (25.7439, 89.2752), "Mymensingh": (24.7471, 90.4203),
    "Cox's Bazar": (21.4272, 92.0058), "Gazipur": (23.9999, 90.4203),
    "Narayanganj": (23.6238, 90.4999), "Tangail": (24.2513, 89.9167),
    "Cumilla": (23.4607, 91.1809), "Bogura": (24.8465, 89.3773),
    "Jashore": (23.1664, 89.2081), "Dinajpur": (25.6217, 88.6354),
    "Pabna": (24.0064, 89.2372), "Faridpur": (23.6070, 89.8429),
    "Noakhali": (22.8696, 91.0995), "Feni": (23.0159, 91.3976),
    "Brahmanbaria": (23.9571, 91.1115), "Kushtia": (23.9013, 89.1206),
    "Jamalpur": (24.9375, 89.9372), "Sirajganj": (24.4534, 89.7007),
    "Natore": (24.4206, 88.9938), "Narsingdi": (23.9322, 90.7151),
    "Munshiganj": (23.5422, 90.5305), "Manikganj": (23.8617, 90.0003),
    "Madaripur": (23.1640, 90.1897), "Gopalganj": (23.0051, 89.8266),
    "Shariatpur": (23.2423, 90.4348), "Rajbari": (23.7574, 89.6445),
    "Kishoreganj": (24.4449, 90.7766), "Netrokona": (24.8103, 90.7279),
    "Sherpur": (25.0205, 90.0153), "Lalmonirhat": (25.9923, 89.2847),
    "Kurigram": (25.8072, 89.6295), "Gaibandha": (25.3288, 89.5281),
    "Nilphamari": (25.9317, 88.8560), "Panchagarh": (26.3411, 88.5541),
    "Thakurgaon": (26.0337, 88.4616), "Rangamati": (22.6533, 92.1735),
    "Khagrachhari": (23.1193, 91.9846), "Bandarban": (22.1953, 92.2184),
    "Jhalokati": (22.6406, 90.1987), "Pirojpur": (22.5841, 89.9720),
    "Barguna": (22.0953, 90.1121), "Bhola": (22.6859, 90.6482),
    "Patuakhali": (22.3596, 90.3298), "Jhenaidah": (23.5449, 89.1539),
    "Magura": (23.4854, 89.4198), "Narail": (23.1725, 89.5127),
    "Satkhira": (22.7185, 89.0705), "Bagerhat": (22.6516, 89.7859),
    "Chuadanga": (23.6401, 88.8418), "Meherpur": (23.7622, 88.6318),
    "Chapainawabganj": (24.5965, 88.2775), "Naogaon": (24.7936, 88.9318),
    "Joypurhat": (25.0947, 89.0227), "Sunamganj": (25.0658, 91.3950),
    "Habiganj": (24.3745, 91.4155), "Moulvibazar": (24.4829, 91.7774),
}

BD_LAT_MIN, BD_LAT_MAX = 20.5, 26.7
BD_LON_MIN, BD_LON_MAX = 88.0, 92.8


def normalize_district(name):
    if pd.isna(name):
        return None
    name = str(name).strip().replace("’", "'")
    fixes = {
        "Coxs Bazar": "Cox's Bazar", "Jhalakathi": "Jhalokati",
        "Nawabganj": "Chapainawabganj", "Bogra": "Bogura",
        "Comilla": "Cumilla", "Jessore": "Jashore",
        "Jhenidah": "Jhenaidah", "Netrakona": "Netrokona",
        "Barisal": "Barishal", "Chittagong": "Chattogram",
        "Chattagram": "Chattogram",
    }
    return fixes.get(name, name)


def safe_str(v, maxlen=500):
    if pd.isna(v):
        return None
    s = str(v).strip()
    if not s or s.lower() == 'nan':
        return None
    return s[:maxlen]


def to_int(v):
    if pd.isna(v):
        return 0
    try:
        return int(float(v))
    except Exception:
        return 0


def to_float_or_none(v):
    if pd.isna(v):
        return None
    try:
        f = float(v)
        return None if f == 0 else f
    except Exception:
        return None


def is_valid_bd_coord(lat, lon):
    if lat is None or lon is None:
        return False
    return BD_LAT_MIN <= lat <= BD_LAT_MAX and BD_LON_MIN <= lon <= BD_LON_MAX


def extract_year(date_str):
    if not date_str:
        return None
    m = re.search(r'(19|20)\d{2}', str(date_str))
    if m:
        return int(m.group(0))
    return None


def derive_district(lat, lon, location_text):
    if location_text and pd.notna(location_text):
        loc_lower = str(location_text).lower()
        for district in DISTRICT_COORDS:
            key = district.lower().split("'")[0].strip()
            if key and key in loc_lower:
                return district
    if is_valid_bd_coord(lat, lon):
        min_d = float('inf')
        best = None
        for d, (dlat, dlon) in DISTRICT_COORDS.items():
            dist = ((lat - dlat) ** 2 + (lon - dlon) ** 2) ** 0.5
            if dist < min_d:
                min_d = dist
                best = d
        return best
    return None


def parse_severity(v):
    if pd.isna(v):
        return None
    s = str(v).lower().strip()
    if s in ['fatal', 'fatal accident', 'killed', 'death']:
        return 3
    if s in ['serious', 'grievous', 'severe', 'major', 'injury']:
        return 2
    if s in ['minor', 'slight', 'simple', 'damage']:
        return 1
    try:
        return int(float(s))
    except Exception:
        return None


def bucket_weather(w):
    if pd.isna(w) or not w:
        return None
    w = str(w).lower().strip()
    if not w:
        return None
    if 'clear' in w or 'sunny' in w:
        return 'Clear'
    if 'cloud' in w or 'overcast' in w:
        return 'Cloudy'
    if 'heavy rain' in w or 'dense rain' in w or 'violent' in w:
        return 'Heavy rain'
    if 'rain' in w or 'drizzle' in w:
        return 'Rain'
    if 'fog' in w or 'mist' in w or 'haze' in w:
        return 'Fog'
    if 'smoke' in w:
        return 'Smoke'
    if 'dust' in w or 'sand' in w:
        return 'Dust'
    if 'storm' in w or 'thunder' in w or 'squall' in w:
        return 'Storm'
    return 'Other'


def is_road_accident(text):
    if not text:
        return True
    t = str(text).lower()
    bad = ["fire", "drown", "landslide", "electrocution", "explosion",
           "boiler", "factory", "elephant", "cyclone"]
    road_words = ["road", "highway", "bus", "truck", "motorcycle",
                  "vehicle", "collision", "rickshaw", "car ", "accident"]
    if any(b in t for b in bad) and not any(r in t for r in road_words):
        return False
    return True


# ==================== BUET ====================
def load_buet(path):
    if not path.exists():
        print(f"[buet] Not found")
        return []

    df = pd.read_csv(path, low_memory=False)
    print(f"[buet] Loaded {len(df)} raw rows")

    rows = []
    skipped = 0
    real_coords = 0
    used_native_month = 0
    used_native_hour = 0
    null_hours = 0

    for _, r in df.iterrows():
        lat = to_float_or_none(r.get("latitude"))
        lon = to_float_or_none(r.get("longitude"))
        loc_text = safe_str(r.get("location"), 300)

        is_ph = 0
        flag = r.get("coord_is_placeholder")
        if pd.notna(flag):
            if str(flag).lower().strip() in ["true", "1", "yes"]:
                is_ph = 1
        if not is_valid_bd_coord(lat, lon):
            is_ph = 1

        district = derive_district(lat, lon, loc_text)
        if not district:
            skipped += 1
            continue

        if is_ph:
            lat, lon = DISTRICT_COORDS[district]
        else:
            real_coords += 1

        # Year from 'date' string
        y = extract_year(r.get("date"))

        # Month — prefer CSV 'month' column (much more reliable)
        mo = None
        month_col = r.get("month")
        if pd.notna(month_col):
            try:
                m_int = int(float(month_col))
                if 1 <= m_int <= 12:
                    mo = m_int
                    used_native_month += 1
            except Exception:
                pass

        # Hour — respect 'hour_is_default'
        hour = None
        hour_is_default = r.get("hour_is_default")
        is_default = False
        if pd.notna(hour_is_default):
            if str(hour_is_default).lower().strip() in ["true", "1", "yes"]:
                is_default = True

        if not is_default:
            hour_val = r.get("hour")
            if pd.notna(hour_val):
                try:
                    h = int(float(hour_val))
                    if 0 <= h <= 23:
                        hour = h
                        used_native_hour += 1
                except Exception:
                    pass

        if hour is None:
            null_hours += 1

        rows.append({
            "event_date": safe_str(r.get("date"), 20),
            "event_time": f"{hour:02d}:00" if hour is not None else None,
            "event_year": y,
            "event_month": mo,
            "event_hour": hour,
            "district": district,
            "upazila": None,
            "road_name": None,
            "accident_type": None,
            "vehicles_involved": None,
            "fatalities": to_int(r.get("deaths")),
            "injuries": to_int(r.get("injuries")),
            "latitude": lat,
            "longitude": lon,
            "source_url": None,
            "source_name": "buet",
            "verification_status": "verified",
            "title": None,
            "cause_of_accident": None,
            "weather_condition": bucket_weather(r.get("weather")),
            "light_condition": safe_str(r.get("light"), 50),
            "road_surface": safe_str(r.get("road_surface"), 100),
            "road_surface_condition": safe_str(r.get("road_surface_condition"), 100),
            "road_class": safe_str(r.get("road_class"), 50),
            "place_type": safe_str(r.get("place_type"), 50),
            "junction": safe_str(r.get("junction"), 100),
            "traffic_control": safe_str(r.get("traffic_control"), 50),
            "severity_score": parse_severity(r.get("severity")),
            "vehicle_count": to_int(r.get("vehicle_count")),
            "coord_is_placeholder": is_ph,
            "location_text": loc_text,
            "data_source": "buet",
        })

    print(f"[buet] Valid: {len(rows)}, Real coords: {real_coords}, Skipped: {skipped}")
    print(f"[buet] Used native month: {used_native_month}/{len(rows)}")
    print(f"[buet] Used native hour: {used_native_hour}/{len(rows)} (null hours: {null_hours})")
    return rows


# ==================== NEWS ====================
def load_v2(path):
    if not path.exists():
        return []
    df = pd.read_csv(path)
    print(f"[v2] Loaded {len(df)} raw rows")
    df = df.copy()
    df["district"] = df["district"].apply(normalize_district)
    df = df[df["district"].isin(DISTRICT_COORDS.keys())]
    print(f"[v2] After district filter: {len(df)}")

    rows = []
    for _, r in df.iterrows():
        text = " ".join([str(r.get("raw_text_snippet", "") or ""),
                         str(r.get("title", "") or "")])
        if not is_road_accident(text):
            continue

        lat = to_float_or_none(r.get("latitude"))
        lon = to_float_or_none(r.get("longitude"))
        if not is_valid_bd_coord(lat, lon):
            lat, lon = DISTRICT_COORDS[r["district"]]

        date_str = safe_str(r.get("event_date"), 20)
        y = extract_year(date_str)

        mo = None
        m = re.search(r'(\d{4})[-/.](\d{1,2})', date_str or "")
        if m:
            try:
                mo = int(m.group(2))
            except Exception:
                pass

        hour = None
        time_str = safe_str(r.get("event_time"), 10)
        if time_str:
            m = re.search(r'(\d{1,2})', time_str)
            if m:
                try:
                    h = int(m.group(1))
                    if 0 <= h <= 23:
                        hour = h
                except Exception:
                    pass

        rows.append({
            "event_date": date_str,
            "event_time": time_str,
            "event_year": y,
            "event_month": mo,
            "event_hour": hour,
            "district": r["district"],
            "upazila": safe_str(r.get("upazila"), 100),
            "road_name": safe_str(r.get("road_name"), 200),
            "accident_type": safe_str(r.get("accident_type"), 100),
            "vehicles_involved": safe_str(r.get("vehicles_involved"), 200),
            "fatalities": to_int(r.get("fatalities")),
            "injuries": to_int(r.get("injuries")),
            "latitude": lat,
            "longitude": lon,
            "source_url": safe_str(r.get("source_url"), 500),
            "source_name": "prothom_news",
            "verification_status": "unverified",
            "title": safe_str(r.get("title"), 500),
            "cause_of_accident": None,
            "weather_condition": None,
            "light_condition": None,
            "road_surface": None,
            "road_surface_condition": None,
            "road_class": None,
            "place_type": None,
            "junction": None,
            "traffic_control": None,
            "severity_score": None,
            "vehicle_count": None,
            "coord_is_placeholder": 1,
            "location_text": None,
            "data_source": "news",
        })
    print(f"[v2] Prepared: {len(rows)}")
    return rows


def main():
    data_dir = Path(__file__).parent.parent / "data"
    buet_path = data_dir / "buet_clean.csv"
    v2_path = data_dir / "accidents_v2.csv"

    with engine.connect() as conn:
        conn.execute(text("DROP TABLE IF EXISTS accidents"))
        conn.commit()
    models.Base.metadata.create_all(bind=engine)
    print("Recreated 'accidents' table\n")

    buet_rows = load_buet(buet_path)
    v2_rows = load_v2(v2_path)
    all_rows = buet_rows + v2_rows
    print(f"\n[final] Total rows: {len(all_rows)}")

    db = SessionLocal()
    try:
        chunk = 500
        for i in range(0, len(all_rows), chunk):
            db.bulk_insert_mappings(models.Accident, all_rows[i:i+chunk])
            db.commit()
    except Exception as e:
        print(f"Insert error: {e}")
        db.rollback()
        db.close()
        return
    db.close()

    with_ym = sum(1 for r in all_rows if r["event_year"] and r["event_month"])
    with_h = sum(1 for r in all_rows if r["event_hour"] is not None)
    print(f"\n✅ Loaded {len(all_rows)} accidents")
    print(f"   - BUET:        {len(buet_rows)}")
    print(f"   - News:        {len(v2_rows)}")
    print(f"   - With Y/M:    {with_ym}")
    print(f"   - With hour:   {with_h}")


if __name__ == "__main__":
    main()