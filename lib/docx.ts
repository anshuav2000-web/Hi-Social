import "server-only";
import mammoth from "mammoth";

export type DocxParseResult = {
  /** Non-empty paragraphs, in document order. */
  paragraphs: string[];
  text: string;
};

/** Extract plain text from a .docx (Office Open XML) file. */
export async function extractDocxText(buffer: Buffer): Promise<DocxParseResult> {
  const result = await mammoth.extractRawText({ buffer });
  const text = (result.value ?? "").replace(/\r/g, "");
  const paragraphs = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return { paragraphs, text };
}
