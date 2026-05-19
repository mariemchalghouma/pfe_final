-- ══════════════════════════════════════════════════════════════
-- Migration : Supprimer duree_s, date_appel, rapport_ts
--             de conversations_appels (doublons avec historique_appels)
-- Date : 2026-05-17
-- ══════════════════════════════════════════════════════════════
-- Les colonnes duree_s et date_appel existent déjà dans historique_appels
-- liée par session_id. On supprime les doublons de conversations_appels
-- et on utilise un JOIN pour récupérer ces données.

ALTER TABLE conversations_appels DROP COLUMN IF EXISTS duree_s;
ALTER TABLE conversations_appels DROP COLUMN IF EXISTS date_appel;
ALTER TABLE conversations_appels DROP COLUMN IF EXISTS rapport_ts;
