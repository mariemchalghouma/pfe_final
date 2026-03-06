const { Pool } = require('pg');
const pool = new Pool({ host:'localhost', port:5432, database:'tracking', user:'postgres', password:'12345' });

(async () => {
  try {
    // Check Dec 31 overlap
    const r1 = await pool.query(`
      SELECT DISTINCT UPPER(TRIM(s.camion)) as stop_camion
      FROM voyage_tracking_stops s
      WHERE DATE(s.beginstoptime) = '2025-12-31'
    `);
    console.log('Stops camions on Dec 31:', r1.rows);

    const r2 = await pool.query(`
      SELECT DISTINCT "PLAMOTI" as vc_camion
      FROM voyage_chauffeur
      WHERE DATE("CDATE") = '2025-12-31'
    `);
    console.log('Voyage camions on Dec 31:', r2.rows);

    // Check a typical voyage date
    const r3 = await pool.query(`
      SELECT DISTINCT "PLAMOTI", "VOYHRD", "VOYHRF"
      FROM voyage_chauffeur
      WHERE DATE("CDATE") = '2026-01-05'
      LIMIT 10
    `);
    console.log('Sample voyages Jan 5:', r3.rows);

    // Check camion name format differences
    const r4 = await pool.query(`SELECT DISTINCT camion FROM voyage_tracking_stops LIMIT 10`);
    console.log('Stops camion format:', r4.rows);

    const r5 = await pool.query(`SELECT DISTINCT "PLAMOTI" FROM voyage_chauffeur LIMIT 10`);
    console.log('Voyage PLAMOTI format:', r5.rows);
  } catch(e) {
    console.error(e);
  } finally {
    await pool.end();
  }
})();
