import { loadProductionMigrationInventory } from './production-migration-inventory.mjs';

const migrations = await loadProductionMigrationInventory();
process.stdout.write(migrations.map((migration) => migration.name).sort().join('\n'));
