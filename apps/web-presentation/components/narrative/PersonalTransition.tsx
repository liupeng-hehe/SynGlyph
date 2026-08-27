import Link from "next/link";

import { personalTransitionContent } from "@/content/personalTransition";

export function PersonalTransition() {
  return (
    <div className="personal-transition">
      <p className="personal-transition__hint m-0 font-body text-xs">
        {personalTransitionContent.hint}
      </p>
      <p className="personal-transition__lead mt-2 font-body text-sm">
        {personalTransitionContent.lead}
      </p>
      <div className="personal-transition__panel narrative-card mt-4 p-6">
        <p className="m-0 font-body text-sm leading-relaxed text-[color:var(--text-body)]">
          {personalTransitionContent.placeholder}
        </p>
        <p className="mt-6">
          <Link
            href={personalTransitionContent.href}
            className="personal-transition__cta inline-block font-body text-sm no-underline"
          >
            {personalTransitionContent.buttonLabel}
          </Link>
        </p>
      </div>
    </div>
  );
}
