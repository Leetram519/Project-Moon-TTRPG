const fs = require('fs');
const path = require('path');
const jsYaml = require('js-yaml');

function collectYamlFiles(rootDir) {
  const files = [];

  for (const entry of fs.readdirSync(rootDir)) {
    const fullPath = path.join(rootDir, entry);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...collectYamlFiles(fullPath));
    }
    else if (/\.ya?ml$/i.test(entry)) {
      files.push(fullPath);
    }
  }

  return files;
}

function addStackMaxMigration(doc) {
  if (!doc || doc.type !== 'effect' || !doc.system) {
    return false;
  }

  const system = doc.system;
  const stackMax = Math.max(1, Number(system.stackMax ?? 5) || 5);
  const nextAllowMultiple = stackMax > 1;
  let mutated = false;

  if (system.stackMax !== stackMax) {
    system.stackMax = stackMax;
    mutated = true;
  }

  if (system.allowMultiple !== nextAllowMultiple) {
    system.allowMultiple = nextAllowMultiple;
    mutated = true;
  }

  return mutated;
}

function addClashResultLockMigration(doc) {
  if (!doc || doc.type !== 'effect' || !doc.system) {
    return false;
  }

  const system = doc.system;
  const shouldLock = ['onClash', 'onClashResult', 'onEitherClashResult'].includes(system.procOn) && system.procResult !== 'none';

  if (system.procResultLocked === shouldLock) {
    return false;
  }

  system.procResultLocked = shouldLock;
  return true;
}

const effectPackMigrations = [
  addStackMaxMigration,
  addClashResultLockMigration
];

function migrateYamlDirectory(rootDir, migrations = []) {
  const yamlFiles = collectYamlFiles(rootDir);
  const dumpOptions = {
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
    indent: 2
  };
  let changedCount = 0;

  for (const filePath of yamlFiles) {
    const source = fs.readFileSync(filePath, 'utf8');
    const doc = jsYaml.load(source);
    if (!doc) continue;

    let mutated = false;
    for (const migration of migrations) {
      mutated = migration(doc, {
        filePath,
        rootDir,
        source
      }) || mutated;
    }

    if (!mutated) continue;

    fs.writeFileSync(filePath, `${jsYaml.dump(doc, dumpOptions)}`);
    changedCount += 1;
  }

  return {
    changedCount,
    fileCount: yamlFiles.length
  };
}

module.exports = {
  addStackMaxMigration,
  addClashResultLockMigration,
  collectYamlFiles,
  effectPackMigrations,
  migrateYamlDirectory
};

if (require.main === module) {
  const rootDir = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(process.cwd(), 'src/packs/effects-pmttrpg-srd');
  const result = migrateYamlDirectory(rootDir, effectPackMigrations);
  console.log(`Migrated ${result.changedCount} of ${result.fileCount} YAML files in ${rootDir}`);
}
