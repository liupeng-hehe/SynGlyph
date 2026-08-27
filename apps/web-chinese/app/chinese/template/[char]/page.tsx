import { redirect } from "next/navigation";

/** Alias: template view redirects to glyph preview (same data path). */
export default function ChineseTemplatePage({ params }: { params: { char: string } }) {
  redirect(`/chinese/glyph/${encodeURIComponent(params.char)}`);
}
