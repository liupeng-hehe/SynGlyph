import { narrativeFooterDisclaimer } from "@/content/synesthesiaContent";

export function NarrativeFooter() {
  return (
    <footer
      id="narrative-footer"
      className="narrative-footer px-6 py-12 md:px-10 md:py-14"
    >
      <div className="mx-auto max-w-3xl space-y-4">
        {narrativeFooterDisclaimer.map((paragraph) => (
          <p
            key={paragraph.slice(0, 40)}
            className="m-0 font-body text-sm leading-relaxed text-[color:var(--text-body)]"
          >
            {paragraph}
          </p>
        ))}
      </div>
    </footer>
  );
}
