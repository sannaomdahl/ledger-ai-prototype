import { Suspense } from "react"

import { BookkeepingFallback, BookkeepingView } from "@/components/bookkeeping/bookkeeping-view"

export default async function BookkeepingPage({
  params,
}: PageProps<"/clients/[clientId]/bookkeeping">) {
  const { clientId } = await params
  // The view reads ?view= and ?prepare=, so it renders on the client under
  // this boundary; the static HTML shows the invoices until then.
  return (
    <Suspense fallback={<BookkeepingFallback clientId={clientId} />}>
      <BookkeepingView clientId={clientId} />
    </Suspense>
  )
}
