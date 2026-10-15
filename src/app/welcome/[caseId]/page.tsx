import { notFound } from "next/navigation"

import { WelcomePage } from "@/components/onboarding/welcome-page"
import { REGISTER, REGISTER_BY_ID } from "@/lib/accounting/onboarding"

// The link a company gets with its offer. No login: the link is the access.
// Pre-rendered per register company for the static export.
export const dynamicParams = false

export function generateStaticParams() {
  return REGISTER.map((company) => ({ caseId: company.id }))
}

export async function generateMetadata({ params }: PageProps<"/welcome/[caseId]">) {
  const { caseId } = await params
  const company = REGISTER_BY_ID.get(caseId)
  return { title: company ? `${company.name} · getting started with Sanna` : "Sanna" }
}

export default async function WelcomeRoute({ params }: PageProps<"/welcome/[caseId]">) {
  const { caseId } = await params
  if (!REGISTER_BY_ID.has(caseId)) notFound()
  return <WelcomePage caseId={caseId} />
}
