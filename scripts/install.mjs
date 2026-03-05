/**
 * Installs the built plugin into Obsidian's plugin directory.
 * Reads the vault path from OBSIDIAN_VAULT env var, or defaults to the
 * vault one level up from this package.
 */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(__dirname, "..");

// Determine the Obsidian vault root
const vaultRoot = process.env.OBSIDIAN_VAULT
  ? path.resolve(process.env.OBSIDIAN_VAULT)
  : path.resolve(pluginDir, "../");

const destDir = path.join(vaultRoot, ".obsidian/plugins/commoncortex");

await fs.mkdir(destDir, { recursive: true });

for (const file of ["main.js", "manifest.json", "styles.css"]) {
  const src = path.join(pluginDir, file);
  const dest = path.join(destDir, file);
  await fs.copyFile(src, dest);
  console.log(`✅ Copied ${file} → ${dest}`);
}

console.log(`\n🎉 Plugin installed to ${destDir}`);
console.log("   Reload Obsidian (Cmd+R) or toggle the plugin in Community Plugins to activate.");
