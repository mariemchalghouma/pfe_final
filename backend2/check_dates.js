const { Pool } = require('pg');
const pool = new Pool({ host:'localhost', port:5432, database:'tracking', user:'postgres', password:'12345' });

(async () => {
  try {
    const r1 = await pool.query('SELECT MIN(DATE(gps_timestamp)) as mn, MAX(DATE(gps_timestamp)) as mx, COUNT(*) as cnt FROM local_histo_gps_all');
    console.log('GPS range:', r1.rows[0]);

    const r2 = await pool.query('SELECT MIN(DATE(beginstoptime)) as mn, MAX(DATE(beginstoptime)) as mx, COUNT(*) as cnt FROM voyage_tracking_stops');
    console.log('Stops range:', r2.rows[0]);

    const r3 = await pool.query(`SELECT MIN(DATE("CDATE")) as mn, MAX(DATE("CDATE")) as mx, COUNT(*) as cnt FROM voyage_chauffeur`);
    console.log('Voyages range:', r3.rows[0]);

    // Check if any camion names overlap between tables
    const r4 = await pool.query(`
      SELECT COUNT(DISTINCT UPPER(TRIM(s.camion))) as stops_camions,
             COUNT(DISTINCT UPPER(TRIM(g.camion))) as gps_camions
      FROM voyage_tracking_stops s
      FULL OUTER JOIN local_histo_gps_all g ON UPPER(TRIM(g.camion)) = UPPER(TRIM(s.camion))
    `);
    console.log('Camion overlap:', r4.rows[0]);

    const r5 = await pool.query(`SELECT DISTINCT DATE(beginstoptime) as d FROM voyage_tracking_stops ORDER BY d`);
    console.log('All stops dates:', r5.rows.map(r => r.d));

    const r6 = await pool.query(`SELECT DISTINCT DATE(gps_timestamp) as d FROM local_histo_gps_all ORDER BY d`);
    console.log('All GPS dates:', r6.rows.map(r => r.d));
  } catch(e) {
    console.error(e);
  } finally {
    await pool.end();
  }
})();
