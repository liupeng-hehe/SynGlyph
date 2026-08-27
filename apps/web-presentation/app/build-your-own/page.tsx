import { Raleway } from "next/font/google";

import { BuildYourOwnLab } from "@/components/buildYourOwn/BuildYourOwnLab";

const raleway = Raleway({
  subsets: ["latin"],
  variable: "--font-raleway",
  weight: ["100", "200", "300"],
});

export default function BuildYourOwnPage() {
  return (
    <div className={raleway.variable}>
      <BuildYourOwnLab />
    </div>
  );
}
