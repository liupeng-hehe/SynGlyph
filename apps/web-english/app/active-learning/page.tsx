import { redirect } from "next/navigation";

/** Alias: queue UI lives at `/workbench`. */
export default function ActiveLearningAliasPage() {
  redirect("/workbench");
}
