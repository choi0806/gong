export const MAX_FILE_SIZE = 5 * 1024 * 1024;
export const MAX_FILES = 2;

export async function extractText(file: File): Promise<string> {
  if (file.size > MAX_FILE_SIZE) throw new Error("파일 하나당 5MB까지 올릴 수 있어요.");
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!["pdf", "docx", "txt"].includes(extension || "")) throw new Error("PDF, DOCX, TXT 파일을 올려주세요.");
  let text = "";
  if (extension === "txt") text = await file.text();
  if (extension === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    text = result.value;
  }
  if (extension === "pdf") {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    const task = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      cMapUrl: "/pdf-assets/cmaps/", cMapPacked: true,
      standardFontDataUrl: "/pdf-assets/standard_fonts/", wasmUrl: "/pdf-assets/wasm/",
    });
    try {
      const document = await task.promise;
      if (document.numPages > 60) throw new Error("60쪽 이내의 이력서나 포트폴리오를 올려주세요.");
      const pages: string[] = [];
      for (let n = 1; n <= document.numPages; n++) {
        const page = await document.getPage(n);
        const content = await page.getTextContent();
        pages.push(content.items.map(item => "str" in item ? item.str : "").join(" "));
        page.cleanup();
      }
      text = pages.join("\n");
    } finally { await task.destroy(); }
  }
  if (text.trim().length < 20) throw new Error("읽을 수 있는 텍스트가 부족해요. 스캔 이미지 대신 텍스트가 포함된 파일을 올려주세요.");
  return text.slice(0, 150_000);
}
