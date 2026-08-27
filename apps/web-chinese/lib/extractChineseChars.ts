/** 与后端 `/api/chinese/sessions/bulk` 一致的汉字提取：CJK 统一表意文字等，首次出现顺序、去重 */
const CJK_RE = /[\u3007\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufadf]/g;

export function extractChineseCharsUniqueOrdered(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const matches = text.matchAll(CJK_RE);
  for (const m of matches) {
    const ch = m[0]!;
    if (!seen.has(ch)) {
      seen.add(ch);
      out.push(ch);
    }
  }
  return out;
}
