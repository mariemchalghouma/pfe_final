import pandas as pd
import joblib

# 1. Charger le modèle et la liste des features que nous avons sauvegardés
print("Chargement du modèle...")
model = joblib.load('modele_consommation.pkl')
features_cols = joblib.load('features.pkl')

# 2. Créer les données d'un seul "nouveau trajet" (comme ce que ferait l'application)
# J'ai ajouté les nouvelles features que vous avez mises (latitude, longitude, mois, heure_transaction)
nouveau_trajet = pd.DataFrame([{
    'kilometrage': 500,
    'type_camion': 'NPR',
    'objectif_camion': 16,
    'capacite': 189.6,
    'heure_depart': 5,
    'jour_semaine': 6,
    'conditions_meteo': 'ensoleillé',
    'weathercode_raw': 0,
    'type_trajet': 'route_secondaire',
    'latitude': 35.722348,
    'longitude': 10.752565,
    'mois': 1,
    'heure_transaction': 4
}])

# S'assurer que les colonnes sont exactement dans le même ordre que lors de l'entraînement
nouveau_trajet = nouveau_trajet[features_cols]

# La quantité renvoyée par le capteur GPS du camion pour ce même trajet :
quantite_gps_declaree = 75.0 

# 3. Faire la prédiction avec le Modèle de Machine Learning
print("Calcul de l'estimation...")
# Le modèle prédit désormais des Litres/100km !
conso_predite_l100 = model.predict(nouveau_trajet)[0]

# On convertit cette prédiction L/100km en Litres totaux pour le trajet
kilometrage_trajet = nouveau_trajet['kilometrage'].iloc[0]
carburant_estime_total = (conso_predite_l100 * kilometrage_trajet) / 100

print("\n--- RÉSULTATS ---")
print(f"Consommation ESTIMÉE (L/100km) : {conso_predite_l100:.2f} L/100km")
print(f"Carburant théorique pour {kilometrage_trajet}km : {carburant_estime_total:.2f} Litres")
print(f"Consommation DÉCLARÉE par le GPS : {quantite_gps_declaree:.2f} Litres")

# 4. Appliquer la règle des 10%
marge_acceptable = 0.10
# J'ai utilisé np.maximum pour éviter la division par zéro comme dans votre script d'entraînement
import numpy as np
diff_pourcentage = abs(carburant_estime_total - quantite_gps_declaree) / np.maximum(carburant_estime_total, 0.0001)

print(f"Écart constaté : {diff_pourcentage * 100:.2f} %")

if diff_pourcentage <= marge_acceptable:
    print("-> STATUT : NORMAL (L'écart est dans la marge de 10%)")
else:
    print("-> STATUT : ANORMALE (Suspicion de vol, surcharge, fuite...)")
