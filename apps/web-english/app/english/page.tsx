import Link from "next/link";

export default function EnglishProductHomePage() {
  return (
    <main className="mx-auto max-w-2xl p-8 text-white/90">
      <h1 className="mb-2 text-2xl font-semibold">English Annotation</h1>
      <p className="mb-6 text-sm text-white/55">
        英文标注产品入口，与中文 <code className="text-white/70">/api/chinese/*</code> 完全隔离。原有数据集、刺激词与{" "}
        <Link href="/" className="text-sky-400 underline">
          主控制台选词后进入标注
        </Link>{" "}
        仍在此应用中运行（遗留路由）。
      </p>
      <ul className="space-y-3 text-sky-300/90">
        <li>
          <Link href="/english/session/new" className="hover:underline">
            新建产品会话（占位）
          </Link>
        </li>
        <li>
          <Link href="/english/history" className="hover:underline">
            历史
          </Link>
        </li>
        <li>
          <Link href="/" className="hover:underline">
            返回主控制台（数据集 / 滚动选词）
          </Link>
        </li>
      </ul>
    </main>
  );
}
