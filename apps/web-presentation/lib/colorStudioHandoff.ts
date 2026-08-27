/** In-app BYO → Color Studio route (same Next.js site). */

export function colorStudioHref(profileId: string, displayName?: string): string {
  const q = new URLSearchParams({ profileId });
  if (displayName?.trim()) q.set("name", displayName.trim());
  return `/build-your-own/studio?${q.toString()}`;
}

export function navigateToColorStudio(
  router: { push: (href: string) => void },
  session: { profileId: string; displayName: string },
): void {
  router.push(colorStudioHref(session.profileId, session.displayName));
}
