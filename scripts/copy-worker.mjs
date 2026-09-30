import { copyFile, cp, mkdir } from "node:fs/promises";
await mkdir("public", { recursive: true });
await copyFile("node_modules/pdfjs-dist/build/pdf.worker.min.mjs", "public/pdf.worker.min.mjs");
for (const directory of ["cmaps", "standard_fonts", "wasm"]) {
  await cp(`node_modules/pdfjs-dist/${directory}`, `public/pdf-assets/${directory}`, { recursive: true });
}
