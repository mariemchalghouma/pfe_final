BEGIN;

-- Backup existing tables if present (renamed)
ALTER TABLE IF EXISTS detections_non_conformes RENAME TO detections_non_conformes_bak;
ALTER TABLE IF EXISTS historique_appels RENAME TO historique_appels_bak;

CREATE TABLE IF NOT EXISTS historique_appels (
    id              SERIAL PRIMARY KEY,
    source_table    VARCHAR(60),
    source_id       TEXT,
    source_table_2  VARCHAR(60),
    source_id_2     TEXT,
    type_nc         VARCHAR(30),
    statut          VARCHAR(20) DEFAULT 'nouveau',
    ts_detection    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    duree_nc_min    FLOAT,
    camion_id       VARCHAR(100),
    nom_chauffeur   VARCHAR(150),
    numero_tel      VARCHAR(20),
    session_id      VARCHAR(50) UNIQUE,
    etat_appel      VARCHAR(20),
    mode_appel      VARCHAR(20) DEFAULT 'outgoing',
    duree_s         FLOAT DEFAULT 0,
    duree_attente_s FLOAT DEFAULT 0,
    t_debut         VARCHAR(20),
    t_decroche      VARCHAR(20),
    t_fin           VARCHAR(20),
    date_appel      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(source_table, source_id)
);

CREATE INDEX IF NOT EXISTS idx_historique_source ON historique_appels(source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_historique_source_2 ON historique_appels(source_table_2, source_id_2);
CREATE INDEX IF NOT EXISTS idx_historique_session ON historique_appels(session_id);

COMMIT;
