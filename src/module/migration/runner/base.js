export class MigrationRunnerBase {
  migrations = [];

  LATEST_VERSION = 0.01;

  constructor(migrations = []) {
    this.migrations = [...migrations].sort((a, b) => Number(a.version) - Number(b.version));
  }

  needsMigration(currentVersion = 0) {
    return Number(currentVersion || 0) < Number(this.LATEST_VERSION || 0);
  }

  diffCollection(original = [], updated = []) {
    const diffs = {
      inserted: [],
      deleted: [],
      updated: [],
    };

    const origSources = new Map();
    for (const source of original) {
      origSources.set(source._id, source);
    }

    for (const source of updated) {
      const origSource = origSources.get(source._id);
      if (origSource) {
        if (JSON.stringify(origSource) !== JSON.stringify(source)) {
          diffs.updated.push(source);
        }
        origSources.delete(source._id);
      } else {
        diffs.inserted.push(source);
      }
    }

    for (const source of origSources.values()) {
      diffs.deleted.push(source._id);
    }

    return diffs;
  }

  async getUpdatedActor(actor, migrations = []) {
    let updated = foundry.utils.deepClone(actor);
    for (const migration of migrations) {
      if (typeof migration.updateActor === "function") {
        const result = await migration.updateActor(updated);
        if (result && typeof result === "object") updated = result;
      }
    }
    return updated;
  }

  async getUpdatedItem(item, migrations = []) {
    let updated = foundry.utils.deepClone(item);
    for (const migration of migrations) {
      if (typeof migration.updateItem === "function") {
        const result = await migration.updateItem(updated);
        if (result && typeof result === "object") updated = result;
      }
    }
    return updated;
  }

  async getUpdatedToken(token, migrations = []) {
    let updated = foundry.utils.deepClone(token);
    for (const migration of migrations) {
      if (typeof migration.updateToken === "function") {
        const result = await migration.updateToken(updated);
        if (result && typeof result === "object") updated = result;
      }
    }
    return updated;
  }

  updateMigrationRecord(migrations, latestMigration) {
    if (!latestMigration) return;

    const fromVersion = Number(migrations?.version ?? 0);
    migrations.version = Number(latestMigration.version);
    migrations.previous = {
      schema: fromVersion,
      foundry: game?.version ?? null,
      system: game?.system?.version ?? null,
    };
  }
}