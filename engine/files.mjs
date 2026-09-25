/** Reading and writing the JSON files a workspace keeps, and delivering files without clobbering shipped ones. */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/** Parse a JSON file; a broken one names itself in the error. */
export function readJson(path) {
  const text = readFileSync(path, 'utf8');
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${path} is not valid JSON (${error.message}); fix it by hand`, { cause: error });
  }
}

/** Write `value` as indented JSON with a final newline, making its folder if needed. */
export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

/**
 * Copy `files` into `dir`. A file already there with the same bytes is
 * left alone; one that differs is shipped, so it is kept unless `overwrite`.
 * Returns {copied, same, held}, each a list of destination paths.
 */
export function deliverFiles(files, dir, { overwrite = false } = {}) {
  const result = { copied: [], same: [], held: [] };
  for (const file of files) {
    const to = join(dir, basename(file));
    if (existsSync(to)) {
      if (readFileSync(to).equals(readFileSync(file))) {
        result.same.push(to);
        continue;
      }
      if (!overwrite) {
        result.held.push(to);
        continue;
      }
    }
    mkdirSync(dir, { recursive: true });
    copyFileSync(file, to);
    result.copied.push(to);
  }
  return result;
}
