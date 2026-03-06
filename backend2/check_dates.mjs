import pkg from 'pg';
const { Pool } = pkg;
const pool = new Pool({ host:'localhost', port:5432, database:'tracking', user:'postgres', password:'12345' });

// 1) Check date columns in voyage_chauffeur
console.log('=== voyage_chauffeur: dates disponibles ===');
const vc = await pool.query(`
  SELECT "CDATE"::date AS cdate, "VOYDTD"::date AS voydtd, COUNT(*) AS nb
  FROM voyage_chauffeur
  WHERE "PLAMOTI" IS NOT NULL
  GROUP BY "CDATE"::date, "VOYDTD"::date
  ORDER BY cdate DESC NULLS LAST
  LIMIT 10
`);
console.table(vc.rows);

// 2) Check GPS dates
console.log('\n=== local_histo_gps_all: dates récentes ===');
const gps = await pool.query(`
  SELECT DATE(gps_timestamp) AS dt, COUNT(*) AS nb
  FROM local_histo_gps_all
  GROUP BY DATE(gps_timestamp)
  ORDER BY dt DESC
  LIMIT 10
`);
console.table(gps.rows);

// 3) Check stops dates
console.log('\n=== voyage_tracking_stops: dates récentes ===');
const stops = await pool.query(`
  SELECT DATE(beginstoptime) AS dt, COUNT(*) AS nb
  FROM voyage_tracking_stops
  GROUP BY DATE(beginstoptime)
  ORDER BY dt DESC
  LIMIT 10
`);
console.table(stops.rows);

// 4) Sample voyage_chauffeur for a date that has data
console.log('\n=== voyage_chauffeur sample with CDATE ===');
const sample = await pool.query(`
  SELECT "PLAMOTI", "SALNOM", "VOYCLE", "CDATE", "VOYDTD", "VOYHRD", "VOYHRF", "RGILIBL", "PLATOUORDRE"
  FROM voyage_chauffeur
  WHERE "PLAMOTI" IS NOT NULL AND "CDATE" IS NOT NULL
  ORDER BY "CDATE" DESC
  LIMIT 8
`);
console.table(sample.rows);

process.exit();
