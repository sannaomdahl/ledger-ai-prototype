import { notFound } from "next/navigation"

import { OnboardingCasePage } from "@/components/onboarding/onboarding-case"
import { REGISTER, REGISTER_BY_ID } from "@/lib/accounting/onboarding"

// Every company that can be onboarded is in the (mock) register, so each
// case page can be pre-rendered for the static export, including ones the
// accountant adds later with "New customer".
export const dynamicParams = false

export function generateStaticParams() {
  return REGISTER.map((company) => ({ caseId: company.id }))
}

export default async function OnboardingCaseRoute({
  params,
}: PageProps<"/onboarding/[caseId]">) {
  const { caseId } = await params
  if (!REGISTER_BY_ID.has(caseId)) notFound()
  return <OnboardingCasePage caseId={caseId} />
}
