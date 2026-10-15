import type { Metadata } from "next"
import { Geist } from "next/font/google"

import { KundeDashboard } from "@/components/kunde/kunde-dashboard"
import { FIRM } from "@/components/kunde/data"

// sanna.no sets its headings in Geist; the customer surface uses it for
// everything. The variable shadows the root layout's --font-sans (Inter)
// for this page only.
const geist = Geist({ variable: "--font-sans", subsets: ["latin"] })

export const metadata: Metadata = {
  title: `${FIRM.name} · Sanna`,
  description: "Kundeappen slik den kan se ut for et konsulentselskap.",
}

/** The Sanna-style customer view: /kunde. Dummy data, no store. */
export default function KundePage() {
  return <KundeDashboard className={geist.variable} />
}
