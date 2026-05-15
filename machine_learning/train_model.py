import pandas as pd
import numpy as np
import joblib

from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.preprocessing import OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer

# 1. CHARGEMENT
df = pd.read_csv('data1.csv', sep=';')
print(f"[OK] Dataset chargé : {len(df)} lignes")

# 2. NETTOYAGE
# 2.1 Conversion date (uniquement pour la sauvegarde finale, pas utilisée comme feature)
df['date_trans'] = pd.to_datetime(df['date_trans'], errors='coerce')

# 2.2 Conversion numérique
numeric_convert_cols = [
    'kilometrage', 'objectif_camion', 'capacite',
    'heure_depart', 'jour_semaine', 'latitude', 'longitude',
    'weathercode_raw', 'quantite_station', 'quantite_gps'
]
for col in numeric_convert_cols:
    df[col] = pd.to_numeric(df[col], errors='coerce')

avant = len(df)
df = df.dropna(subset=['quantite_station', 'quantite_gps', 'kilometrage',
                        'capacite', 'objectif_camion', 'type_camion'])
print(f"Après suppression valeurs nulles       : {len(df)} lignes (-{avant - len(df)})")

# 2.3 Supprimer doublons
avant = len(df)
df = df.drop_duplicates()
print(f"Après suppression doublons             : {len(df)} lignes (-{avant - len(df)})")

# 2.4 Supprimer type_trajet inconnu
avant = len(df)
df = df[df['type_trajet'] != 'inconnu']
print(f"Après suppression type_trajet inconnu  : {len(df)} lignes (-{avant - len(df)})")

# 2.5 Calcul consommation + suppression aberrante
df['consommation_l_100km'] = (df['quantite_station'] / df['kilometrage']) * 100
avant = len(df)
df = df[(df['consommation_l_100km'] >= 5) & (df['consommation_l_100km'] <= 60)]
print(f"Après suppression conso aberrante      : {len(df)} lignes (-{avant - len(df)})")

# 2.6 Supprimer kilometrage = 0
avant = len(df)
df = df[df['kilometrage'] > 0]
print(f"Après suppression kilometrage = 0      : {len(df)} lignes (-{avant - len(df)})")

# 2.7 Supprimer capacite = 0
avant = len(df)
df = df[df['capacite'] > 0]
print(f"Après suppression capacite = 0         : {len(df)} lignes (-{avant - len(df)})")

print(f"\n[OK] Dataset propre : {len(df)} lignes")

# 3. FILTRAGE CAS NORMAUX POUR ENTRAÎNEMENT
df['ecart_pct'] = abs(df['quantite_gps'] - df['quantite_station']) / df['quantite_station']

MARGE_STATION = 0.07
df_normal = df[df['ecart_pct'] <= MARGE_STATION].copy()

print(f"\nCas normaux  (entraînement) : {len(df_normal)} lignes")
print(f"Cas suspects (test final)   : {len(df) - len(df_normal)} lignes")

# 4. DATA AUGMENTATION (×4 sur cas normaux)
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

df_synthetic = pd.DataFrame(synthetic_rows)
df_augmented = pd.concat([df_normal, df_synthetic], ignore_index=True)

print(f"\nOriginal normaux     : {len(df_normal)}")
print(f"Synthétiques (×4)    : {len(df_synthetic)}")
print(f"Total augmenté       : {len(df_augmented)}")

# 5. FEATURES ET TARGET
features_cols = [
    'kilometrage',
    'type_camion',
    'objectif_camion',
    'capacite',
    'heure_depart',
    'jour_semaine',
    'conditions_meteo',
    'weathercode_raw',
    'type_trajet',
    'latitude',
    'longitude'
]

target_col = 'consommation_l_100km'

X = df_augmented[features_cols]
y = df_augmented[target_col]

# 6. PIPELINE
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

model = Pipeline(steps=[
    ('preprocessor', preprocessor),
    ('regressor', GradientBoostingRegressor(
        n_estimators=200,
        max_depth=5,
        learning_rate=0.1,
        random_state=42
    ))
])

# 7. ENTRAÎNEMENT
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

print(f"\nEntraînement : {len(X_train)} lignes")
print(f"Test         : {len(X_test)} lignes")
print("Entraînement du modèle...")

model.fit(X_train, y_train)

# 8. ÉVALUATION
y_pred = model.predict(X_test)

mae  = mean_absolute_error(y_test, y_pred)
rmse = np.sqrt(mean_squared_error(y_test, y_pred))
r2   = r2_score(y_test, y_pred)

print(f"\n[INFO] Résultats entraînement :")
print(f"  MAE        : {mae:.2f} L/100km")
print(f"  RMSE       : {rmse:.2f} L/100km")
print(f"  R² Score   : {r2:.3f}")

scores = cross_val_score(model, df_normal[features_cols], df_normal[target_col],
                         cv=5, scoring='neg_mean_absolute_error')
print(f"  Cross-val MAE (données originales) : {abs(scores.mean()):.2f} ± {scores.std():.2f}")

# 9. IMPORTANCE DES FEATURES
importance_df = pd.DataFrame({
    'feature':    model.named_steps['preprocessor'].get_feature_names_out(),
    'importance': model.named_steps['regressor'].feature_importances_
}).sort_values(by='importance', ascending=False)

print(f"\n[INFO] Top 10 features importantes :")
print(importance_df.head(10).to_string(index=False))

# 10. DÉTECTION ANOMALIES SUR TOUT LE DATASET
print("\n--- Détection anomalies sur tout le dataset ---")

MARGE_MODELE_PCT   = 0.07  # 7% pour anomalie_conso
MARGE_POMPE_LITRES = 7     # 7 litres pour fraude_station

df['conso_predite_l100'] = model.predict(df[features_cols])
df['carburant_estime']   = (df['conso_predite_l100'] * df['kilometrage']) / 100
df['ecart_estime_gps']   = df['quantite_gps'] - df['carburant_estime']
df['ecart_estime_pct']   = abs(df['ecart_estime_gps']) / np.maximum(df['carburant_estime'], 0.0001)
df['ecart_pompe_litres'] = abs(df['quantite_station'] - df['quantite_gps'])

# ---------------------------------------------------------
# EXPLICATION DES STATUTS D'ANOMALIE
# ---------------------------------------------------------
# 1. fraude_station   : écart Station vs GPS > 7L
#    → Vol à la pompe (jerrycan) ou erreur de saisie
#
# 2. anomalie_conso   : écart GPS vs Modèle ML > 7%
#    → conduite agressive, problème mécanique
#
# 3. anomalie_critique : les deux en même temps
#    → Cas le plus grave, investigation prioritaire
#
# 4. normal : Station ≈ GPS ≈ Estimation Modèle
# ---------------------------------------------------------

anomalie_pompe  = df['ecart_pompe_litres'] > MARGE_POMPE_LITRES
anomalie_modele = df['ecart_estime_pct']   > MARGE_MODELE_PCT

df['statut'] = np.select(
    [anomalie_pompe & ~anomalie_modele,
     anomalie_modele & ~anomalie_pompe,
     anomalie_pompe & anomalie_modele],
    ['fraude_station', 'anomalie_conso', 'anomalie_critique'],
    default='normal'
)

print(f"\n[INFO] Résultats anomalies détaillés :")
print(df['statut'].value_counts())

print(f"\n[INFO] Exemples :")
print(df[[
    'matricule_camion', 'quantite_station', 'quantite_gps', 'carburant_estime',
    'ecart_pompe_litres', 'ecart_estime_pct', 'statut'
]].head(15).round(2).to_string(index=False))

# 11. SAUVEGARDE
resultats = df[[
    'matricule_camion', 'date_trans', 'type_camion', 'kilometrage',
    'quantite_station', 'quantite_gps', 'carburant_estime',
    'ecart_pompe_litres', 'ecart_estime_gps', 'ecart_estime_pct', 'statut'
]].copy()

resultats['ecart_estime_pct']   = (resultats['ecart_estime_pct'] * 100).round(2)
resultats['ecart_pompe_litres'] = resultats['ecart_pompe_litres'].round(2)
resultats['carburant_estime']   = resultats['carburant_estime'].round(2)
resultats['ecart_estime_gps']   = resultats['ecart_estime_gps'].round(2)

resultats.to_csv('resultats_anomalies.csv', sep=';', index=False, encoding='utf-8-sig')

joblib.dump(model,         'modele_consommation.pkl')
joblib.dump(features_cols, 'features.pkl')

print("\n[OK] Fichiers sauvegardés :")
print("  - resultats_anomalies.csv")
print("  - modele_consommation.pkl")
print("  - features.pkl")

print("Modèle sauvegardé avec succès")