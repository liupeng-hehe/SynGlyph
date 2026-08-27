import {
  Cormorant_Garamond,
  Crimson_Pro,
  IBM_Plex_Sans,
  Josefin_Sans,
  Lexend,
  Literata,
  Manrope,
  Montserrat,
  Outfit,
  Raleway,
  Tenor_Sans,
  Work_Sans,
} from "next/font/google";

const cormorantGaramond = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-cormorant-garamond",
  weight: ["300", "400"],
});

const raleway = Raleway({
  subsets: ["latin"],
  variable: "--font-raleway",
  weight: ["100", "200", "300"],
});

const josefinSans = Josefin_Sans({
  subsets: ["latin"],
  variable: "--font-josefin-sans",
  weight: ["200", "300"],
});

const crimsonPro = Crimson_Pro({
  subsets: ["latin"],
  variable: "--font-crimson-pro",
  weight: ["200", "300", "400"],
});

const tenorSans = Tenor_Sans({
  subsets: ["latin"],
  variable: "--font-tenor-sans",
  weight: ["400"],
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  weight: ["100", "200", "300"],
});

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  weight: ["100", "200", "300"],
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  weight: ["200", "300", "400"],
});

const workSans = Work_Sans({
  subsets: ["latin"],
  variable: "--font-work-sans",
  weight: ["100", "200", "300"],
});

const lexend = Lexend({
  subsets: ["latin"],
  variable: "--font-lexend",
  weight: ["100", "200", "300"],
});

const literata = Literata({
  subsets: ["latin"],
  variable: "--font-literata",
  weight: ["200", "300", "400"],
});

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-ibm-plex-sans",
  weight: ["100", "200", "300"],
});

const fontVariables = [
  cormorantGaramond.variable,
  raleway.variable,
  josefinSans.variable,
  crimsonPro.variable,
  tenorSans.variable,
  outfit.variable,
  montserrat.variable,
  manrope.variable,
  workSans.variable,
  lexend.variable,
  literata.variable,
  ibmPlexSans.variable,
].join(" ");

export function PassageFontProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className={fontVariables}>{children}</div>;
}
