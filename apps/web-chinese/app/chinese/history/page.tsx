import Link from "next/link";

export default function ChineseHistoryPage() {
  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="mb-4 text-xl font-medium text-stone-900">中文标注历史</h1>
      <p className="text-sm text-stone-600">
        会话列表已移至<strong className="text-stone-800">主控制台</strong>：在首页选择字典后即可查看该字典下的会话并进入标注。
      </p>
      <Link href="/chinese" className="mt-6 inline-block text-sky-800 underline">
        返回主控制台
      </Link>
    </main>
  );
}
