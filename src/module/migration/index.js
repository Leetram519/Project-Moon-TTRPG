import { MigrationRunner } from "./runner/index.js";
import * as Migrations from "./migrations/index.js";

export { MigrationRunner } from "./runner/index.js";

export class MigrationList {
  static #list = Object.values(Migrations).filter((value) => typeof value === "function");

  static get list() {
    return this.#list;
  }

  static get latestVersion() {
    return Math.max(...this.#list.map((M) => Number(M.version || 0)), 0);
  }

  static constructAll() {
    return this.#list.map((M) => new M());
  }

  static constructFromVersion(version) {
    const minVersion = Number(version) || MigrationRunner.RECOMMENDED_SAFE_VERSION;
    return this.#list.filter((M) => Number(M.version) > minVersion).map((M) => new M());
  }

  static constructRange(min, max = Infinity) {
    return this.#list
      .filter((M) => Number(M.version) >= Number(min) && Number(M.version) <= Number(max))
      .map((M) => new M());
  }
}
