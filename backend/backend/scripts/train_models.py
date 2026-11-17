"""
Train ML models.
- FR-14: KMeans clustering of districts
- FR-15: Random Forest severity regression
- FR-16: Feature importance extraction
"""
import sys
import json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.cluster import KMeans
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, r2_score

from database import SessionLocal, engine
import models

MODEL_DIR = Path(__file__).parent.parent / "ml_models"
MODEL_DIR.mkdir(exist_ok=True)

FEATURE_LABELS = {
    "month": "Month of year",
    "district": "District location",
    "hour_bucket": "Time of day",
    "primary_vehicle": "Vehicle type",
    "accident_type": "Accident type",
}


def extract_month(date_str):
    if not date_str or pd.isna(date_str):
        return 0
    try:
        return int(str(date_str)[5:7])
    except Exception:
        return 0


def extract_hour_bucket(time_str):
    if not time_str or pd.isna(time_str):
        return "unknown"
    try:
        h = int(str(time_str).split(":")[0])
        if 5 <= h < 12:
            return "morning"
        if 12 <= h < 17:
            return "afternoon"
        if 17 <= h < 21:
            return "evening"
        return "night"
    except Exception:
        return "unknown"


def primary_vehicle(v):
    if not v or pd.isna(v):
        return "unknown"
    first = str(v).lower().split(",")[0].strip()
    return first or "unknown"


def main():
    models.Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    accidents = db.query(models.Accident).all()
    db.close()

    if not accidents:
        print("ERROR: No accidents in DB. Run scripts/load_data.py first.")
        return

    rows = []
    for a in accidents:
        severity = (a.fatalities or 0) * 3 + (a.injuries or 0)
        rows.append({
            "district": a.district,
            "month": extract_month(a.event_date),
            "hour_bucket": extract_hour_bucket(a.event_time),
            "primary_vehicle": primary_vehicle(a.vehicles_involved),
            "accident_type": (a.accident_type or "unknown").lower().strip() or "unknown",
            "fatalities": a.fatalities or 0,
            "injuries": a.injuries or 0,
            "severity": severity,
        })

    df = pd.DataFrame(rows)
    print(f"Loaded {len(df)} accidents")

    # ===== FR-15 + FR-16: Random Forest =====
    encoders = {}
    for col in ["district", "hour_bucket", "primary_vehicle", "accident_type"]:
        le = LabelEncoder()
        df[f"{col}_enc"] = le.fit_transform(df[col].astype(str))
        encoders[col] = le

    feature_cols = ["month", "district_enc", "hour_bucket_enc",
                    "primary_vehicle_enc", "accident_type_enc"]
    X = df[feature_cols]
    y = df["severity"]

    if len(X) >= 20:
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42
        )
    else:
        X_train, X_test, y_train, y_test = X, X, y, y

    model = RandomForestRegressor(
        n_estimators=100, max_depth=10, min_samples_leaf=2,
        random_state=42, n_jobs=-1,
    )
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    mae = float(mean_absolute_error(y_test, y_pred))
    r2 = float(r2_score(y_test, y_pred)) if len(y_test) > 1 else 0.0
    print(f"Model trained - MAE: {mae:.3f}, R2: {r2:.3f}")

    joblib.dump(model, MODEL_DIR / "risk_model.joblib")
    joblib.dump(encoders, MODEL_DIR / "encoders.joblib")

    feature_display = ["month", "district", "hour_bucket", "primary_vehicle", "accident_type"]
    importances = model.feature_importances_
    sorted_idx = np.argsort(importances)[::-1]
    top_features = [
        {
            "feature": feature_display[i],
            "label": FEATURE_LABELS[feature_display[i]],
            "importance": round(float(importances[i]), 3),
        }
        for i in sorted_idx[:3]
    ]
    print("Top 3 features:")
    for f in top_features:
        print(f"  {f['label']}: {f['importance']}")

    metrics = {
        "mae": round(mae, 3),
        "r2": round(r2, 3),
        "trained_on": int(len(X)),
        "top_features": top_features,
        "model_type": "RandomForestRegressor",
        "version": "v1",
    }
    with open(MODEL_DIR / "metrics.json", "w") as f:
        json.dump(metrics, f, indent=2)

    # ===== FR-14: KMeans district clustering =====
    agg = df.groupby("district").agg(
        total=("severity", "count"),
        fatalities=("fatalities", "sum"),
        injuries=("injuries", "sum"),
        severity_sum=("severity", "sum"),
    ).reset_index()

    clusters_data = []
    if len(agg) >= 4:
        agg["severity_per_acc"] = agg["severity_sum"] / agg["total"].clip(lower=1)
        cluster_features = np.log1p(agg[["total", "fatalities", "severity_per_acc"]])
        scaler = StandardScaler()
        X_cluster = scaler.fit_transform(cluster_features)

        k = min(4, len(agg))
        kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
        agg["cluster"] = kmeans.fit_predict(X_cluster)

        cluster_severity = agg.groupby("cluster")["severity_sum"].mean().sort_values()
        labels = ["Low", "Medium", "High", "Critical"]
        label_map = {c: labels[i] for i, c in enumerate(cluster_severity.index)}
        agg["risk_label"] = agg["cluster"].map(label_map)

        for _, row in agg.iterrows():
            clusters_data.append({
                "district": row["district"],
                "cluster_label": row["risk_label"],
                "total": int(row["total"]),
                "fatalities": int(row["fatalities"]),
                "injuries": int(row["injuries"]),
                "severity_sum": int(row["severity_sum"]),
            })

        print(f"\nKMeans clusters (k={k}):")
        for c in cluster_severity.index:
            n = len(agg[agg["cluster"] == c])
            print(f"  {label_map[c]}: {n} districts, avg severity {cluster_severity[c]:.1f}")
    else:
        print(f"WARNING: only {len(agg)} districts, need 4+ for KMeans")

    with open(MODEL_DIR / "clusters.json", "w") as f:
        json.dump({"districts": clusters_data}, f, indent=2)

    print(f"\nModels saved to: {MODEL_DIR}")


if __name__ == "__main__":
    main()