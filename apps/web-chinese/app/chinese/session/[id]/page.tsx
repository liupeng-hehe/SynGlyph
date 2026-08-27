import { ChineseAnnotateClient } from "@/components/chinese/ChineseAnnotateClient";

export default function ChineseSessionPage({ params }: { params: { id: string } }) {
  return <ChineseAnnotateClient sessionId={params.id} />;
}
