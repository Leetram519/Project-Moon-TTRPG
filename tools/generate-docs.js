import { execSync } from "child_process";
import { mkdirSync, writeFileSync, readFileSync } from "fs";
import { globSync } from "glob";
import { relative } from "path";

// ─── Module definitions ───────────────────────────────────────────────────────

const modules = [
  { name: "action-economy",     glob: "src/module/{action-economy/declare.js,action-economy/custom-actions.js,action-economy/kinds.js,movement/movement-processors.js,rules/rule-contributions.js}" },
  { name: "actor",              glob: "src/module/actor/**/*.js" },
  { name: "apps",               glob: "src/module/apps/**/*.js" },
  { name: "canvas",             glob: "src/module/canvas/**/*.js" },
  { name: "combat",             glob: "src/module/combat/**/*.js" },
  { name: "easy-effects",       glob: "src/module/easy-effects/**/*.js" },
  { name: "effects",            glob: "src/module/effects/**/*.js" },
  { name: "inventory",          glob: "src/module/inventory/**/*.js" },
  { name: "item",               glob: "src/module/item/**/*.js" },
  { name: "status",             glob: "src/module/status/**/*.js" },

  { name: "chat",               glob: "src/module/chat.js" },
  { name: "config",             glob: "src/module/config.js" },
  { name: "damage-application", glob: "src/module/damage-application.js" },
  { name: "handlebars",         glob: "src/module/handlebars.js" },
  { name: "pool-clamp",         glob: "src/module/pool-clamp.js" },
  { name: "projectmoonttrpg",   glob: "src/module/projectmoonttrpg.js" },
  { name: "rolls",              glob: "src/module/rolls.js" },
  { name: "slug",               glob: "src/module/slug.js" },
  { name: "status-macro-api",   glob: "src/module/status-macro-api.js" },
  { name: "targeting",          glob: "src/module/targeting.js" },
  { name: "templates",          glob: "src/module/templates.js" },
  { name: "utility",            glob: "src/module/utility.js" },
];

// ─── JSDoc block parser ───────────────────────────────────────────────────────

/**
 * Parse a raw JSDoc comment block into structured fields:
 *   { description, params, returns, example, tags }
 *
 * Tags that aren't @param/@returns/@example are collected under `tags`
 * as { tag, value } pairs so nothing is silently dropped.
 */
function parseJsDoc(block) {
  const raw = block
    .replace(/^\/\*\*/, "")
    .replace(/\*\/$/, "")
    .split("\n")
    .map(l => l.replace(/^\s*\*\s?/, ""))
    .join("\n")
    .trim();

  const result = {
    description: "",
    params: [],      // { name, type, description, optional, defaultVal }
    returns: null,   // { type, description }
    example: "",
    tags: [],        // { tag, value } catch-all
  };

  // Split on @ boundaries, keep the @ with each chunk
  const chunks = raw.split(/(?=^@)/m);

  // First chunk (before any @) is the description
  result.description = chunks[0].trim();

  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i].trim();

    // @param {Type} [name=default] description
    const paramMatch = chunk.match(
      /^@param\s+(?:\{([^}]*)\}\s+)?(\[[\w.]+(?:=.+?)?\]|[\w.]+)(?:\s+([\s\S]*))?$/
    );
    if (paramMatch) {
      let [, type = "", nameRaw = "", desc = ""] = paramMatch;
      const optional = nameRaw.startsWith("[");
      const inner    = nameRaw.replace(/^\[|\]$/g, "");
      const [paramName, defaultVal] = inner.split("=");
      result.params.push({
        name:       paramName.trim(),
        type:       type.trim(),
        description: desc.trim(),
        optional,
        defaultVal: defaultVal?.trim() ?? null,
      });
      continue;
    }

    // @returns / @return {Type} description
    const retMatch = chunk.match(/^@returns?\s+(?:\{([^}]*)\}\s*)?([\s\S]*)?$/);
    if (retMatch) {
      result.returns = {
        type:        retMatch[1]?.trim() ?? "",
        description: retMatch[2]?.trim() ?? "",
      };
      continue;
    }

    // @example (everything after the tag line)
    const exMatch = chunk.match(/^@example\s*([\s\S]*)$/);
    if (exMatch) {
      result.example = exMatch[1].trim();
      continue;
    }

    // Everything else — @throws, @fires, @type, @since, @deprecated, etc.
    const genericMatch = chunk.match(/^@(\w+)\s*([\s\S]*)$/);
    if (genericMatch) {
      result.tags.push({ tag: genericMatch[1], value: genericMatch[2].trim() });
    }
  }

  return result;
}

/**
 * Render a parsed JSDoc object into Markdown.
 * Produces a description paragraph + structured tables for params/returns.
 */
function renderJsDoc(parsed, indentHeading = "") {
  const parts = [];

  if (parsed.description) {
    parts.push(parsed.description);
  }

  // Extra tags (throws, fires, since, deprecated…)
  const namedTags = parsed.tags.filter(t => t.value);
  if (namedTags.length) {
    parts.push(
      namedTags.map(({ tag, value }) => `**@${tag}** — ${value}`).join("  \n")
    );
  }

  // Parameters table
  if (parsed.params.length) {
    const rows = parsed.params.map(p => {
      const nameCell = p.optional
        ? `\`${p.name}\` *(optional${p.defaultVal ? `, default: \`${p.defaultVal}\`` : ""})*`
        : `\`${p.name}\``;
      const typeCell = p.type ? `\`${p.type}\`` : "—";
      const descCell = p.description || "—";
      return `| ${nameCell} | ${typeCell} | ${descCell} |`;
    });
    parts.push(
      `${indentHeading}**Parameters**\n\n` +
      `| Name | Type | Description |\n` +
      `|------|------|-------------|\n` +
      rows.join("\n")
    );
  }

  // Returns
  if (parsed.returns) {
    const typeStr  = parsed.returns.type        ? `\`${parsed.returns.type}\`` : "—";
    const descStr  = parsed.returns.description || "—";
    parts.push(`**Returns** ${typeStr} — ${descStr}`);
  }

  // Example
  if (parsed.example) {
    parts.push(`**Example**\n\`\`\`js\n${parsed.example}\n\`\`\``);
  }

  return parts.join("\n\n");
}

// ─── Source extractor ─────────────────────────────────────────────────────────

/**
 * Walk every line of a source file, match classes / functions / variables,
 * grab any JSDoc comment sitting immediately above each, and emit rich Markdown.
 */
function extractFromSource(src, filePath) {
  const lines = src.split("\n");
  const sections = [];
  const seen = new Set();

  /** Return the raw JSDoc string sitting directly above lineIdx, or null. */
  function getJsDocAbove(lineIdx) {
    let i = lineIdx - 1;
    while (i >= 0 && lines[i].trim() === "") i--;
    if (i < 0 || !lines[i].trim().endsWith("*/")) return null;
    const end = i;
    while (i >= 0 && !lines[i].trim().startsWith("/**")) i--;
    if (i < 0) return null;
    return lines.slice(i, end + 1).join("\n");
  }

  /** Format a raw param string (from the source signature) into a simple list,
   *  used only when there is NO @param JSDoc to draw from. */
  function signatureParamFallback(rawParams) {
    if (!rawParams.trim()) return "";
    const items = rawParams
      .split(",")
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => `| \`${p}\` | — | — |`)
      .join("\n");
    return (
      `**Parameters**\n\n` +
      `| Name | Type | Description |\n` +
      `|------|------|-------------|\n` +
      items
    );
  }

  /**
   * Build a section for one symbol.
   * @param {"class"|"function"|"const"|"let"|"var"} kind
   * @param {string} name
   * @param {string|null} extra   — extends clause for classes, raw param string for fns
   * @param {string|null} jsdocRaw
   */
  function makeSection(kind, name, extra, jsdocRaw) {
    const parsed   = jsdocRaw ? parseJsDoc(jsdocRaw) : null;
    const hasJsDoc = !!parsed;

    // ── Heading ──────────────────────────────────────────────────────────────
    let heading = "";
    if (kind === "class") {
      const extendsNote = extra ? ` *(extends \`${extra}\`)*` : "";
      heading = `### Class: \`${name}\`${extendsNote}`;
    } else if (kind === "function") {
      heading = `### Function: \`${name}(${(extra ?? "").trim()})\``;
    } else {
      heading = `### \`${kind} ${name}\``;
    }

    const badgeStr = hasJsDoc ? "" : "\n> [WARNING] *No JSDoc comment — signature extracted from source.*\n";

    // ── Body ─────────────────────────────────────────────────────────────────
    let body = "";
    if (parsed) {
      body = renderJsDoc(parsed);
    } else if (kind === "function" && extra?.trim()) {
      // No JSDoc but we have a signature: emit a bare params table
      body = signatureParamFallback(extra);
    } else {
      body = "*No description provided.*";
    }

    return `${heading}\n${badgeStr}\n${body}`;
  }

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    // ── Classes ───────────────────────────────────────────────────────────────
    const classMatch = trimmed.match(
      /^(?:export\s+(?:default\s+)?)?class\s+(\w+)(?:\s+extends\s+(\w+))?/
    );
    if (classMatch) {
      const [, name, parent] = classMatch;
      if (!seen.has(`class:${name}`)) {
        seen.add(`class:${name}`);
        sections.push(makeSection("class", name, parent ?? null, getJsDocAbove(idx)));
      }
      return;
    }

    // ── Named function declarations ───────────────────────────────────────────
    const funcMatch = trimmed.match(
      /^(?:export\s+(?:default\s+)?(?:async\s+)?)?function\s+(\w+)\s*\(([^)]*)\)/
    );
    if (funcMatch) {
      const [, name, params] = funcMatch;
      if (!seen.has(`fn:${name}`)) {
        seen.add(`fn:${name}`);
        sections.push(makeSection("function", name, params, getJsDocAbove(idx)));
      }
      return;
    }

    // ── Arrow functions: const foo = (...) => ────────────────────────────────
    const arrowMatch = trimmed.match(
      /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/
    );
    if (arrowMatch) {
      const [, name, params] = arrowMatch;
      if (!seen.has(`fn:${name}`)) {
        seen.add(`fn:${name}`);
        sections.push(makeSection("function", name, params, getJsDocAbove(idx)));
      }
      return;
    }

    // ── Top-level variables (exported, or JSDoc-annotated) ────────────────────
    const varMatch = trimmed.match(/^(?:export\s+)?(const|let|var)\s+(\w+)\s*=/);
    if (varMatch) {
      const [, keyword, name] = varMatch;
      if (!seen.has(`fn:${name}`) && !seen.has(`var:${name}`)) {
        seen.add(`var:${name}`);
        const jsdoc      = getJsDocAbove(idx);
        const isExported = trimmed.startsWith("export ");
        if (jsdoc || isExported) {
          sections.push(makeSection(keyword, name, null, jsdoc));
        }
      }
    }
  });

  if (sections.length === 0) return null;

  return `## \`${filePath}\`\n\n` + sections.join("\n\n---\n\n");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

mkdirSync("docs/api", { recursive: true });

for (const mod of modules) {
  console.log(`\nProcessing: ${mod.name}`);

  const files = globSync(mod.glob, { nodir: true });

  if (files.length === 0) {
    console.warn(`No files matched: ${mod.glob}`);
    writeFileSync(
      `docs/api/${mod.name}.md`,
      `# ${mod.name}\n\n> No source files found matching \`${mod.glob}\`.\n`
    );
    continue;
  }

  console.log(`  Found ${files.length} file(s)`);

  const fileSections = [];
  let documentedCount = 0;
  let totalSymbols    = 0;

  for (const file of files) {
    const src     = readFileSync(file, "utf8");
    const relPath = relative(process.cwd(), file);
    const section = extractFromSource(src, relPath);

    if (section) {
      // Count documented vs total symbols for the summary badge
      const jsdocHits = (section.match(/[WARNING]/g) ?? []).length;
      const allHits   = (section.match(/^### /gm) ?? []).length;
      documentedCount += allHits - jsdocHits;
      totalSymbols    += allHits;
      fileSections.push(section);
    }
  }

  if (fileSections.length === 0) {
    writeFileSync(
      `docs/api/${mod.name}.md`,
      `# ${mod.name}\n\n> No symbols found in source.\n`
    );
    continue;
  }

  const coveragePct = totalSymbols > 0
    ? Math.round((documentedCount / totalSymbols) * 100)
    : 0;

  const coverageBadge =
    `> **JSDoc coverage: ${documentedCount}/${totalSymbols} symbols (${coveragePct}%)**\n`;

  const content =
    `# ${mod.name}\n\n` +
    coverageBadge + "\n" +
    fileSections.join("\n\n---\n\n") + "\n";

  writeFileSync(`docs/api/${mod.name}.md`, content);
  console.log(`${totalSymbols} symbols — ${coveragePct}% JSDoc coverage`);
}

console.log("\nDone.");