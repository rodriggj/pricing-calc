/**
 * Determinism verification script.
 *
 * Runs the contract harness twice in succession (against a clean `out/` each
 * time, with the same fixture set and same seed) and asserts the diff of `out/`
 * between the two runs is empty. Exits non-zero on any byte difference.
 *
 * Satisfies: FR-Harness AC-6, complements Property 5 PBT (INV-5).
 *
 * Usage: pnpm contract:harness:verify-determinism
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

const OUT_DIR = path.resolve('out');
const RUN1_DIR = path.resolve('out/.determinism-run1');
const RUN2_DIR = path.resolve('out/.determinism-run2');

function cleanDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

function copyOutTo(targetDir: string): void {
  const files = fs.readdirSync(OUT_DIR).filter((f) =>
    !f.startsWith('.determinism-') && f !== 'pbt-report.json'
  );
  for (const file of files) {
    const src = path.join(OUT_DIR, file);
    const dest = path.join(targetDir, file);
    fs.copyFileSync(src, dest);
  }
}

function filesAreIdentical(dir1: string, dir2: string): { identical: boolean; differences: string[] } {
  const files1 = fs.readdirSync(dir1).sort();
  const files2 = fs.readdirSync(dir2).sort();
  const differences: string[] = [];

  // Check for missing/extra files
  const allFiles = new Set([...files1, ...files2]);
  for (const file of allFiles) {
    const inDir1 = files1.includes(file);
    const inDir2 = files2.includes(file);

    if (!inDir1) {
      differences.push(`File only in run 2: ${file}`);
      continue;
    }
    if (!inDir2) {
      differences.push(`File only in run 1: ${file}`);
      continue;
    }

    // Compare contents
    const content1 = fs.readFileSync(path.join(dir1, file));
    const content2 = fs.readFileSync(path.join(dir2, file));
    if (!content1.equals(content2)) {
      differences.push(`Content differs: ${file}`);
    }
  }

  return { identical: differences.length === 0, differences };
}

function main(): void {
  // Use a fixed seed for both runs to ensure PBT generates identical cases
  const seed = '0xDEADBEEF';

  console.log('Determinism verification: running harness twice with same seed...\n');

  // Clean output directories
  cleanDir(RUN1_DIR);
  cleanDir(RUN2_DIR);

  // Run 1
  console.log('Run 1...');
  execSync(`pnpm contract:harness --seed ${seed}`, { stdio: 'pipe' });
  copyOutTo(RUN1_DIR);

  // Clean out/ for run 2 (remove non-determinism-check files)
  const outFiles = fs.readdirSync(OUT_DIR).filter((f) => !f.startsWith('.determinism-'));
  for (const file of outFiles) {
    fs.unlinkSync(path.join(OUT_DIR, file));
  }

  // Run 2
  console.log('Run 2...');
  execSync(`pnpm contract:harness --seed ${seed}`, { stdio: 'pipe' });
  copyOutTo(RUN2_DIR);

  // Compare
  console.log('\nComparing outputs...');
  const { identical, differences } = filesAreIdentical(RUN1_DIR, RUN2_DIR);

  // Clean up temp directories
  fs.rmSync(RUN1_DIR, { recursive: true });
  fs.rmSync(RUN2_DIR, { recursive: true });

  if (identical) {
    console.log('✓ Determinism verified: both runs produced byte-identical output.');
    process.exit(0);
  } else {
    console.error('✗ Determinism check FAILED. Differences:');
    for (const diff of differences) {
      console.error(`  - ${diff}`);
    }
    process.exit(1);
  }
}

main();
