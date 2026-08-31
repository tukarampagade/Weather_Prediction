"""
preprocess.py
-------------
Loads weather.csv, cleans it, encodes the target, standardizes the
feature matrix, and produces a stratified 80/20 train-test split.

Run directly (`python preprocess.py`) to see a full console report of
the dataset (head, shape, columns, info, null counts, split sizes).
"""

import os
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
import joblib

# ----------------------------------------------------------------------
# CONFIG BLOCK — change TARGET to switch which column the model predicts
# ----------------------------------------------------------------------
TARGET = "RainTomorrow"          # Options: "RainTomorrow" or "RainToday"

# Columns that are identifiers / non-predictive and must always be dropped
NON_PREDICTIVE_COLUMNS = ["Date", "Location"]

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
DATA_PATH = os.path.join(BASE_DIR, "weather.csv")
SCALER_PATH = os.path.join(BASE_DIR, "models", "scaler.pkl")


def load_data(path=DATA_PATH):
    df = pd.read_csv(path)
    return df


def clean_data(df):
    """Handles missing values: mean for numerical columns, mode for categorical."""
    df = df.copy()

    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    categorical_cols = df.select_dtypes(exclude=[np.number]).columns.tolist()

    for col in numeric_cols:
        if df[col].isnull().sum() > 0:
            df[col] = df[col].fillna(df[col].mean())

    for col in categorical_cols:
        if df[col].isnull().sum() > 0:
            mode_val = df[col].mode(dropna=True)
            fill_val = mode_val.iloc[0] if not mode_val.empty else "Unknown"
            df[col] = df[col].fillna(fill_val)

    return df


def encode_targets(df):
    """Encodes Yes/No target-like columns to 1/0."""
    df = df.copy()
    for col in ["RainToday", "RainTomorrow"]:
        if col in df.columns:
            df[col] = df[col].map({"Yes": 1, "No": 0}).astype(int)
    return df


def build_feature_matrix(df, target=TARGET):
    """
    Drops non-predictive/identifier columns and the target itself
    (as well as the *other* rain column, to avoid leakage when the
    target is RainToday), one-hot encodes remaining categoricals,
    and returns (X_df, y_series, feature_names).
    """
    df = df.copy()

    drop_cols = [c for c in NON_PREDICTIVE_COLUMNS if c in df.columns]

    # Avoid leakage: if predicting RainTomorrow, RainToday is still a
    # legitimate predictive feature (it already is Yes/No -> 0/1 encoded).
    # If predicting RainToday, drop RainTomorrow to prevent leakage/future info.
    other_target = "RainTomorrow" if target == "RainToday" else None
    if other_target and other_target in df.columns:
        drop_cols.append(other_target)

    drop_cols.append(target)
    drop_cols = list(set(drop_cols))

    y = df[target].astype(int)
    X_df = df.drop(columns=drop_cols)

    # One-hot encode any remaining categorical columns (e.g. WindDir)
    categorical_cols = X_df.select_dtypes(exclude=[np.number]).columns.tolist()
    if categorical_cols:
        X_df = pd.get_dummies(X_df, columns=categorical_cols, drop_first=True)

    # Ensure everything is numeric float
    X_df = X_df.astype(float)

    feature_names = X_df.columns.tolist()
    return X_df, y, feature_names


def preprocess_pipeline(path=DATA_PATH, target=TARGET, test_size=0.2, random_state=42, verbose=True):
    """
    Full pipeline: load -> clean -> encode -> feature build -> scale -> split.

    Returns
    -------
    X_train, X_test, y_train, y_test : np.ndarray
    scaler : fitted StandardScaler
    feature_names : list[str]
    """
    df_raw = load_data(path)

    if verbose:
        print("=" * 70)
        print("RAW DATASET PREVIEW")
        print("=" * 70)
        print(df_raw.head())
        print(f"\nShape: {df_raw.shape}")
        print(f"\nColumns: {list(df_raw.columns)}")
        print("\nInfo:")
        df_raw.info()
        print("\nNull value counts per column:")
        print(df_raw.isnull().sum())

    df_clean = clean_data(df_raw)
    df_encoded = encode_targets(df_clean)

    X_df, y, feature_names = build_feature_matrix(df_encoded, target=target)

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X_df.values)

    os.makedirs(os.path.dirname(SCALER_PATH), exist_ok=True)
    joblib.dump({"scaler": scaler, "feature_names": feature_names, "target": target}, SCALER_PATH)

    X_train, X_test, y_train, y_test = train_test_split(
        X_scaled, y.values, test_size=test_size, random_state=random_state, stratify=y.values
    )

    if verbose:
        print("\n" + "=" * 70)
        print("PREPROCESSING SUMMARY")
        print("=" * 70)
        print(f"Target column          : {target}")
        print(f"Feature columns ({len(feature_names)})  : {feature_names}")
        print(f"Total samples           : {X_scaled.shape[0]}")
        print(f"Training samples         : {X_train.shape[0]}")
        print(f"Testing samples          : {X_test.shape[0]}")
        print(f"Class balance (train)    : {np.bincount(y_train.astype(int))}")
        print(f"Class balance (test)     : {np.bincount(y_test.astype(int))}")
        print(f"Scaler saved to           : {SCALER_PATH}")

    return X_train, X_test, y_train, y_test, scaler, feature_names


if __name__ == "__main__":
    preprocess_pipeline(verbose=True)
