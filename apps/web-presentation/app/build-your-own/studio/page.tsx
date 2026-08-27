import { ColorStudioPage } from "@/components/colorStudio/ColorStudioPage";
import { PassageFontProvider } from "@/components/colorStudio/PassageFontProvider";

export const dynamic = "force-dynamic";

type Props = {
  searchParams?: { profileId?: string; name?: string };
};

export default function BuildYourOwnStudioPage({ searchParams }: Props) {
  return (
    <PassageFontProvider>
      <ColorStudioPage
        profileId={searchParams?.profileId?.trim() || null}
        displayName={searchParams?.name?.trim() || null}
      />
    </PassageFontProvider>
  );
}
