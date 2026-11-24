const gulp = require('gulp');
const prefix = require('gulp-autoprefixer');
const del = require('del');
const sass = require('gulp-sass')(require('sass'));
const yaml = require('gulp-yaml');
const webp = require('gulp-webp');
const git = require('gulp-git');
const tagVersion = require('gulp-tag-version');
const jsYaml = require('js-yaml');
const replace = require('gulp-replace');
const picomatch = require('picomatch');
const through2 = require('through2');
const { stripTypeScriptTypes } = require('module');

// Dependencies for compendium tasks.
const fs = require('fs');
const shell = require('gulp-shell')
const mergeStream = require("merge-stream");
const path = require("path");
const clean = require("gulp-clean");
const { effectPackMigrations, migrateYamlDirectory } = require('./tools/migrate-pack-files.cjs');

// Constants.
const PACK_SRC = "src/packs";
const PACK_DEST = "dist/packs";
function migrateEffectPacks() {
  const effectPackRoot = path.join(PACK_SRC, 'effects-pmttrpg-srd');
  migrateYamlDirectory(effectPackRoot, effectPackMigrations);
  return Promise.resolve();
}

/* ----------------------------------------- */
/*  Compile Compendia
/* ----------------------------------------- */

/**
 * Gulp Task: Compile packs from the yaml source content to .db files.
 */
function compilePacks() {
  // Every folder in the src dir will become a compendium.
  const folders = fs.readdirSync(PACK_SRC).filter((file) => {
    return fs.statSync(path.join(PACK_SRC, file)).isDirectory();
  });

  const packs = folders.map((folder) => {
    return gulp.src(path.join(PACK_SRC, folder))
      .pipe(shell([
        `fvtt package --id projectmoonttrpg --type System pack <%= file.stem %> -c --yaml --in "<%= file.path %>" --out ${PACK_DEST}`
      ]))
  })

  return mergeStream.call(null, packs);
}

/**
 * Cleanup the packs directory.
 *
 * This task will delete the existing compendiums so that the compile task can
 * write fresh copies in their place.
 */
function cleanPacks() {
  return gulp.src(`${PACK_DEST}`, { allowEmpty: true }, {read: false}).pipe(clean());
}

/* ----------------------------------------- */
/*  Export Compendia
/* ----------------------------------------- */

/**
 * Gulp Task: Export Packs
 *
 * This gulp task will load all compendium .db files from the dest directory,
 * load them into memory, and then export them to a human-readable YAML format.
 */
function extractPacks() {
  // Start a stream for all db files in the packs dir.
  const packs = gulp.src(`${PACK_DEST}/*`)
    .pipe(shell([
      'fvtt package --id projectmoonttrpg --type System unpack <%= file.stem %> -c --yaml --in dist/packs --out src/packs/<%= file.stem %>'
    ]));

  // Call the streams.
  return mergeStream.call(null, packs);
}

/* ----------------------------------------- */
/* Compile Sass
/* ----------------------------------------- */

// Small error handler helper function.
function handleError(err) {
  console.log(err.toString());
  this.emit('end');
}

const SYSTEM_SCSS = ["src/styles/src/**/*.scss"];
function compileScss() {
  // Configure options for sass output. For example, 'expanded' or 'compressed'
  let options = {
    style: 'compressed'
  };
  return gulp.src(SYSTEM_SCSS)
    .pipe(
      sass(options)
        .on('error', handleError)
    )
    .pipe(prefix({
      cascade: false
    }))
    .pipe(gulp.dest("./dist/styles/dist"))
}
const cssTask = gulp.series(compileScss);

/* ----------------------------------------- */
/* Compile YAML
/* ----------------------------------------- */
const SYSTEM_YAML = ['src/yaml/**/*.yml', 'src/yaml/**/*.yaml'];
function compileYaml() {
  return gulp.src(SYSTEM_YAML)
    .pipe(yaml({ space: 2 }))
    .pipe(gulp.dest('./dist'))
}
const yamlTask = gulp.series(compileYaml);

/* ----------------------------------------- */
/* Delete files
/* ----------------------------------------- */
const SYSTEM_DELETE = ['dist'];
function deleteFiles() {
  return del([
    'dist/**',
    '!dist/packs'
  ], {force: true});
}
const deleteTask = gulp.series(deleteFiles);

/* ----------------------------------------- */
/* Copy files
/* ----------------------------------------- */
const SYSTEM_COPY = [
  'src/assets/**/*',
  '!src/assets/**/*.{png,jpeg,jpg}',
  'src/module/**/*',
  '!src/module/**/*.ts',
  'src/packs/**/*.db',
  'src/scripts/**/*',
  'src/styles/lib/**/*',
  'src/templates/**/*',
  'src/tokens/**/*',
  '!src/tokens/**/*.{png,jpeg,jpg}'
];
function copyFiles() {
  return gulp.src(SYSTEM_COPY, {base: 'src', encoding: false})
    // A failed write also errors this stream; dest() already reports it, and unhandled it would end the watch.
    .on('error', () => {})
    .pipe(gulp.dest('./dist'))
}
const copyTask = gulp.series(copyFiles);

/* ----------------------------------------- */
/* Compile TypeScript
/* ----------------------------------------- */
const SYSTEM_TS = ['src/module/**/*.ts'];
function compileTs() {
  return gulp.src(SYSTEM_TS, {base: 'src'})
    .pipe(through2.obj((file, enc, done) => {
      try {
        file.contents = Buffer.from(stripTypeScriptTypes(file.contents.toString()));
        file.extname = '.js';
        done(null, file);
      } catch (err) {
        // We skip the file and just fail the build at the end (erroring the stream would end the watch).
        console.log(`${file.relative}: ${err.message}`);
        process.exitCode = 1;
        done();
      }
    }))
    .pipe(gulp.dest('./dist'));
}
const tsTask = gulp.series(compileTs);

/* ----------------------------------------- */
/* Convert images
/* ----------------------------------------- */
const SYSTEM_IMAGES = [
  'src/assets/**/*.{png,jpeg,jpg}',
  'src/tokens/**/*.{png,jpeg,jpg}'
];
function compileImages() {
  return gulp.src(SYSTEM_IMAGES, {base: 'src', encoding: false})
    .pipe(webp())
    .pipe(gulp.dest('./dist'));
};
const imageTask = gulp.series(compileImages);

/* ----------------------------------------- */
/* Retrieve current version from system.yml
/* ----------------------------------------- */
function getTagVersion() {
  try {
    // Load the manifest and determine the version.
    const doc = jsYaml.safeLoad(fs.readFileSync('./src/yaml/system.yml', 'utf8'));
    return doc.version;
  } catch (e) {
    console.log(e);
    // Output the original file as a fail safe.
    return false;
  }
}

/* ----------------------------------------- */
/* Increment version in system.yml
/* ----------------------------------------- */
function inc(importance) {
  let version = getTagVersion();
  if (version) {
    let oldVersion = version;
    let newVersionSplit = version.split('.');
    switch (importance) {
      case 'patch':
        newVersionSplit[2]++;
        break;

      case 'minor':
        newVersionSplit[1]++;
        break;

      case 'major':
        newVersionSplit[0]++;
        break;

      default:
        break;
    }
    let newVersion = newVersionSplit.join('.');
    // Output the version to the file.
    return gulp.src(['./src/yaml/system.yml'])
      // String replacements.
      .pipe(replace(oldVersion, newVersion))
      .pipe(replace('jobs/artifacts/master', `jobs/artifacts/${newVersion}`))
      // Overwrite system.yml.
      .pipe(gulp.dest('./src/yaml'))
  } else {
    return gulp.src(['./src/yaml/system.yml']);
  }
}

/* ----------------------------------------- */
/* Commit changes and make a new git tag.
/* ----------------------------------------- */
function commitTag() {
  let version = getTagVersion();
  if (version) {
    return gulp.src(['./system.json'])
      .pipe(git.commit(`Release ${version}`))
      .pipe(tagVersion({ prefix: '' }));
  }
  else {
    return gulp.src(['./system.json']);
  }
}

/* ----------------------------------------- */
/* Watch Updates
/* ----------------------------------------- */

// Watching globs makes chokidar add a listener on every folder event and never remove it,
// so watch the folders the globs start from and skip the files they don't match.
function watchGlobs(globs, task) {
  const include = globs.filter((glob) => !glob.startsWith('!'));
  const exclude = globs.filter((glob) => glob.startsWith('!')).map((glob) => glob.slice(1));
  const isMatch = picomatch(include, { ignore: exclude });
  const folders = [...new Set(include.map((glob) => picomatch.scan(glob).base))];
  const ignored = (file, stats) => stats !== undefined && stats.isFile() && !isMatch(path.relative('.', file).split(path.sep).join('/'));
  return gulp.watch(folders, { ignored }, task);
}

function watchUpdates() {
  watchGlobs(SYSTEM_YAML, yamlTask);
  watchGlobs(SYSTEM_IMAGES, compileImages);
  watchGlobs(SYSTEM_SCSS, gulp.series(compileScss, copyFiles));
  watchGlobs(SYSTEM_COPY, copyTask);
  watchGlobs(SYSTEM_TS, tsTask);
}

/* ----------------------------------------- */
/* Export Tasks
/* ----------------------------------------- */

const defaultTask = gulp.series(
  deleteFiles,
  compileYaml,
  compileImages,
  compileScss,
  copyFiles,
  compileTs,
  watchUpdates
);
const buildTask = gulp.series(
  cleanPacks,
  deleteFiles,
  gulp.parallel(
    compileYaml,
    compileScss,
    compileImages,
    copyFiles,
    compileTs,
    compilePacks
  )
);

exports.default = defaultTask;
exports.build = buildTask;

exports.copy = copyTask;
exports.images = imageTask;
exports.css = cssTask;
exports.yaml = yamlTask;
exports.ts = tsTask;

exports.cleanPacks = gulp.series(cleanPacks);
exports.compilePacks = gulp.series(cleanPacks, compilePacks);
exports.extractPacks = gulp.series(extractPacks);
exports.migrateEffectPacks = gulp.series(migrateEffectPacks);

/**
 * Bumping version number and tagging the repository with it.
 * Please read http://semver.org/
 *
 * You can use the commands
 *
 *     gulp patch     # makes v0.1.0 → v0.1.1
 *     gulp feature   # makes v0.1.1 → v0.2.0
 *     gulp release   # makes v0.2.1 → v1.0.0
 *
 * To bump the version numbers accordingly after you did a patch,
 * introduced a feature or made a backwards-incompatible release.
 */
patch = function() { return inc('patch') };
major = function() { return inc('major') };
minor = function() { return inc('minor') };
exports.patch = gulp.series(patch, buildTask, commitTag);
exports.minor = gulp.series(minor, buildTask, commitTag);
exports.major = gulp.series(major, buildTask, commitTag);