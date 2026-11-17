from sqlalchemy import Column, Integer, String, DateTime, Float
from datetime import datetime
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    preferred_district = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Accident(Base):
    __tablename__ = "accidents"

    id = Column(Integer, primary_key=True, index=True)
    event_date = Column(String(20), nullable=True, index=True)
    event_time = Column(String(20), nullable=True)
    district = Column(String(100), nullable=False, index=True)
    upazila = Column(String(100), nullable=True, index=True)
    road_name = Column(String(200), nullable=True)
    accident_type = Column(String(100), nullable=True)
    vehicles_involved = Column(String(200), nullable=True)
    fatalities = Column(Integer, default=0)
    injuries = Column(Integer, default=0)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    source_url = Column(String(500), nullable=True)
    source_name = Column(String(100), nullable=True)
    verification_status = Column(String(50), default="unverified")

    title = Column(String(500), nullable=True)
    cause_of_accident = Column(String(500), nullable=True)
    weather_condition = Column(String(100), nullable=True)

    light_condition = Column(String(50), nullable=True)
    road_surface = Column(String(100), nullable=True)
    road_surface_condition = Column(String(100), nullable=True)
    road_class = Column(String(50), nullable=True)
    place_type = Column(String(50), nullable=True)
    junction = Column(String(100), nullable=True)
    traffic_control = Column(String(50), nullable=True)
    severity_score = Column(Integer, nullable=True)
    vehicle_count = Column(Integer, nullable=True)
    coord_is_placeholder = Column(Integer, default=0)
    location_text = Column(String(300), nullable=True)
    data_source = Column(String(30), default="news")

    # Precomputed for reliable analytics (avoid date-format bugs)
    event_year = Column(Integer, nullable=True, index=True)
    event_month = Column(Integer, nullable=True, index=True)
    event_hour = Column(Integer, nullable=True, index=True)


class SavedLocation(Base):
    __tablename__ = "saved_locations"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    label = Column(String(100), nullable=False)
    district = Column(String(100), nullable=False)
    upazila = Column(String(100), nullable=True)
    note = Column(String(200), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class AlertRule(Base):
    __tablename__ = "alert_rules"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    location_id = Column(Integer, nullable=False, index=True)
    threshold = Column(Integer, default=50)
    time_window = Column(String(20), default="any")
    cooldown_hours = Column(Integer, default=6)
    daily_cap = Column(Integer, default=3)
    enabled = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)


class AlertHistory(Base):
    __tablename__ = "alert_history"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    rule_id = Column(Integer, nullable=False)
    location_id = Column(Integer, nullable=False)
    risk_score = Column(Integer, nullable=False)
    message = Column(String(500), nullable=False)
    is_read = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)