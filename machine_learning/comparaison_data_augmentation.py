import pandas as pd
import numpy as np
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.preprocessing import OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer

df = pd.read_csv('data1.csv', sep=';')

# Nettoyage identique à votre script principal
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

df['ecart_pct'] = abs(df['quantite_gps'] - df['quantite_station']) / df['quantite_station']
df_normal = df[df['ecart_pct'] <= 0.07].copy()

features_cols = [
    'kilometrage', 'type_camion', 'objectif_camion', 'capacite',
    'heure_depart', 'jour_semaine', 'conditions_meteo', 'weathercode_raw',
    'type_trajet', 'latitude', 'longitude'
]
target_col = 'consommation_l_100km'

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
        n_estimators=200, max_depth=5, learning_rate=0.1, random_state=42
    ))
])

# ── AVANT augmentation ──
print("=" * 50)
print("AVANT DATA AUGMENTATION")
print(f"Nombre de lignes : {len(df_normal)}")
scores_avant = cross_val_score(model, df_normal[features_cols],
                                df_normal[target_col],
                                cv=5, scoring='neg_mean_absolute_error')
r2_avant = cross_val_score(model, df_normal[features_cols],
                            df_normal[target_col], cv=5, scoring='r2')
print(f"MAE  : {abs(scores_avant.mean()):.3f} ± {scores_avant.std():.3f}")
print(f"R²   : {r2_avant.mean():.3f}")

# ── Data augmentation ──
np.random.seed(42)
synthetic_rows = []
for _, row in df_normal.iterrows():
    for _ in range(4):
        new_row = row.copy()
        variation_km = np.random.uniform(0.90, 1.10)
        new_row['kilometrage'] = max(50, int(row['kilometrage'] * variation_km))
        conso_var = np.random.uniform(0.95, 1.05)
        new_row['quantite_station'] = round(
            (row['consommation_l_100km'] * conso_var * new_row['kilometrage']) / 100, 2)
        new_row['quantite_gps'] = round(
            new_row['quantite_station'] * np.random.uniform(0.93, 1.07), 2)
        new_row['heure_depart'] = int(min(23, max(0, int(row['heure_depart']) + np.random.randint(-1, 2))))
        new_row['jour_semaine'] = np.random.randint(0, 7)
        new_row['consommation_l_100km'] = new_row['quantite_station'] / new_row['kilometrage'] * 100
        new_row['ecart_pct'] = abs(new_row['quantite_gps'] - new_row['quantite_station']) / new_row['quantite_station']
        synthetic_rows.append(new_row)

df_augmented = pd.concat([df_normal, pd.DataFrame(synthetic_rows)], ignore_index=True)

# ── APRÈS augmentation ──
print("=" * 50)
print("APRÈS DATA AUGMENTATION")
print(f"Nombre de lignes : {len(df_augmented)}")

X_train, X_test, y_train, y_test = train_test_split(
    df_augmented[features_cols], df_augmented[target_col],
    test_size=0.2, random_state=42
)
model.fit(X_train, y_train)
y_pred = model.predict(X_test)

mae_apres  = mean_absolute_error(y_test, y_pred)
rmse_apres = np.sqrt(mean_squared_error(y_test, y_pred))
r2_apres   = r2_score(y_test, y_pred)

scores_apres = cross_val_score(model, df_normal[features_cols],
                                df_normal[target_col],
                                cv=5, scoring='neg_mean_absolute_error')
r2_apres_cv = cross_val_score(model, df_normal[features_cols],
                               df_normal[target_col], cv=5, scoring='r2')

print(f"MAE  (test set)      : {mae_apres:.3f}")
print(f"RMSE (test set)      : {rmse_apres:.3f}")
print(f"R²   (test set)      : {r2_apres:.3f}")
print(f"MAE  (cross-val ori) : {abs(scores_apres.mean()):.3f} ± {scores_apres.std():.3f}")
print(f"R²   (cross-val ori) : {r2_apres_cv.mean():.3f}")
print("=" * 50)