import type { ReportBlock } from "@/lib/types";

/**
 * Lightweight, approximate Markdown → ReportBlock[] for the edit-mode live
 * preview only. The authoritative parse happens server-side on save
 * (app/services/reports/mdblocks.py); this is deliberately forgiving.
 */
export function mdToBlocks(md: string): ReportBlock[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReportBlock[] = [];
  let para: string[] = [];
  let table: string[][] | null = null;
  let tableCols: string[] | null = null;

  const flushPara = () => {
    if (para.length) {
      blocks.push({ type: "paragraph", text: para.join(" ").trim() });
      para = [];
    }
  };
  const flushTable = () => {
    if (tableCols && table) {
      blocks.push({ type: "table", columns: tableCols, rows: table });
    }
    table = null;
    tableCols = null;
  };

  const cells = (row: string) =>
    row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

  for (const raw of lines) {
    const line = raw.trimEnd();

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushPara();
      flushTable();
      blocks.push({ type: "heading", level: h[1].length, text: h[2].trim() });
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushPara();
      if (/^\s*\|?[\s:-]+\|[\s:|-]*$/.test(line)) continue; // separator row
      if (!tableCols) tableCols = cells(line);
      else (table ??= []).push(cells(line));
      continue;
    }
    flushTable();

    if (!line.trim()) {
      flushPara();
      continue;
    }

    // treat a bullet line as its own short paragraph so key/value lists stay legible
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      flushPara();
      blocks.push({ type: "paragraph", text: bullet[1].trim() });
      continue;
    }

    para.push(line.trim());
  }
  flushPara();
  flushTable();
  return blocks;
}
