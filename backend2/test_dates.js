const { Pool } = require('pg');
const pool = new Pool({ host:'localhost', port:5432, database:'tracking', user:'postgres', password:'12345' });

(async () => {
  try {
    const r = await pool.query(`SELECT DISTINCT DATE("CDATE") as d FROM voyage_chauffeur ORDER BY d LIMIT 5`);
    console.log('First 5 voyage dates:', r.rows);
  } catch(e) { console.error(e); }
  finally { await pool.end(); }
})();
