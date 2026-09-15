import { MigrationRunnerBase } from "./base.js";

export class MigrationRunner extends MigrationRunnerBase {
  static LATEST_SCHEMA_VERSION = 0.01;

  /** Failure reasons from the most recent migration run, keyed by UUID */
  static lastRunFailures = new Map();

  constructor(migrations) {
    super(migrations);

    const latestVersion = MigrationRunner.getLatestSchemaVersion(this.migrations);
    this.LATEST_VERSION = latestVersion;
    MigrationRunner.LATEST_SCHEMA_VERSION = latestVersion;
  }

  static getLatestSchemaVersion(migrations = []) {
    return Math.max(...migrations.map((migration) => Number(migration.version) || 0), 0);
  }

  getStoredSchemaVersion() {
    try {
      const worldVersion = game?.settings?.get("projectmoonttrpg", "worldSchemaVersion");
      if (Number.isFinite(Number(worldVersion))) return Number(worldVersion);
    } catch {
      // The setting is not registered yet.
    }

    try {
      const legacyVersion = game?.settings?.get("projectmoonttrpg", "systemMigrationVersion");
      if (Number.isFinite(Number(legacyVersion))) return Number(legacyVersion);
    } catch {
      // Ignore legacy setting problems.
    }

    return 0;
  }

  /** @override */
  needsMigration() {
    const currentVersion = Number(this.getStoredSchemaVersion() || 0);
    return super.needsMigration(currentVersion);
  }

  static schemaVersionFromIndex(entry) {
    return Number(entry?.version ?? entry?.schemaVersion ?? 0) || 0;
  }

  static flattenError(error) {
    const parts = [];
    for (let current = error; current instanceof Error; current = current?.cause) {
      parts.push(current.message);
    }
    return parts.length > 0 ? parts.join(": ") : String(error);
  }

  // this fucks everything up. fuck this
  stripTokenVisionChanges(changes) {
    if (!changes || typeof changes !== "object") return changes;

    delete changes.detectionModes;
    return changes;
  }

  static async ensureSchemaVersion(document, migrations) {
    if (migrations.length === 0) return;
    const currentVersion = this.getLatestSchemaVersion(migrations);

    if ((Number(document.schemaVersion) || 0) < currentVersion) {
      const runner = new this(migrations);
      const source = document._source;
      const updated = await (async () => {
        try {
          return "items" in source
            ? await runner.getUpdatedActor(source, runner.migrations)
            : await runner.getUpdatedItem(source, runner.migrations);
        } catch {
          return null;
        }
      })();

      if (updated) {
        if ("items" in updated && "items" in document._source) {
          for (const updatedItem of updated.items) {
            updatedItem._id ??= foundry.utils.randomID();
          }

          const itemSources = document._source.items;
          for (const itemSource of [...itemSources]) {
            if (!updated.items.some((item) => item._id === itemSource._id)) {
              itemSources.splice(itemSources.indexOf(itemSource), 1);
            }
          }
        }

        document.updateSource(updated);
      }
    }

    document.updateSource({ "system._migration.version": currentVersion });
    if ("items" in document && "prototypeToken" in document) {
      for (const item of document.items) {
        if (!item.schemaVersion) {
          item.updateSource({ "system._migration.version": currentVersion });
        }
      }
    }
  }

  async migrateDocuments(collection, migrations, progress) {
    const pack = "metadata" in collection ? collection.metadata.id : null;
    const updateGroup = [];
    for (const [index, document] of collection.contents.entries()) {
      if (index % 25 === 24) await new Promise((resolve) => setTimeout(resolve, 0));
      if (updateGroup.length === 100) {
        await this.saveUpdateGroup(collection, updateGroup, pack, progress);
      }
      const updated =
        "prototypeToken" in document
          ? await this.migrateActor(migrations, document, { pack })
          : await this.migrateItem(migrations, document);
      if (updated) updateGroup.push(updated);
    }
    if (updateGroup.length > 0) {
      await this.saveUpdateGroup(collection, updateGroup, pack, progress);
    }
  }

  async saveUpdateGroup(collection, updateGroup, pack, progress, { diff = true } = {}) {
    const DocumentClass = collection.documentClass;
    try {
      await DocumentClass.updateDocuments(updateGroup, { noHook: true, pack, diff });
    } catch (batchError) {
      console.warn(batchError);
      for (const source of updateGroup) {
        try {
          await DocumentClass.updateDocuments([source], { noHook: true, pack, diff });
        } catch (error) {
          console.warn(error);
          const uuid = collection.get(source._id ?? "")?.uuid;
          if (uuid) MigrationRunner.lastRunFailures.set(uuid, MigrationRunner.flattenError(error));
        }
      }
    } finally {
      progress?.advance?.(updateGroup.length);
      updateGroup.length = 0;
    }
  }

  removeSpecialKeys(data) {
    if (Array.isArray(data)) {
      for (const value of data) {
        this.removeSpecialKeys(value);
      }
    } else if (foundry.utils.isPlainObject(data)) {
      for (const key of Object.keys(data)) {
        if (key.startsWith("-=")) {
          delete data[key];
        } else {
          this.removeSpecialKeys(data[key]);
        }
      }
    }

    return data;
  }

  async migrateItem(migrations, item) {
    const baseItem = this.removeSpecialKeys(item.toObject());

    try {
      return await this.getUpdatedItem(baseItem, migrations);
    } catch (error) {
      ui.notifications?.error?.(`Error thrown while migrating ${item.name} (${item.uuid})`);
      console.error(error);
      MigrationRunner.lastRunFailures.set(item.uuid, MigrationRunner.flattenError(error));
      return null;
    }
  }

  async migrateActor(migrations, actor, options = {}) {
    const pack = options.pack;
    const baseActor = this.removeSpecialKeys(actor.toObject());

    const updatedActor = await (async () => {
      try {
        return await this.getUpdatedActor(baseActor, migrations);
      } catch (error) {
        if (error instanceof Error) {
          console.error(`Error thrown while migrating ${actor.uuid}: `, error);
        }
        MigrationRunner.lastRunFailures.set(actor.uuid, MigrationRunner.flattenError(error));
        return null;
      }
    })();
    if (!updatedActor) return null;

    const hasActiveEffects = Array.isArray(actor?._source?.effects) && actor._source.effects.some((effect) => Array.isArray(effect.statuses) && effect.statuses.some((status) => status !== "dead"));
    if (hasActiveEffects) {
      await actor.deleteEmbeddedDocuments("ActiveEffect", [], { deleteAll: true });
    }

    const baseItems = [...(baseActor.items ?? [])];
    const updatedItems = [...(updatedActor.items ?? [])];
    const itemDiff = this.diffCollection(baseItems, updatedItems);
    const finalDeleted = itemDiff.deleted.filter((id) => actor.items.has(id));
    if (finalDeleted.length > 0) {
      try {
        await actor.deleteEmbeddedDocuments("Item", finalDeleted, { noHook: true, pack });
      } catch (error) {
        console.warn(error);
      }
    }
    const finalUpdated = itemDiff.updated.filter((item) => actor.items.has(item._id));
    updatedActor.items = [...itemDiff.inserted, ...finalUpdated];

    return updatedActor;
  }

  async migrateSceneToken(token, migrations) {
    if (!migrations.some((migration) => typeof migration.updateToken === "function")) return token.toObject();

    try {
      const updatedToken = await this.getUpdatedToken(token, migrations);
      const changes = this.stripTokenVisionChanges(foundry.utils.diffObject(token.toObject(), updatedToken));

      if (Object.keys(changes).length > 0) {
        try {
          await token.update(changes, { noHook: true });
        } catch (error) {
          console.warn(error);
        }
      }
      return updatedToken;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  async runMigrations(migrations) {
    if (migrations.length === 0) return;

    const ProgressCtor = globalThis.Progress ?? class {
      constructor({ max = 0 } = {}) {
        this.value = 0;
        this.max = max;
      }
      advance(by = 1) {
        this.value += by;
      }
      close() {}
    };

    const progress = new ProgressCtor({
      label: typeof _loc === "function" ? _loc("PMTTRPG.Migrations.Running") : "Running migrations",
      max:
        game.actors.size +
        game.items.size +
        game.scenes.contents.flatMap((scene) => scene.tokens.contents).filter((token) => !token.actorLink).length,
    });

    await this.migrateDocuments(game.actors, migrations, progress);
    await this.migrateDocuments(game.items, migrations, progress);

    const promises = [];
    for (const migration of migrations) {
      if (typeof migration.migrate === "function") promises.push(migration.migrate());
    }

    await Promise.allSettled(promises);

    let tokensProcessed = 0;
    for (const scene of game.scenes) {
      for (const token of scene.tokens) {
        tokensProcessed += 1;
        if (tokensProcessed % 25 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
        const { actor } = token;
        if (!actor) continue;

        const wasSuccessful = !!(await this.migrateSceneToken(token, migrations));
        if (!wasSuccessful) continue;

        const deltaSource = token.delta?._source;
        const hasMigratableData =
          (!!deltaSource && !!deltaSource.flags?.pmttrpg) ||
          ((deltaSource ?? {}).items ?? []).length > 0 ||
          Object.keys(deltaSource?.system ?? {}).length > 0;

        if (actor.isToken && hasMigratableData) {
          const updated = await this.migrateActor(migrations, actor);
          if (updated) {
            try {
              await actor.update(updated, { noHook: true });
            } catch (error) {
              console.warn(error);
            }
          }
        }
        progress.advance();
      }
    }

    if (progress.value < progress.max) progress.close();
  }

  async runMigration(force = false) {
    MigrationRunner.lastRunFailures.clear();
    const currentVersion = this.getStoredSchemaVersion();
    const latestVersion = MigrationRunner.getLatestSchemaVersion(this.migrations);
    const schemaVersion = {
      latest: latestVersion,
      current: currentVersion,
    };

    const systemVersion = game.system.version;
    ui.notifications?.info?.("PMTTRPG.Migrations.Starting", { format: { version: systemVersion } });

    const migrationsToRun = force
      ? this.migrations
      : this.migrations.filter((migration) => Number(migration.version) > Number(schemaVersion.current));

    const migrationPhases = [[]];
    for (const migration of migrationsToRun) {
      migrationPhases[migrationPhases.length - 1].push(migration);
      if (migration.requiresFlush) {
        migrationPhases.push([]);
      }
    }

    for (const migrationPhase of migrationPhases) {
      if (migrationPhase.length) await this.runMigrations(migrationPhase);
    }

    if (migrationsToRun.length > 0) {
      await game.settings.set("projectmoonttrpg", "worldSchemaVersion", latestVersion);
      await game.settings.set("projectmoonttrpg", "systemMigrationVersion", latestVersion);
    }
  }
}