from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from pydantic import BaseModel as PydanticBase
from pathlib import Path
from datetime import datetime, timedelta, date
from math import radians, sin, cos, asin, sqrt
import json as _json
import re as _re

try:
    import joblib as _joblib
    _JOBLIB_OK = True
except ImportError:
    _JOBLIB_OK = False

from apscheduler.schedulers.background import BackgroundScheduler

import models, schemas
from database import engine, get_db, SessionLocal
from auth import hash_password, verify_password, create_access_token, get_current_user

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="SotorkoBangladesh API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


# ============================================================
# ML loader
# ============================================================
_MODEL_DIR = Path(__file__).parent / "ml_models"
_ml_cache = {"loaded": False}


def load_ml():
    if _ml_cache["loaded"]:
        return _ml_cache
    _ml_cache["model"] = None
    _ml_cache["encoders"] = None
    _ml_cache["metrics"] = None
    _ml_cache["clusters"] = {}
    try:
        if _JOBLIB_OK and (_MODEL_DIR / "risk_model.joblib").exists():
            _ml_cache["model"] = _joblib.load(_MODEL_DIR / "risk_model.joblib")
            _ml_cache["encoders"] = _joblib.load(_MODEL_DIR / "encoders.joblib")
        if (_MODEL_DIR / "metrics.json").exists():
            with open(_MODEL_DIR / "metrics.json") as f:
                _ml_cache["metrics"] = _json.load(f)
        if (_MODEL_DIR / "clusters.json").exists():
            with open(_MODEL_DIR / "clusters.json") as f:
                data = _json.load(f)
                for d in data.get("districts", []):
                    _ml_cache["clusters"][d["district"]] = d
    except Exception as e:
        print(f"[ML] Load error: {e}")
    _ml_cache["loaded"] = True
    return _ml_cache


# ============================================================
# Helpers
# ============================================================
def parse_date_robust(v):
    if not v:
        return (None, None, None)
    s = str(v).strip()
    m = _re.search(r'(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})', s)
    if m:
        try:
            y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
            if 1900 < y < 2100 and 1 <= mo <= 12:
                return (y, mo, d)
        except Exception:
            pass
    m = _re.search(r'(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})', s)
    if m:
        try:
            a, b, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
            if 1900 < y < 2100 and 1 <= b <= 12:
                return (y, b, a)
        except Exception:
            pass
    m = _re.search(r'(19|20)\d{2}', s)
    if m:
        return (int(m.group(0)), None, None)
    return (None, None, None)


def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    return 2 * R * asin(sqrt(a))


def compute_risk(accidents_count, fatalities, injuries, upazilas, top_vehicles):
    severity = fatalities * 3 + injuries
    sev_score = min(severity / 200, 1) * 60
    freq_score = min(accidents_count / 50, 1) * 40
    score = round(sev_score + freq_score)

    if score >= 75:
        level = "Critical"
    elif score >= 50:
        level = "High"
    elif score >= 25:
        level = "Medium"
    else:
        level = "Low"

    if accidents_count >= 20:
        confidence = "high"
    elif accidents_count >= 5:
        confidence = "medium"
    else:
        confidence = "low"

    factors = []
    if fatalities >= 10:
        factors.append(f"High fatality count: {fatalities} deaths recorded")
    elif fatalities > 0:
        factors.append(f"{fatalities} fatalities recorded")
    if top_vehicles:
        t = top_vehicles[0]
        if t["count"] >= 10:
            factors.append(f"{t['vehicle'].title()} involved in {t['count']} accidents")
    if upazilas:
        u = upazilas[0]
        if u["total"] >= 10:
            factors.append(f"Concentrated in {u['upazila']}: {u['total']} accidents")
    if accidents_count >= 50:
        factors.append(f"High frequency: {accidents_count} total accidents")

    return {
        "score": score, "level": level, "confidence": confidence,
        "factors": factors[:3] if factors else ["Insufficient data for detailed explanation"],
    }


def compute_spike_for_district(db, district, window_days=30, baseline_days=365):
    latest = db.query(func.max(models.Accident.event_date)).scalar()
    if not latest:
        return None
    y, mo, d = parse_date_robust(latest)
    if not y:
        return None
    latest_dt = date(y, mo or 1, d or 1)
    recent_start = (latest_dt - timedelta(days=window_days)).isoformat()
    baseline_start = (latest_dt - timedelta(days=baseline_days)).isoformat()

    recent = db.query(func.count(models.Accident.id)).filter(
        models.Accident.district == district,
        models.Accident.event_date >= recent_start,
        models.Accident.event_date <= latest,
    ).scalar() or 0
    baseline_total = db.query(func.count(models.Accident.id)).filter(
        models.Accident.district == district,
        models.Accident.event_date >= baseline_start,
        models.Accident.event_date <= latest,
    ).scalar() or 0
    expected = baseline_total * (window_days / baseline_days) if baseline_days else 0
    ratio = (recent / expected) if expected > 0 else 0

    return {
        "district": district, "recent_count": recent, "baseline_count": baseline_total,
        "expected_in_window": round(expected, 1), "spike_ratio": round(ratio, 2),
        "window_days": window_days, "latest_date": latest, "recent_start": recent_start,
    }


def compute_all_spikes(db, window_days=30, baseline_days=365, min_recent=5):
    latest = db.query(func.max(models.Accident.event_date)).scalar()
    if not latest:
        return []
    y, mo, d = parse_date_robust(latest)
    if not y:
        return []
    latest_dt = date(y, mo or 1, d or 1)
    recent_start = (latest_dt - timedelta(days=window_days)).isoformat()
    baseline_start = (latest_dt - timedelta(days=baseline_days)).isoformat()

    districts = [row[0] for row in db.query(models.Accident.district).distinct().all() if row[0]]
    spikes = []
    for dist in districts:
        recent = db.query(func.count(models.Accident.id)).filter(
            models.Accident.district == dist,
            models.Accident.event_date >= recent_start,
            models.Accident.event_date <= latest,
        ).scalar() or 0
        baseline_total = db.query(func.count(models.Accident.id)).filter(
            models.Accident.district == dist,
            models.Accident.event_date >= baseline_start,
            models.Accident.event_date <= latest,
        ).scalar() or 0
        expected = baseline_total * (window_days / baseline_days) if baseline_total else 0
        ratio = (recent / expected) if expected > 0 else 0
        if recent >= min_recent and ratio >= 1.5:
            spikes.append({
                "district": dist, "recent_count": recent,
                "expected_in_window": round(expected, 1), "spike_ratio": round(ratio, 2),
            })
    spikes.sort(key=lambda x: x["spike_ratio"], reverse=True)
    return spikes


# ============================================================
# Root
# ============================================================
@app.get("/")
def root():
    return {"message": "SotorkoBangladesh API is running"}


# ============================================================
# AUTH
# ============================================================
class ProfileUpdateIn(PydanticBase):
    name: Optional[str] = None
    preferred_district: Optional[str] = None


class PasswordChangeIn(PydanticBase):
    current_password: str
    new_password: str


class ForgotPasswordIn(PydanticBase):
    email: str
    new_password: str


@app.post("/api/auth/register", response_model=schemas.UserResponse, status_code=201)
def register(payload: schemas.RegisterRequest, db: Session = Depends(get_db)):
    if db.query(models.User).filter(models.User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = models.User(
        name=payload.name, email=payload.email,
        hashed_password=hash_password(payload.password),
        preferred_district=payload.preferred_district,
    )
    db.add(user); db.commit(); db.refresh(user)
    return user


@app.post("/api/auth/login", response_model=schemas.TokenResponse)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(data={"sub": user.email})
    return {"access_token": token, "token_type": "bearer", "user": user}


@app.get("/api/auth/me", response_model=schemas.UserResponse)
def get_me(current_user: models.User = Depends(get_current_user)):
    return current_user


@app.put("/api/auth/profile", response_model=schemas.UserResponse)
def update_profile(
    payload: ProfileUpdateIn,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if payload.name is not None and payload.name.strip():
        current_user.name = payload.name.strip()
    if payload.preferred_district is not None:
        current_user.preferred_district = payload.preferred_district
    db.commit(); db.refresh(current_user)
    return current_user


@app.put("/api/auth/password")
def change_password(
    payload: PasswordChangeIn,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(payload.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
    current_user.hashed_password = hash_password(payload.new_password)
    db.commit()
    return {"ok": True, "message": "Password updated successfully"}


@app.post("/api/auth/forgot-password")
def forgot_password(payload: ForgotPasswordIn, db: Session = Depends(get_db)):
    """
    DEMO MODE: resets password if the email exists.
    In production this must be replaced with an email-token flow.
    """
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if not user:
        # Don't reveal whether email exists — security best practice
        return {"ok": True, "message": "If this email exists, password has been reset"}
    if len(payload.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
    user.hashed_password = hash_password(payload.new_password)
    db.commit()
    return {"ok": True, "message": "Password reset successfully. Please log in."}


# ============================================================
# PUBLIC
# ============================================================
@app.get("/api/public/districts")
def public_districts(db: Session = Depends(get_db)):
    rows = db.query(models.Accident.district).distinct().all()
    districts = sorted([{"district": r[0]} for r in rows if r[0]], key=lambda x: x["district"])
    return {"districts": districts, "count": len(districts)}


# ============================================================
# DISTRICTS
# ============================================================
@app.get("/api/districts")
def list_districts(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    rows = (
        db.query(
            models.Accident.district,
            func.count(models.Accident.id).label("total"),
            func.sum(models.Accident.fatalities).label("fatalities"),
            func.sum(models.Accident.injuries).label("injuries"),
        )
        .group_by(models.Accident.district).all()
    )
    result = []
    for r in rows:
        fatalities = int(r[2] or 0)
        injuries = int(r[3] or 0)
        severity = fatalities * 3 + injuries
        if severity >= 100:
            level = "Critical"
        elif severity >= 50:
            level = "High"
        elif severity >= 20:
            level = "Medium"
        else:
            level = "Low"
        result.append({
            "district": r[0], "total_accidents": r[1] or 0,
            "fatalities": fatalities, "injuries": injuries, "risk_level": level,
        })
    result.sort(key=lambda x: x["total_accidents"], reverse=True)
    return {"districts": result, "count": len(result)}


@app.get("/api/districts/{district_name}")
def district_detail(district_name: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    rows = db.query(models.Accident).filter(models.Accident.district == district_name).all()
    if not rows:
        raise HTTPException(status_code=404, detail="No data for this district")
    fatalities = sum(r.fatalities or 0 for r in rows)
    injuries = sum(r.injuries or 0 for r in rows)

    upazila_map = {}
    for r in rows:
        u = r.upazila or "Unknown"
        if u not in upazila_map:
            upazila_map[u] = {"upazila": u, "total": 0, "fatalities": 0, "injuries": 0}
        upazila_map[u]["total"] += 1
        upazila_map[u]["fatalities"] += r.fatalities or 0
        upazila_map[u]["injuries"] += r.injuries or 0

    def count_field(getter, label):
        d = {}
        for r in rows:
            v = getter(r)
            if v:
                d[v] = d.get(v, 0) + 1
        return sorted([{label: k, "count": v} for k, v in d.items()],
                       key=lambda x: x["count"], reverse=True)[:6]

    vehicle_map = {}
    for r in rows:
        v = (r.vehicles_involved or "").strip().lower()
        for piece in v.split(","):
            piece = piece.strip()
            if piece:
                vehicle_map[piece] = vehicle_map.get(piece, 0) + 1
    top_vehicles = sorted([{"vehicle": k, "count": v} for k, v in vehicle_map.items()],
                           key=lambda x: x["count"], reverse=True)[:5]

    return {
        "district": district_name, "total_accidents": len(rows),
        "fatalities": fatalities, "injuries": injuries,
        "upazilas": sorted(upazila_map.values(), key=lambda x: x["total"], reverse=True),
        "top_vehicles": top_vehicles,
        "top_weather": count_field(lambda r: r.weather_condition, "weather"),
        "top_causes": count_field(lambda r: (r.cause_of_accident or "")[:80] or None, "cause"),
        "top_road_classes": count_field(lambda r: r.road_class, "road_class"),
        "top_junctions": count_field(lambda r: r.junction, "junction"),
        "top_light": count_field(lambda r: r.light_condition, "light"),
        "coverage": "high" if len(rows) >= 20 else ("medium" if len(rows) >= 5 else "low"),
    }


# ============================================================
# RISK
# ============================================================
@app.get("/api/risk/{district_name}")
def risk_for_district(district_name: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    rows = db.query(models.Accident).filter(models.Accident.district == district_name).all()
    if not rows:
        raise HTTPException(status_code=404, detail="No data")
    fatalities = sum(r.fatalities or 0 for r in rows)
    injuries = sum(r.injuries or 0 for r in rows)
    upazila_map = {}
    for r in rows:
        u = r.upazila or "Unknown"
        if u not in upazila_map:
            upazila_map[u] = {"upazila": u, "total": 0}
        upazila_map[u]["total"] += 1
    upazilas = sorted(upazila_map.values(), key=lambda x: x["total"], reverse=True)
    vehicle_map = {}
    for r in rows:
        v = (r.vehicles_involved or "").lower()
        for piece in v.split(","):
            piece = piece.strip()
            if piece:
                vehicle_map[piece] = vehicle_map.get(piece, 0) + 1
    top_vehicles = sorted([{"vehicle": k, "count": v} for k, v in vehicle_map.items()],
                           key=lambda x: x["count"], reverse=True)[:5]
    risk = compute_risk(len(rows), fatalities, injuries, upazilas, top_vehicles)
    spike = compute_spike_for_district(db, district_name)
    return {
        "district": district_name, "risk": risk, "spike": spike,
        "stats": {"total_accidents": len(rows), "fatalities": fatalities, "injuries": injuries},
        "upazilas": upazilas[:5], "top_vehicles": top_vehicles,
    }


@app.get("/api/filter-options")
def filter_options(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    rows = db.query(models.Accident).all()
    years, accident_types, vehicles, districts = set(), set(), set(), set()
    for r in rows:
        if r.event_year:
            years.add(int(r.event_year))
        if r.accident_type:
            accident_types.add(r.accident_type.strip())
        if r.vehicles_involved:
            for piece in r.vehicles_involved.lower().split(","):
                piece = piece.strip()
                if piece:
                    vehicles.add(piece)
        if r.district:
            districts.add(r.district)
    return {
        "years": sorted(years, reverse=True),
        "accident_types": sorted(accident_types),
        "vehicles": sorted(vehicles)[:20],
        "districts": sorted(districts),
    }


# ============================================================
# ROUTE RISK
# ============================================================
class RouteRiskIn(PydanticBase):
    from_district: str
    to_district: str
    samples: int = 25
    radius_km: float = 10.0


@app.post("/api/route-risk")
def route_risk(
    payload: RouteRiskIn,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    from_d = payload.from_district
    to_d = payload.to_district

    if from_d not in DISTRICT_COORDS or to_d not in DISTRICT_COORDS:
        raise HTTPException(status_code=400, detail="Invalid district name")
    if from_d == to_d:
        raise HTTPException(status_code=400, detail="From and To must be different")

    samples = max(5, min(60, payload.samples))
    radius_km = max(2.0, min(50.0, payload.radius_km))

    lat1, lon1 = DISTRICT_COORDS[from_d]
    lat2, lon2 = DISTRICT_COORDS[to_d]

    # Pre-filter accidents in a corridor (bounding box + margin)
    margin = max(0.3, radius_km / 111.0 + 0.05)
    min_lat = min(lat1, lat2) - margin
    max_lat = max(lat1, lat2) + margin
    min_lon = min(lon1, lon2) - margin
    max_lon = max(lon1, lon2) + margin

    acc_rows = (
        db.query(models.Accident)
        .filter(models.Accident.latitude.between(min_lat, max_lat))
        .filter(models.Accident.longitude.between(min_lon, max_lon))
        .all()
    )
    acc_coords = [
        (a.latitude, a.longitude, a.fatalities or 0, a.injuries or 0)
        for a in acc_rows if a.latitude is not None and a.longitude is not None
    ]

    total_distance_km = haversine_km(lat1, lon1, lat2, lon2)

    waypoints = []
    total_acc_near = 0
    total_fat_near = 0
    max_score = 0

    for i in range(samples + 1):
        t = i / samples
        lat = lat1 + (lat2 - lat1) * t
        lon = lon1 + (lon2 - lon1) * t
        dist_from_start = total_distance_km * t

        nearby_count = 0
        nearby_fatalities = 0
        nearby_injuries = 0
        weighted = 0.0

        for ala, alo, fat, inj in acc_coords:
            d = haversine_km(lat, lon, ala, alo)
            if d <= radius_km:
                nearby_count += 1
                nearby_fatalities += fat
                nearby_injuries += inj
                # inverse distance weight (closer accidents matter more)
                weighted += 1.0 / (1.0 + d / 2.0)

        sev = nearby_fatalities * 3 + nearby_injuries
        sev_score = min(sev / 40.0, 1.0) * 60
        freq_score = min(weighted / 15.0, 1.0) * 40
        score = int(round(sev_score + freq_score))
        score = max(0, min(100, score))

        if score >= 75:
            level = "Critical"
        elif score >= 50:
            level = "High"
        elif score >= 25:
            level = "Medium"
        else:
            level = "Low"

        waypoints.append({
            "index": i,
            "lat": round(lat, 5),
            "lon": round(lon, 5),
            "distance_km": round(dist_from_start, 1),
            "nearby_accidents": nearby_count,
            "nearby_fatalities": nearby_fatalities,
            "nearby_injuries": nearby_injuries,
            "risk_score": score,
            "risk_level": level,
        })

        total_acc_near += nearby_count
        total_fat_near += nearby_fatalities
        max_score = max(max_score, score)

    if max_score >= 75:
        overall_level = "Critical"
    elif max_score >= 50:
        overall_level = "High"
    elif max_score >= 25:
        overall_level = "Medium"
    else:
        overall_level = "Low"

    high_risk = [w for w in waypoints if w["risk_level"] in ("High", "Critical")]
    high_risk.sort(key=lambda x: x["risk_score"], reverse=True)

    return {
        "from_district": from_d,
        "to_district": to_d,
        "from_coords": {"lat": lat1, "lon": lon1},
        "to_coords": {"lat": lat2, "lon": lon2},
        "distance_km": round(total_distance_km, 1),
        "radius_km": radius_km,
        "samples": samples,
        "overall_risk_level": overall_level,
        "overall_risk_score": max_score,
        "total_accidents_in_corridor": len(acc_coords),
        "high_risk_segment_count": len(high_risk),
        "waypoints": waypoints,
        "high_risk_segments": high_risk[:10],
    }


# ============================================================
# STATS
# ============================================================
@app.get("/api/stats/summary")
def stats_summary(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    total = db.query(func.count(models.Accident.id)).scalar() or 0
    fatalities = db.query(func.sum(models.Accident.fatalities)).scalar() or 0
    injuries = db.query(func.sum(models.Accident.injuries)).scalar() or 0
    buet = db.query(func.count(models.Accident.id)).filter(models.Accident.data_source == "buet").scalar() or 0
    news = db.query(func.count(models.Accident.id)).filter(models.Accident.data_source == "news").scalar() or 0
    with_coords = db.query(func.count(models.Accident.id)).filter(models.Accident.coord_is_placeholder == 0).scalar() or 0
    latest = db.query(func.max(models.Accident.event_date)).scalar()
    earliest = db.query(func.min(models.Accident.event_date)).scalar()
    return {
        "total_accidents": total, "total_fatalities": int(fatalities),
        "total_injuries": int(injuries), "buet_records": buet,
        "news_records": news, "with_real_coords": with_coords,
        "earliest_date": earliest, "latest_date": latest,
    }


@app.get("/api/stats/monthly")
def stats_monthly(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    rows = (
        db.query(models.Accident.event_month, func.count(models.Accident.id))
        .filter(models.Accident.event_month.isnot(None))
        .filter(models.Accident.event_month >= 1)
        .filter(models.Accident.event_month <= 12)
        .group_by(models.Accident.event_month).all()
    )
    month_map = {int(r[0]): int(r[1]) for r in rows}
    return {"months": [{"month": str(i).zfill(2), "count": month_map.get(i, 0)} for i in range(1, 13)]}


@app.get("/api/stats/hourly")
def stats_hourly(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    rows = (
        db.query(models.Accident.event_hour, func.count(models.Accident.id))
        .filter(models.Accident.event_hour.isnot(None))
        .filter(models.Accident.event_hour >= 0)
        .filter(models.Accident.event_hour <= 23)
        .group_by(models.Accident.event_hour).all()
    )
    hour_map = {int(r[0]): int(r[1]) for r in rows}
    return {"hours": [{"hour": str(i).zfill(2), "count": hour_map.get(i, 0)} for i in range(24)]}


@app.get("/api/stats/yearly")
def stats_yearly(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    rows = (
        db.query(models.Accident.event_year, func.count(models.Accident.id))
        .filter(models.Accident.event_year.isnot(None))
        .group_by(models.Accident.event_year).order_by(models.Accident.event_year).all()
    )
    return {"years": [{"year": int(r[0]), "count": int(r[1])} for r in rows]}


@app.get("/api/stats/vehicles")
def stats_vehicles(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    rows = db.query(models.Accident.vehicles_involved).filter(
        models.Accident.vehicles_involved.isnot(None)).all()
    counter = {}
    for r in rows:
        v = (r[0] or "").strip().lower()
        for piece in v.split(","):
            piece = piece.strip()
            if piece:
                counter[piece] = counter.get(piece, 0) + 1
    top = sorted([{"vehicle": k, "count": v} for k, v in counter.items()],
                  key=lambda x: x["count"], reverse=True)[:10]
    return {"vehicles": top}


@app.get("/api/stats/accident-types")
def stats_accident_types(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    rows = db.query(models.Accident.accident_type).filter(
        models.Accident.accident_type.isnot(None)).all()
    counter = {}
    for r in rows:
        t = (r[0] or "unknown").strip().lower()
        if t:
            counter[t] = counter.get(t, 0) + 1
    top = sorted([{"type": k, "count": v} for k, v in counter.items()],
                  key=lambda x: x["count"], reverse=True)[:8]
    return {"types": top}


@app.get("/api/stats/top-districts")
def stats_top_districts(limit: int = 10, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    rows = (
        db.query(models.Accident.district, func.count(models.Accident.id).label("total"),
                 func.sum(models.Accident.fatalities).label("fatalities"))
        .group_by(models.Accident.district)
        .order_by(func.count(models.Accident.id).desc())
        .limit(limit).all()
    )
    return {"districts": [{"district": r[0], "total": int(r[1] or 0), "fatalities": int(r[2] or 0)} for r in rows]}


@app.get("/api/stats/weather")
def stats_weather(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    rows = db.query(models.Accident.weather_condition).filter(
        models.Accident.weather_condition.isnot(None)).all()
    counter = {}
    for r in rows:
        w = r[0]
        if w:
            counter[w] = counter.get(w, 0) + 1
    return {"weather": sorted([{"weather": k, "count": v} for k, v in counter.items()],
                                key=lambda x: x["count"], reverse=True)}


@app.get("/api/stats/severity")
def stats_severity(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    rows = db.query(models.Accident.severity_score).filter(
        models.Accident.severity_score.isnot(None)).all()
    counter = {1: 0, 2: 0, 3: 0}
    for r in rows:
        s = r[0]
        if s in counter:
            counter[s] += 1
    labels = {1: "Minor", 2: "Serious", 3: "Fatal"}
    return {"severity": [{"severity": labels[k], "count": counter[k]} for k in [1, 2, 3]]}


@app.get("/api/stats/road-class")
def stats_road_class(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    rows = db.query(models.Accident.road_class).filter(
        models.Accident.road_class.isnot(None)).all()
    counter = {}
    for r in rows:
        if r[0]:
            counter[r[0]] = counter.get(r[0], 0) + 1
    return {"road_classes": sorted([{"road_class": k, "count": v} for k, v in counter.items()],
                                     key=lambda x: x["count"], reverse=True)}


@app.get("/api/stats/recent-spikes")
def stats_recent_spikes(
    window_days: int = 30, baseline_days: int = 365, min_recent: int = 5,
    db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user),
):
    latest = db.query(func.max(models.Accident.event_date)).scalar()
    spikes = compute_all_spikes(db, window_days, baseline_days, min_recent)
    return {
        "recent_window_days": window_days, "baseline_window_days": baseline_days,
        "latest_date": latest, "spikes": spikes,
    }


# ============================================================
# ML
# ============================================================
@app.get("/api/ml-info")
def ml_info(current_user: models.User = Depends(get_current_user)):
    ml = load_ml()
    return {
        "model_loaded": ml["model"] is not None,
        "metrics": ml["metrics"], "cluster_count": len(ml["clusters"]),
    }


@app.get("/api/clusters")
def get_clusters(current_user: models.User = Depends(get_current_user)):
    ml = load_ml()
    return {"clusters": list(ml["clusters"].values())}


# ============================================================
# NEWS
# ============================================================
@app.get("/api/news")
def list_news(
    district: Optional[str] = None, year: Optional[str] = None,
    weather: Optional[str] = None, data_source: Optional[str] = None,
    limit: int = 50, offset: int = 0,
    db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user),
):
    q = db.query(models.Accident)
    if district:
        q = q.filter(models.Accident.district == district)
    if year:
        q = q.filter(models.Accident.event_year == int(year))
    if weather:
        q = q.filter(models.Accident.weather_condition == weather)
    if data_source:
        q = q.filter(models.Accident.data_source == data_source)
    total = q.count()
    rows = q.order_by(models.Accident.id.desc()).offset(offset).limit(limit).all()
    return {
        "total": total, "limit": limit, "offset": offset,
        "results": [
            {
                "id": r.id, "event_date": r.event_date, "event_time": r.event_time,
                "district": r.district, "upazila": r.upazila, "title": r.title,
                "accident_type": r.accident_type, "vehicles_involved": r.vehicles_involved,
                "cause_of_accident": r.cause_of_accident, "weather_condition": r.weather_condition,
                "light_condition": r.light_condition, "road_class": r.road_class,
                "junction": r.junction, "severity_score": r.severity_score,
                "fatalities": r.fatalities, "injuries": r.injuries,
                "source_url": r.source_url, "source_name": r.source_name,
                "data_source": r.data_source, "verification_status": r.verification_status,
                "coord_is_placeholder": r.coord_is_placeholder,
            }
            for r in rows
        ],
    }


@app.get("/api/map-points")
def map_points(limit: int = 5000, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    rows = (
        db.query(models.Accident)
        .filter(models.Accident.coord_is_placeholder == 0)
        .filter(models.Accident.latitude.isnot(None))
        .filter(models.Accident.longitude.isnot(None))
        .limit(limit).all()
    )
    return {
        "count": len(rows),
        "points": [
            {
                "lat": r.latitude, "lon": r.longitude, "district": r.district,
                "fatalities": r.fatalities, "injuries": r.injuries,
                "severity": r.severity_score, "weather": r.weather_condition,
                "event_date": r.event_date,
            }
            for r in rows
        ],
    }


# ============================================================
# SAVED LOCATIONS
# ============================================================
class SavedLocationIn(PydanticBase):
    label: str
    district: str
    upazila: Optional[str] = None
    note: Optional[str] = None


class SavedLocationOut(PydanticBase):
    id: int
    label: str
    district: str
    upazila: Optional[str] = None
    note: Optional[str] = None

    class Config:
        from_attributes = True


@app.post("/api/locations", response_model=SavedLocationOut, status_code=201)
def add_location(payload: SavedLocationIn, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    loc = models.SavedLocation(
        user_id=current_user.id, label=payload.label,
        district=payload.district, upazila=payload.upazila, note=payload.note,
    )
    db.add(loc); db.commit(); db.refresh(loc)
    return loc


@app.get("/api/locations", response_model=list[SavedLocationOut])
def list_locations(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return (db.query(models.SavedLocation)
            .filter(models.SavedLocation.user_id == current_user.id)
            .order_by(models.SavedLocation.created_at.desc()).all())


@app.delete("/api/locations/{loc_id}")
def delete_location(loc_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    loc = (db.query(models.SavedLocation)
           .filter(models.SavedLocation.id == loc_id, models.SavedLocation.user_id == current_user.id).first())
    if not loc:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(loc); db.commit()
    return {"deleted": loc_id}


# ============================================================
# ALERTS
# ============================================================
class AlertRuleIn(PydanticBase):
    location_id: int
    threshold: int = 50
    time_window: str = "any"
    cooldown_hours: int = 6
    daily_cap: int = 3
    enabled: int = 1


class AlertRuleOut(PydanticBase):
    id: int
    location_id: int
    threshold: int
    time_window: str
    cooldown_hours: int
    daily_cap: int
    enabled: int

    class Config:
        from_attributes = True


class AlertOut(PydanticBase):
    id: int
    rule_id: int
    location_id: int
    risk_score: int
    message: str
    is_read: int
    created_at: datetime

    class Config:
        from_attributes = True


@app.post("/api/alerts/rules", response_model=AlertRuleOut, status_code=201)
def create_alert_rule(payload: AlertRuleIn, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    loc = (db.query(models.SavedLocation)
           .filter(models.SavedLocation.id == payload.location_id,
                   models.SavedLocation.user_id == current_user.id).first())
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")
    rule = models.AlertRule(user_id=current_user.id, **payload.dict())
    db.add(rule); db.commit(); db.refresh(rule)
    return rule


@app.get("/api/alerts/rules", response_model=list[AlertRuleOut])
def list_alert_rules(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return (db.query(models.AlertRule)
            .filter(models.AlertRule.user_id == current_user.id)
            .order_by(models.AlertRule.created_at.desc()).all())


@app.delete("/api/alerts/rules/{rule_id}")
def delete_alert_rule(rule_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    rule = (db.query(models.AlertRule)
            .filter(models.AlertRule.id == rule_id, models.AlertRule.user_id == current_user.id).first())
    if not rule:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(rule); db.commit()
    return {"deleted": rule_id}


@app.post("/api/alerts/rules/{rule_id}/toggle", response_model=AlertRuleOut)
def toggle_alert_rule(rule_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    rule = (db.query(models.AlertRule)
            .filter(models.AlertRule.id == rule_id, models.AlertRule.user_id == current_user.id).first())
    if not rule:
        raise HTTPException(status_code=404, detail="Not found")
    rule.enabled = 0 if rule.enabled == 1 else 1
    db.commit(); db.refresh(rule)
    return rule


@app.get("/api/alerts", response_model=list[AlertOut])
def list_alerts(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return (db.query(models.AlertHistory)
            .filter(models.AlertHistory.user_id == current_user.id)
            .order_by(models.AlertHistory.created_at.desc()).limit(50).all())


@app.get("/api/alerts/unread-count")
def unread_count(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    n = (db.query(models.AlertHistory)
         .filter(models.AlertHistory.user_id == current_user.id,
                 models.AlertHistory.is_read == 0).count())
    return {"unread": n}


@app.post("/api/alerts/mark-read")
def mark_all_read(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db.query(models.AlertHistory).filter(
        models.AlertHistory.user_id == current_user.id,
        models.AlertHistory.is_read == 0,
    ).update({"is_read": 1})
    db.commit()
    return {"ok": True}


@app.get("/api/alerts/dashboard")
def alerts_dashboard(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    rules = (db.query(models.AlertRule)
             .filter(models.AlertRule.user_id == current_user.id)
             .order_by(models.AlertRule.created_at.desc()).all())
    locations = {loc.id: loc for loc in
                 db.query(models.SavedLocation)
                 .filter(models.SavedLocation.user_id == current_user.id).all()}

    enriched_rules = []
    for r in rules:
        loc = locations.get(r.location_id)
        if not loc:
            continue
        rows = db.query(models.Accident).filter(models.Accident.district == loc.district).all()
        fatalities = sum(x.fatalities or 0 for x in rows)
        injuries = sum(x.injuries or 0 for x in rows)
        risk_data = compute_risk(len(rows), fatalities, injuries, [], [])
        spike = compute_spike_for_district(db, loc.district)
        threshold_met = risk_data["score"] >= r.threshold
        spike_met = bool(spike and spike["spike_ratio"] >= 1.5 and spike["recent_count"] >= 3)
        enriched_rules.append({
            "id": r.id, "location_id": r.location_id,
            "location_label": loc.label, "location_district": loc.district,
            "location_upazila": loc.upazila,
            "threshold": r.threshold, "time_window": r.time_window,
            "cooldown_hours": r.cooldown_hours, "daily_cap": r.daily_cap,
            "enabled": r.enabled,
            "current_risk_score": risk_data["score"],
            "current_risk_level": risk_data["level"],
            "current_confidence": risk_data["confidence"],
            "threshold_met": threshold_met, "spike": spike, "spike_met": spike_met,
            "would_fire": threshold_met or spike_met,
        })

    alerts = (db.query(models.AlertHistory)
              .filter(models.AlertHistory.user_id == current_user.id)
              .order_by(models.AlertHistory.created_at.desc()).limit(20).all())
    unread = (db.query(models.AlertHistory)
              .filter(models.AlertHistory.user_id == current_user.id,
                      models.AlertHistory.is_read == 0).count())

    return {
        "rules": enriched_rules,
        "recent_spikes": compute_all_spikes(db, 30, 365, 5)[:10],
        "alerts": [
            {"id": a.id, "rule_id": a.rule_id, "location_id": a.location_id,
             "risk_score": a.risk_score, "message": a.message,
             "is_read": a.is_read, "created_at": a.created_at.isoformat()}
            for a in alerts
        ],
        "unread_count": unread,
    }


@app.post("/api/alerts/check-now")
def check_alerts_now(current_user: models.User = Depends(get_current_user)):
    _check_alerts_job()
    return {"ok": True, "message": "Alert rules evaluated"}


@app.post("/api/alerts/demo-trigger/{rule_id}")
def demo_trigger_alert(rule_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    rule = (db.query(models.AlertRule)
            .filter(models.AlertRule.id == rule_id, models.AlertRule.user_id == current_user.id).first())
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    loc = db.query(models.SavedLocation).filter(models.SavedLocation.id == rule.location_id).first()
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")
    rows = db.query(models.Accident).filter(models.Accident.district == loc.district).all()
    fatalities = sum(r.fatalities or 0 for r in rows)
    injuries = sum(r.injuries or 0 for r in rows)
    risk_data = compute_risk(len(rows), fatalities, injuries, [], [])
    spike = compute_spike_for_district(db, loc.district)
    spike_info = ""
    if spike:
        spike_info = (f" Recent window: {spike['recent_count']} accidents in last 30 days "
                      f"({spike['spike_ratio']}x baseline).")
    msg = (f"[DEMO] Risk at '{loc.label}' ({loc.district}) is {risk_data['score']}/100 "
           f"(threshold {rule.threshold}).{spike_info} "
           f"This is a predictive alert, not an emergency notification.")
    alert = models.AlertHistory(
        user_id=current_user.id, rule_id=rule.id, location_id=loc.id,
        risk_score=risk_data["score"], message=msg,
    )
    db.add(alert); db.commit(); db.refresh(alert)
    return {"ok": True,
            "alert": {"id": alert.id, "risk_score": alert.risk_score,
                       "message": alert.message, "created_at": alert.created_at.isoformat()}}


# ============================================================
# ALERT WORKER
# ============================================================
def _check_alerts_job():
    db = SessionLocal()
    try:
        rules = db.query(models.AlertRule).filter(models.AlertRule.enabled == 1).all()
        for rule in rules:
            loc = db.query(models.SavedLocation).filter(models.SavedLocation.id == rule.location_id).first()
            if not loc:
                continue
            rows = db.query(models.Accident).filter(models.Accident.district == loc.district).all()
            if not rows:
                continue
            fatalities = sum(r.fatalities or 0 for r in rows)
            injuries = sum(r.injuries or 0 for r in rows)
            upazila_map = {}
            for r in rows:
                u = r.upazila or "Unknown"
                upazila_map[u] = upazila_map.get(u, 0) + 1
            upazilas = sorted([{"upazila": k, "total": v} for k, v in upazila_map.items()],
                                key=lambda x: x["total"], reverse=True)
            risk_data = compute_risk(len(rows), fatalities, injuries, upazilas, [])
            score = risk_data["score"]
            spike = compute_spike_for_district(db, loc.district)
            threshold_met = score >= rule.threshold
            spike_met = bool(spike and spike["spike_ratio"] >= 1.5 and spike["recent_count"] >= 3)
            if not (threshold_met or spike_met):
                continue
            now = datetime.utcnow()
            last = (db.query(models.AlertHistory)
                    .filter(models.AlertHistory.rule_id == rule.id)
                    .order_by(models.AlertHistory.created_at.desc()).first())
            if last and (now - last.created_at) < timedelta(hours=rule.cooldown_hours):
                continue
            today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            today_count = (db.query(models.AlertHistory)
                           .filter(models.AlertHistory.rule_id == rule.id,
                                   models.AlertHistory.created_at >= today_start).count())
            if today_count >= rule.daily_cap:
                continue
            if spike_met:
                msg = (f"🚨 Recent spike in {loc.district}: {spike['recent_count']} accidents in the last 30 days "
                       f"(expected ~{spike['expected_in_window']}, {spike['spike_ratio']}x baseline). "
                       f"Saved location: '{loc.label}'. "
                       f"This is a predictive alert, not an emergency notification.")
            else:
                factor = risk_data["factors"][0] if risk_data["factors"] else ""
                msg = (f"⚠️ Risk at '{loc.label}' ({loc.district}) is {score}/100 "
                       f"(threshold {rule.threshold}). {factor}. "
                       f"This is a predictive alert, not an emergency notification.")
            db.add(models.AlertHistory(
                user_id=rule.user_id, rule_id=rule.id, location_id=loc.id,
                risk_score=score, message=msg))
        db.commit()
    except Exception as e:
        print(f"[Alert Worker] error: {e}")
    finally:
        db.close()


_scheduler = None


@app.on_event("startup")
def start_scheduler():
    global _scheduler
    models.Base.metadata.create_all(bind=engine)
    _scheduler = BackgroundScheduler()
    _scheduler.add_job(_check_alerts_job, "interval", minutes=2, id="alert_worker")
    _scheduler.start()
    print("[Alert Worker] started — runs every 2 minutes")


@app.on_event("shutdown")
def stop_scheduler():
    global _scheduler
    if _scheduler:
        _scheduler.shutdown()