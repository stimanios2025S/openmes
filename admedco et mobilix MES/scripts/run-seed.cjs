const { buildSync } = require("esbuild");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { randomUUID } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const output = join(tmpdir(), `admedco-seed-${randomUUID()}.cjs`);
buildSync({ entryPoints: [join(process.cwd(), "prisma/seed.ts")], outfile: output, bundle: true, platform: "node", format: "cjs", packages: "external" });
process.exit(spawnSync(process.execPath, [output], { stdio: "inherit", env: process.env }).status ?? 1);

