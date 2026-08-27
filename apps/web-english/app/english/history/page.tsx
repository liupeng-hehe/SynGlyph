import Link from "next/link";

export default function EnglishHistoryPage() {
  return (
    <main className="mx-auto max-w-lg p-8 text-white/85">
      <h1 className="mb-4 text-xl font-medium">English annotation history</h1>
      <p className="text-sm text-white/50">
        v1：产品级会话列表可后续按 <code className="text-white/70">english_annotation_sessions</code> 查询；当前请通过 API 或会话 id 访问。
      </p>
      <Link href="/english" className="mt-6 inline-block text-sky-400 hover:underline">
        返回
      </Link>
    </main>
  );
}
