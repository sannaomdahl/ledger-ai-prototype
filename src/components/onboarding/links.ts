/** The company's onboarding page. A plain link (it opens a new tab or goes in
    an email), so the base path is added by hand. */
export function welcomeHref(caseId: string) {
  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/welcome/${caseId}`
}
