import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns

df = pd.read_csv('data1.csv', sep=';')

# Conversion numérique
numeric_cols = [
    'kilometrage', 'objectif_camion', 'capacite',
    'heure_depart', 'jour_semaine', 'weathercode_raw',
    'latitude', 'longitude', 'quantite_station', 'quantite_gps'
]
for col in numeric_cols:
    df[col] = pd.to_numeric(df[col], errors='coerce')

df['consommation_l_100km'] = (df['quantite_station'] / df['kilometrage']) * 100
df = df[(df['consommation_l_100km'] >= 5) & (df['consommation_l_100km'] <= 60)]
df = df[df['kilometrage'] > 0]

# Matrice de corrélation
corr_cols = [
    'kilometrage', 'objectif_camion', 'capacite',
    'heure_depart', 'jour_semaine', 'weathercode_raw',
    'latitude', 'longitude', 'consommation_l_100km'
]

corr_matrix = df[corr_cols].corr()

plt.figure(figsize=(10, 8))
sns.heatmap(
    corr_matrix,
    annot=True,
    fmt='.2f',
    cmap='coolwarm',
    center=0,
    square=True,
    linewidths=0.5
)
plt.title('Matrice de corrélation des variables numériques', fontsize=14)
plt.tight_layout()
plt.savefig('matrice_correlation.png', dpi=150)
plt.show()
print("Corrélations avec consommation_l_100km :")
print(corr_matrix['consommation_l_100km'].sort_values(ascending=False))