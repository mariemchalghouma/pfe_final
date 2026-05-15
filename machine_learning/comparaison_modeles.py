# =============================================================
# comparaison_modeles.py
# Compare plusieurs modèles ML sur le même dataset que
# le fichier principal (data1.csv), sans le modifier.
# =============================================================

import pandas as pd
import numpy as np

from sklearn.model_selection import cross_val_score
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.linear_model import Ridge
from sklearn.svm import SVR
from sklearn.neighbors import KNeighborsRegressor
from sklearn.preprocessing import OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer

try:
    from xgboost import XGBRegressor
    XGBOOST_DISPONIBLE = True
except ImportError:
    XGBOOST_DISPONIBLE = False
    print("[AVERTISSEMENT] XGBoost non installé → pip install xgboost")

# ─────────────────────────────────────────────
# 1. CHARGEMENT
# ─────────────────────────────────────────────
df = pd.read_csv('data1.csv', sep=';')
print(f"[OK] Dataset chargé : {len(df)} lignes\n")

# ─────────────────────────────────────────────
# 2. NETTOYAGE
# ─────────────────────────────────────────────
# date_trans conservée uniquement pour d'éventuels besoins d'audit, pas comme feature
df['date_trans'] = pd.to_datetime(df['date_trans'], errors='coerce')

numeric_convert_cols = [
    'kilometrage', 'objectif_camion', 'capacite',
    'heure_depart', 'jour_semaine', 'latitude', 'longitude',
    'weathercode_raw', 'quantite_station', 'quantite_gps'
]
for col in numeric_convert_cols:
    df[col] = pd.to_numeric(df[col], errors='coerce')

df = df.dropna(subset=['quantite_station', 'quantite_gps', 'kilometrage',
                        'capacite', 'objectif_camion', 'type_camion'])
df = df.drop_duplicates()
df = df[df['type_trajet'] != 'inconnu']

df['consommation_l_100km'] = (df['quantite_station'] / df['kilometrage']) * 100
df = df[(df['consommation_l_100km'] >= 5) & (df['consommation_l_100km'] <= 60)]
df = df[df['kilometrage'] > 0]
df = df[df['capacite'] > 0]

print(f"[OK] Dataset propre : {len(df)} lignes")

# ─────────────────────────────────────────────
# 3. FILTRAGE CAS NORMAUX UNIQUEMENT
# ─────────────────────────────────────────────
MARGE_STATION = 0.07
df['ecart_pct'] = abs(df['quantite_gps'] - df['quantite_station']) / df['quantite_station']
df_normal = df[df['ecart_pct'] <= MARGE_STATION].copy()

print(f"Cas normaux pour entraînement : {len(df_normal)} lignes\n")

# ─────────────────────────────────────────────
# 4. DATA AUGMENTATION ×4
# ─────────────────────────────────────────────
np.random.seed(42)
synthetic_rows = []

for _, row in df_normal.iterrows():
    for _ in range(4):
        new_row = row.copy()
        variation_km = np.random.uniform(0.90, 1.10)
        new_row['kilometrage'] = max(50, int(row['kilometrage'] * variation_km))
        conso_var = np.random.uniform(0.95, 1.05)
        new_row['quantite_station'] = round(
            (row['consommation_l_100km'] * conso_var * new_row['kilometrage']) / 100, 2
        )
        new_row['quantite_gps'] = round(
            new_row['quantite_station'] * np.random.uniform(0.93, 1.07), 2
        )
        new_row['heure_depart'] = int(min(23, max(0, int(row['heure_depart']) + np.random.randint(-1, 2))))
        new_row['jour_semaine'] = np.random.randint(0, 7)
        new_row['consommation_l_100km'] = new_row['quantite_station'] / new_row['kilometrage'] * 100
        new_row['ecart_pct'] = abs(new_row['quantite_gps'] - new_row['quantite_station']) / new_row['quantite_station']
        synthetic_rows.append(new_row)

df_augmented = pd.concat([df_normal, pd.DataFrame(synthetic_rows)], ignore_index=True)
print(f"Total augmenté : {len(df_augmented)} lignes\n")

# ─────────────────────────────────────────────
# 5. FEATURES ET TARGET
# NOTE : aucune feature dérivée de date_trans
# ─────────────────────────────────────────────
features_cols = [
    'kilometrage', 'type_camion', 'objectif_camion', 'capacite',
    'heure_depart', 'jour_semaine', 'conditions_meteo', 'weathercode_raw',
    'type_trajet', 'latitude', 'longitude'
]
target_col = 'consommation_l_100km'

X_original  = df_normal[features_cols]
y_original  = df_normal[target_col]

# ─────────────────────────────────────────────
# 6. PREPROCESSOR
# ─────────────────────────────────────────────
numeric_features = [
    'kilometrage', 'objectif_camion', 'capacite',
    'heure_depart', 'jour_semaine', 'weathercode_raw',
    'latitude', 'longitude'
]
categorical_features = ['type_camion', 'conditions_meteo', 'type_trajet']

preprocessor = ColumnTransformer(transformers=[
    ('num', Pipeline(steps=[('imputer', SimpleImputer(strategy='median'))]), numeric_features),
    ('cat', Pipeline(steps=[
        ('imputer', SimpleImputer(strategy='most_frequent')),
        ('onehot', OneHotEncoder(handle_unknown='ignore'))
    ]), categorical_features)
])

# ─────────────────────────────────────────────
# 7. DÉFINITION DES MODÈLES À COMPARER
# ─────────────────────────────────────────────
modeles = {
    'Random Forest':     RandomForestRegressor(n_estimators=300, max_depth=15, random_state=42),
    'Gradient Boosting': GradientBoostingRegressor(n_estimators=200, max_depth=5, random_state=42),
    'Ridge Regression':  Ridge(alpha=1.0),
    'SVR':               SVR(kernel='rbf', C=10, epsilon=0.5),
    'KNN Regressor':     KNeighborsRegressor(n_neighbors=5),
}

if XGBOOST_DISPONIBLE:
    modeles['XGBoost'] = XGBRegressor(n_estimators=200, max_depth=5, random_state=42, verbosity=0)

# ─────────────────────────────────────────────
# 8. COMPARAISON — Cross-val sur données ORIGINALES
# ─────────────────────────────────────────────
print("=" * 60)
print("     COMPARAISON DES MODÈLES (cross-val 5 folds)")
print("     Évalué sur données ORIGINALES uniquement")
print("=" * 60)

resultats = []

for nom, regressor in modeles.items():
    pipeline = Pipeline(steps=[
        ('preprocessor', preprocessor),
        ('regressor',    regressor)
    ])

    scores_mae = cross_val_score(pipeline, X_original, y_original,
                                 cv=5, scoring='neg_mean_absolute_error')
    scores_r2  = cross_val_score(pipeline, X_original, y_original,
                                 cv=5, scoring='r2')

    mae_moy = abs(scores_mae.mean())
    mae_std = scores_mae.std()
    r2_moy  = scores_r2.mean()

    resultats.append({
        'Modèle':             nom,
        'MAE moy (L/100km)': round(mae_moy, 3),
        'MAE std':            round(mae_std, 3),
        'R² moyen':           round(r2_moy,  3),
    })

    print(f"  {nom:<22}  MAE: {mae_moy:.3f} ± {mae_std:.3f}   R²: {r2_moy:.3f}")

# ─────────────────────────────────────────────
# 9. CLASSEMENT FINAL
# ─────────────────────────────────────────────
df_resultats = pd.DataFrame(resultats).sort_values('MAE moy (L/100km)')

print("\n" + "=" * 60)
print("     CLASSEMENT FINAL (trié par MAE croissante)")
print("=" * 60)
print(df_resultats.to_string(index=False))

meilleur     = df_resultats.iloc[0]['Modèle']
meilleur_mae = df_resultats.iloc[0]['MAE moy (L/100km)']
meilleur_r2  = df_resultats.iloc[0]['R² moyen']

print(f"\n✅ Meilleur modèle : {meilleur}")
print(f"   MAE : {meilleur_mae} L/100km")
print(f"   R²  : {meilleur_r2}")
# ─────────────────────────────────────────────
# 10. SAUVEGARDE DES RÉSULTATS
# ─────────────────────────────────────────────
df_resultats.to_csv('comparaison_modeles.csv', sep=';', index=False, encoding='utf-8-sig')
print("\n[OK] Résultats sauvegardés dans : comparaison_modeles.csv")