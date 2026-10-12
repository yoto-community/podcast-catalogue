/**
 * `pnpm release` — Unified release pipeline.
 *
 * Orchestrates: build → build:episodes → site:build → git tag → gh release create → npm publish
 *
 * Usage:
 *   pnpm release              # Interactive, prompts for version bump
 *   pnpm release --dry-run    # Shows steps without executing
 *   pnpm release --patch      # Auto-bump patch
 *   pnpm release --minor      # Auto-bump minor
 *   pnpm release --major      # Auto-bump major
 *   pnpm release --version 2026.10.11-42  # Explicit version (catalog version format)
 */
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { catalogVersion, gitInfo } from "./lib/version.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

interface ReleaseOptions {
  dryRun: boolean;
  versionBump?: "patch" | "minor" | "major";
  explicitVersion?: string;
  skipBuild: boolean;
  skipEpisodes: boolean;
  skipSite: boolean;
  skipSearchIndex: boolean;
  skipTag: boolean;
  skipGitHubRelease: boolean;
  skipNpmPublish: boolean;
  skipChangelog: boolean;
  push: boolean;
}

function parseArgs(argv: string[]): ReleaseOptions {
  return {
    dryRun: argv.includes("--dry-run"),
    versionBump: argv.includes("--major") ? "major" : argv.includes("--minor") ? "minor" : argv.includes("--patch") ? "patch" : undefined,
    explicitVersion: argv.includes("--version") ? argv[argv.indexOf("--version") + 1] : undefined,
    skipBuild: argv.includes("--skip-build"),
    skipEpisodes: argv.includes("--skip-episodes"),
    skipSite: argv.includes("--skip-site"),
    skipSearchIndex: argv.includes("--skip-search-index"),
    skipTag: argv.includes("--skip-tag"),
    skipGitHubRelease: argv.includes("--skip-github-release"),
    skipNpmPublish: argv.includes("--skip-npm-publish"),
    skipChangelog: argv.includes("--skip-changelog"),
    push: !argv.includes("--no-push"),
  };
}

function run(cmd: string, opts: { cwd?: string; dryRun?: boolean; silent?: boolean } = {}): { stdout: string; stderr: string; status: number } {
  const { cwd = ROOT, dryRun = false, silent = false } = opts;
  if (dryRun) {
    console.log(`  $ ${cmd}`);
    return { stdout: "", stderr: "", status: 0 };
  }
  if (!silent) console.log(`  $ ${cmd}`);
  try {
    const result = execSync(cmd, { cwd, encoding: "utf8", stdio: silent ? "ignore" : "pipe" });
    return { stdout: result.trim(), stderr: "", status: 0 };
  } catch (err: unknown) {
    const error = err as { stdout?: Buffer; stderr?: Buffer; status?: number; message?: string };
    return {
      stdout: error.stdout?.toString() ?? "",
      stderr: error.stderr?.toString() ?? error.message ?? String(err),
      status: error.status ?? 1,
    };
  }
}

function step(name: string, fn: () => { success: boolean; message?: string }): boolean {
  console.log(`\n📦 ${name}`);
  const result = fn();
  if (result.success) {
    console.log(`  ✅ ${result.message ?? "OK"}`);
  } else {
    console.error(`  ❌ ${result.message ?? "Failed"}`);
  }
  return result.success;
}

function generateChangelog(previousTag: string, newTag: string, dryRun: boolean): string {
  const cmd = `git log ${previousTag}..HEAD --pretty=format:"- %s (%an)" --no-merges`;
  const { stdout } = run(cmd, { dryRun, silent: true });
  if (!stdout) return `## ${newTag}\n\nNo changes since ${previousTag}.\n`;

  const lines = stdout.split("\n");
  const sections: Record<string, string[]> = { feat: [], fix: [], chore: [], docs: [], refactor: [], other: [] };

  for (const line of lines) {
    const match = line.match(/^- (feat|fix|chore|docs|refactor)(?:\(.+\))?: (.+)$/);
    if (match?.[1] && match[2]) {
      const key = match[1];
      sections[key]?.push(`- ${match[2]}`);
    } else {
      sections.other?.push(line);
    }
  }

  let changelog = `## ${newTag}\n\n`;
  for (const [type, entries] of Object.entries(sections)) {
    if (entries.length === 0) continue;
    const label = type === "feat" ? "✨ Features" : type === "fix" ? "🐛 Fixes" : type === "chore" ? "🔧 Chores" : type === "docs" ? "📚 Docs" : type === "refactor" ? "♻️ Refactors" : "📦 Other";
    changelog += `### ${label}\n${entries.join("\n")}\n\n`;
  }
  return changelog;
}

function getPreviousTag(): string {
  const { stdout } = run("git describe --tags --abbrev=0 HEAD^ 2>/dev/null || git rev-list --max-parents=0 HEAD", { silent: true });
  return stdout.trim() || "HEAD";
}

function updateChangelogFile(newEntry: string, dryRun: boolean): void {
  const changelogPath = path.join(ROOT, "CHANGELOG.md");
  let content = "# Changelog\n\n";
  if (fs.existsSync(changelogPath)) {
    content = fs.readFileSync(changelogPath, "utf8");
  }
  const newContent = content.replace(/^# Changelog\n/, `# Changelog\n\n${newEntry}`);
  if (dryRun) {
    console.log(`  📝 Would prepend to CHANGELOG.md:\n${newEntry}`);
  } else {
    fs.writeFileSync(changelogPath, newContent);
  }
}

function createDistPackageJson(version: string, dryRun: boolean): void {
  const distDir = path.join(ROOT, "dist");
  const packageJson = {
    name: "@yoto-community/podcast-catalog",
    version,
    type: "module",
    description: "Static catalog of kids podcasts — RSS feeds validated, ready for Yoto MYO cards",
    license: "MIT",
    homepage: "https://github.com/yoto-community/podcast-catalogue",
    repository: { type: "git", url: "https://github.com/yoto-community/podcast-catalogue.git" },
    bugs: { url: "https://github.com/yoto-community/podcast-catalogue/issues" },
    main: "./catalog.json",
    types: "./index.d.ts",
    exports: {
      ".": "./catalog.json",
      "./fr": "./fr.json",
      "./en": "./en.json",
      "./episodes/*": "./episodes/*.json",
    },
    files: ["*.json", "fr/", "en/", "episodes/"],
    publishConfig: { access: "public", registry: "https://registry.npmjs.org/" },
  };

  const pkgPath = path.join(distDir, "package.json");
  if (dryRun) {
    console.log(`  📝 Would write dist/package.json:`);
    console.log(JSON.stringify(packageJson, null, 2));
  } else {
    fs.writeFileSync(pkgPath, JSON.stringify(packageJson, null, 2) + "\n");
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const info = gitInfo();
  const currentVersion = catalogVersion(info);

  // Determine release version
  let releaseVersion: string;
  if (opts.explicitVersion) {
    releaseVersion = opts.explicitVersion;
  } else if (opts.versionBump) {
    // For catalog version format YYYY.MM.DD-N, we don't semver bump — just use current
    console.warn(`⚠️  Catalog version is date-based (${currentVersion}); --patch/--minor/--major ignored. Use --version for explicit.`);
    releaseVersion = currentVersion;
  } else {
    releaseVersion = currentVersion;
  }

  const tagName = `v${releaseVersion}`;
  const previousTag = getPreviousTag();

  console.log(`\n🚀 Release Pipeline — ${tagName}`);
  console.log(`   Previous tag: ${previousTag}`);
  console.log(`   Dry run: ${opts.dryRun ? "YES" : "NO"}`);
  console.log(`   Push: ${opts.push ? "YES" : "NO"}`);

  if (opts.dryRun) {
    console.log("\n📋 Steps that would execute:");
  }

  // Step 1: Build catalog
  if (!opts.skipBuild) {
    const ok = step("Build catalog (pnpm build)", () => {
      const { status } = run("pnpm build", { dryRun: opts.dryRun });
      return { success: status === 0, message: status === 0 ? "Catalog built" : "Build failed" };
    });
    if (!ok && !opts.dryRun) process.exit(1);
  }

  // Step 2: Build episodes
  if (!opts.skipEpisodes) {
    const ok = step("Build episodes (pnpm build:episodes)", () => {
      const { status } = run("pnpm build:episodes", { dryRun: opts.dryRun });
      return { success: status === 0, message: status === 0 ? "Episodes built" : "Episodes build failed" };
    });
    if (!ok && !opts.dryRun) process.exit(1);
  }

  // Step 2.5: Build search index
  if (!opts.skipEpisodes && !opts.skipSite && !opts.skipSearchIndex) {
    const ok = step("Build search index (pnpm build:search-index)", () => {
      const { status } = run("pnpm build:search-index", { dryRun: opts.dryRun });
      return { success: status === 0, message: status === 0 ? "Search index built" : "Search index build failed" };
    });
    if (!ok && !opts.dryRun) process.exit(1);
  }

  // Step 3: Build site
  if (!opts.skipSite) {
    const ok = step("Build site (pnpm site:build)", () => {
      const { status } = run("pnpm site:build", { dryRun: opts.dryRun });
      return { success: status === 0, message: status === 0 ? "Site built" : "Site build failed" };
    });
    if (!ok && !opts.dryRun) process.exit(1);
  }

  // Step 4: Validate dist
  const okValidate = step("Validate dist (pnpm validate:dist)", () => {
    const { status } = run("pnpm validate:dist", { dryRun: opts.dryRun });
    return { success: status === 0, message: status === 0 ? "Dist valid" : "Dist validation failed" };
  });
  if (!okValidate && !opts.dryRun) process.exit(1);

  // Step 5: Create dist/package.json for npm
  if (!opts.skipNpmPublish) {
    step("Create dist/package.json", () => {
      createDistPackageJson(releaseVersion, opts.dryRun);
      return { success: true, message: "dist/package.json created" };
    });
  }

  // Step 6: Generate changelog
  let changelogEntry = "";
  if (!opts.skipChangelog) {
    changelogEntry = generateChangelog(previousTag, tagName, opts.dryRun);
    step("Generate changelog", () => {
      updateChangelogFile(changelogEntry, opts.dryRun);
      return { success: true, message: "Changelog updated" };
    });
  }

  // Step 7: Git commit (changelog + any changes)
  if (!opts.dryRun && !opts.skipTag) {
    const { status } = run("git diff --quiet || git add -A && git commit -m \"chore: release " + tagName + "\"", { dryRun: false });
    if (status !== 0) console.warn("  ⚠️  No changes to commit or commit failed");
  }

  // Step 8: Create git tag
  if (!opts.skipTag) {
    const ok = step(`Create git tag ${tagName}`, () => {
      const { status } = run(`git tag -a ${tagName} -m "Release ${tagName}"`, { dryRun: opts.dryRun });
      return { success: status === 0, message: status === 0 ? "Tag created" : "Tag creation failed" };
    });
    if (!ok && !opts.dryRun) process.exit(1);
  }

  // Step 9: Push tag (and commits)
  if (opts.push && !opts.skipTag && !opts.dryRun) {
    const ok = step("Push tag to origin", () => {
      const { status } = run(`git push origin ${tagName}`, { dryRun: false });
      return { success: status === 0, message: status === 0 ? "Tag pushed" : "Push failed" };
    });
    if (!ok) process.exit(1);
  }

  // Step 10: GitHub Release (triggered by tag push in CI, but can run locally)
  if (!opts.skipGitHubRelease && !opts.dryRun) {
    step("Create GitHub Release", () => {
      // This is now handled by CI on tag push — just verify gh is available
      const { status } = run("gh --version", { silent: true });
      if (status !== 0) return { success: false, message: "gh CLI not available" };
      return { success: true, message: "Release will be created by CI on tag push" };
    });
  }

  // Step 11: npm publish (from dist/)
  if (!opts.skipNpmPublish && !opts.dryRun) {
    step("Publish to npm", () => {
      const distDir = path.join(ROOT, "dist");
      const { status } = run("npm publish --access public", { cwd: distDir, dryRun: false });
      return { success: status === 0, message: status === 0 ? "Published to npm" : "npm publish failed" };
    });
  }

  console.log(`\n🎉 Release ${tagName} complete!`);
  if (opts.dryRun) console.log("   (dry run — no changes made)");
}

main().catch((err) => {
  console.error("❌ Release failed:", err);
  process.exit(1);
});