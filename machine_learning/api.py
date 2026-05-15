from fastapi import FastAPI
from pydantic import BaseModel
from typing import List
import pandas as pd
import joblib
import numpy as np

# Initialiser l'application
app = FastAPI(title="API Détection Anomalies Carburant")

# Charger le modèle et les features en mémoire au démarrage
model = joblib.load('modele_consommation.pkl')
features_cols = joblib.load('features.pkl')

# Seuils alignés sur train_model.py
MARGE_MODELE_PCT = 0.07
MARGE_POMPE_LITRES = 7


def detect_statut_anomalie(quantite_station: float, quantite_gps: float, carburant_estime_total: float):
    """
    Reproduit la même logique que train_model.py :
    - fraude_station      : |station - gps| > 7 litres
    - anomalie_conso      : |gps - estime| / estime > 7%
    - anomalie_critique   : les deux en même temps
    - normal              : aucun des deux
    """
    denominateur = np.maximum(carburant_estime_total, 0.0001)
    ecart_estime_gps = quantite_gps - carburant_estime_total
    ecart_estime_pct = abs(ecart_estime_gps) / denominateur
    ecart_pompe_litres = abs(quantite_station - quantite_gps)

    anomalie_pompe = ecart_pompe_litres > MARGE_POMPE_LITRES
    anomalie_modele = ecart_estime_pct > MARGE_MODELE_PCT

    if anomalie_pompe and anomalie_modele:
        statut = "anomalie_critique"
    elif anomalie_pompe:
        statut = "fraude_station"
    elif anomalie_modele:
        statut = "anomalie_conso"
    else:
        statut = "normal"

    return statut, ecart_pompe_litres, ecart_estime_gps, ecart_estime_pct

# Définir le format des données que l'application va envoyer (Format JSON)
class TrajetData(BaseModel):
    kilometrage: float
    type_camion: str
    objectif_camion: float
    capacite: float
    heure_depart: int
    jour_semaine: int
    conditions_meteo: str
    weathercode_raw: int
    type_trajet: str
    latitude: float
    longitude: float
    mois: int
    heure_transaction: int
    quantite_station: float # Ce qui a été déclaré/payé
    quantite_gps: float     # Ce qui est réellement entré dans le réservoir

@app.get("/")
def read_root():
    return {"message": "L'API de Machine Learning est en ligne !"}

@app.post("/predict")
def predict_anomalie(data: TrajetData):
    # 1. Transformer le JSON reçu en DataFrame pandas
    df_input = pd.DataFrame([data.dict()])
    
    # Garder uniquement les colonnes nécessaires pour le modèle, dans le bon ordre
    X = df_input[features_cols]
    
    # 2. Prédiction de l'efficacité (L/100km)
    conso_predite_l100 = model.predict(X)[0]
    
    # 3. Calcul de la consommation théorique totale
    carburant_estime_total = (conso_predite_l100 * data.kilometrage) / 100
    
    # 4. Logique de détection d'anomalie (alignée sur train_model.py)
    statut, ecart_pompe_litres, ecart_estime_gps, ecart_estime_pct = detect_statut_anomalie(
        quantite_station=data.quantite_station,
        quantite_gps=data.quantite_gps,
        carburant_estime_total=carburant_estime_total,
    )

    # Clé conservée pour compatibilité front existant
    ecart_station_gps_pct = abs(data.quantite_gps - data.quantite_station) / np.maximum(data.quantite_station, 0.0001)
        
    # 5. Renvoyer la réponse à votre application
    return {
        "statut": statut,
        "details": {
            "consommation_estimee_L100km": round(conso_predite_l100, 2),
            "carburant_theorique_total_L": round(carburant_estime_total, 2),
            "quantite_station_declaree_L": round(data.quantite_station, 2),
            "quantite_gps_detectee_L": round(data.quantite_gps, 2),
            "ecart_pompe_litres": round(ecart_pompe_litres, 2),
            "ecart_estime_gps_litres": round(ecart_estime_gps, 2),
            "ecart_station_gps_pct": round(ecart_station_gps_pct * 100, 2),
            "ecart_modele_gps_pct": round(ecart_estime_pct * 100, 2)
        }
    }

@app.post("/predict_batch")
def predict_batch_anomalies(trajets: List[TrajetData]):
    """
    Analyse un tableau entier de trajets en une seule requête !
    Parfait pour la page 'Carburant' de votre application.
    """
    # 1. Convertir la liste de trajets JSON en DataFrame
    df_input = pd.DataFrame([t.dict() for t in trajets])
    
    # 2. Filtrer les colonnes dans le bon ordre
    X = df_input[features_cols]
    
    # 3. Prédire pour tout le tableau d'un coup (Très rapide !)
    conso_predites_l100 = model.predict(X)
    
    # 4. Calculs pour chaque ligne
    resultats = []
    
    for i in range(len(trajets)):
        data = trajets[i]
        conso_predite_l100 = conso_predites_l100[i]
        
        carburant_estime_total = (conso_predite_l100 * data.kilometrage) / 100

        statut, ecart_pompe_litres, ecart_estime_gps, ecart_estime_pct = detect_statut_anomalie(
            quantite_station=data.quantite_station,
            quantite_gps=data.quantite_gps,
            carburant_estime_total=carburant_estime_total,
        )

        # Clé conservée pour compatibilité front existant
        ecart_station_gps_pct = abs(data.quantite_gps - data.quantite_station) / np.maximum(data.quantite_station, 0.0001)
            
        resultats.append({
            "id_ligne": i,  # Pour repérer la ligne dans le tableau
            "statut": statut,
            "details": {
                "carburant_estime": round(carburant_estime_total, 2),
                "ecart_pompe_litres": round(ecart_pompe_litres, 2),
                "ecart_estime_gps_litres": round(ecart_estime_gps, 2),
                "ecart_station_pct": round(ecart_station_gps_pct * 100, 2),
                "ecart_modele_pct": round(ecart_estime_pct * 100, 2)
            }
        })
        
    return resultats
