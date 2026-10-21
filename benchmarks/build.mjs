import { build } from "esbuild";
import { mkdir, cp, copyFile } from "node:fs/promises";
await mkdir("dist", { recursive: true });
await build({ entryPoints: ["worker.ts"], bundle: true, minify: true, outfile: "dist/worker.js", platform: "browser" });
await cp("node_modules/@spotify/basic-pitch/model", "dist/model", { recursive: true });
await copyFile("node_modules/@spotify/basic-pitch/LICENSE", "dist/MODEL-LICENSE.txt");
await copyFile("index.html", "dist/index.html");
