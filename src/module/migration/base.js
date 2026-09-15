/**
 * This is the base class for a migration.
 * If you make a change to the database schema (i.e. anything in template.yml or in any world-ee stuff or whatever),
 * you should create a migration. To do so, there are several steps:
 * - Bump the schema number in system.json
 * - Make a class that inherits this base class and implements `updateActor` or `updateItem` using the
 *   new value of the schema number as the version
 * - Add this class to the migration index in src/module/migration/migrations/index.js
 */
class MigrationBase {
  static version = 0.001;

  version = this.constructor.version;

  /**
   * Setting requiresFlush to true will indicate that the migration runner should not call any more
   * migrations after this in a batch. Use this if you are adding items to actors for instance.
   */
  requiresFlush = false;

  async updateActor(actor) {
    return actor;
  }

  async updateItem(item) {
    return item;
  }

  async updateToken(token) {
    return token;
  }
}

export { MigrationBase }
