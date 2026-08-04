/**
 * Node.js script to populate a native `.realm` database file from exported JSON data.
 * 
 * Prerequisites:
 * npm install realm
 * 
 * Usage:
 * node convert_to_realm.js
 */

const fs = require('fs');
const path = require('path');

const schemasPath = path.join(__dirname, 'realm_schemas.json');
const dataPath = path.join(__dirname, 'realm_data.json');

if (!fs.existsSync(schemasPath) || !fs.existsSync(dataPath)) {
  console.error("Error: Please run 'python export_to_realm_format.py' first to generate schemas and data.");
  process.exit(1);
}

let Realm;
try {
  Realm = require('realm');
} catch (err) {
  console.log("------------------------------------------------------------------");
  console.log("Notice: The 'realm' Node module is not currently installed.");
  console.log("To generate a native '.realm' binary file from the exported data:");
  console.log("  1. Run: npm install realm");
  console.log("  2. Run: node convert_to_realm.js");
  console.log("------------------------------------------------------------------");
  process.exit(0);
}

async function buildRealmDatabase() {
  const rawSchemas = JSON.parse(fs.readFileSync(schemasPath, 'utf-8'));
  const rawData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

  const realmSchemas = Object.values(rawSchemas);

  console.log(`Opening output database at ${path.join(__dirname, 'database.realm')}...`);
  const realm = await Realm.open({
    path: path.join(__dirname, 'database.realm'),
    schema: realmSchemas,
  });

  realm.write(() => {
    for (const [tableName, rows] of Object.entries(rawData)) {
      console.log(`Inserting ${rows.length} records into Realm table '${tableName}'...`);
      for (const row of rows) {
        realm.create(tableName, row, Realm.UpdateMode.Modified);
      }
    }
  });

  console.log("\nNative Realm database build complete: database.realm");
  realm.close();
}

buildRealmDatabase().catch(err => {
  console.error("Error building Realm database:", err);
});
