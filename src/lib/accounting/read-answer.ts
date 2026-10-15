// What the agent makes of an answer, written by the customer in their app
// or noted by the accountant: it reads the words, not a script. Each rule
// below is one thing an answer can settle (a lost receipt, a private
// purchase, which car was filled, who was at the dinner). When nothing in
// the answer is readable the caller falls back to the demo's canned
// outcome, with the answer quoted first.
//
// When an answer shows that the way a supplier has been booked is wrong
// (a passenger car's fuel with VAT deducted), the agent also looks back
// over the fiscal year for the same mistake: `Suggestion.lookBack`.
import { ENTERTAINMENT_LIMIT } from "./data"
import type { Client, Evidence, ReviewItem, Suggestion } from "./types"

/** No VAT code: food and drink, passenger cars, no receipt. */
export const NO_VAT = "0 · No VAT"

export type Said = {
  text: string
  attachment?: string
  /** Who said it: the customer in their app, or the accountant's note. */
  from: "customer" | "accountant"
  /** First name of whoever answered on the customer's side. */
  name: string
}

export type Reading = {
  suggestion: Suggestion
  evidence: Evidence
}

const nok = (value: number) => `${new Intl.NumberFormat("nb-NO").format(Math.round(value))} kr`

/** The input VAT inside a gross amount, at the line's rate. */
function vatIn(amount: number, vat?: string) {
  const rate = Number(vat?.match(/Input (\d+)%/)?.[1] ?? 0)
  return Math.round((Math.abs(amount) * rate) / (100 + rate))
}

function quote(said: Said) {
  const who = said.from === "customer" ? said.name : "Your note"
  return `${who}: “${said.text.trim()}”`
}

/** "Kari, Anders, Silje + Morten (Tine)" → 4; "4 of us" → 4. */
export function headcount(text: string): number | undefined {
  const said = text.match(/\b(\d{1,2})\s*(?:people|persons|of us|pers|guests|personer|stk)\b/i)
  if (said) return Number(said[1])
  const list = text.match(/(?:attendees|attended|present|with|deltakere)\s*:?\s*([^.]+)/i)?.[1]
  if (!list) return undefined
  const names = list
    .replace(/\([^)]*\)/g, "")
    .split(/,|\+|\band\b|\bog\b|&/i)
    .map((s) => s.trim())
    .filter((s) => /^[A-ZÆØÅ]/.test(s))
  return names.length >= 2 ? names.length : undefined
}

const LOST = /\b(lost|can'?t find|cannot find|don'?t have|do not have|no receipt|never got|threw|mistet|finner ikke|har ikke)\b/i
const SPIRITS = /\b(spirits|brennevin|cocktails?|whisky|akevitt|aquavit|vodka|gin|shots?)\b/i
const PASSENGER_CAR = /\b(passenger car|personbil|my (own )?car|own car|private car|personal car|family car|tesla|golf|car)\b/i
const VAN = /\b(van|varebil|goods vehicle|klasse 2|class 2)\b/i
const PRIVATE = /\b(private|privat|personal|by mistake|wrong card|feil kort|my own)\b/i
const STAFF = /\b(staff|team|employees|ansatte|julebord|christmas party|summer party|sommerfest|just us)\b/i
const WORK = /\b(work(ed)?|helped|shift|extra help|casual|labour|labor|jobbet|vakt)\b/i
const REFUND = /\b(refund|paid back|pay(ing)? (him|her|them) back|outlay|utlegg|tilbakebetal)\b/i

/** Earlier bookings of the same counterparty this fiscal year that carry
    the input VAT the answer shows they shouldn't. */
function sameMistake(item: ReviewItem, items: ReviewItem[]) {
  const year = item.period.slice(0, 4)
  return items.filter(
    (i) =>
      i.id !== item.id &&
      i.clientId === item.clientId &&
      i.domain === "bookkeeping" &&
      i.title === item.title &&
      i.status === "booked" &&
      i.period.startsWith(year) &&
      i.period < item.period &&
      vatIn(i.amount, i.suggestion.lines[0]?.vat) > 0
  )
}

function bookkeeping(item: ReviewItem, client: Client, items: ReviewItem[], said: Said): Reading | null {
  const text = said.text
  const line = item.suggestion.lines[0]
  const amount = item.amount
  const gross = Math.abs(amount)
  const said1 = quote(said)
  // A file they sent is the evidence; otherwise the receipt we had stays it,
  // and the answer only stands in where there was nothing.
  const evidence: Evidence = said.attachment
    ? { label: item.evidence.label, attached: true, fileName: said.attachment }
    : item.evidence.attached
      ? item.evidence
      : { label: said.from === "customer" ? "Answer" : "Your note", attached: true, fileName: said.from === "customer" ? "Reply" : "Note" }

  // Fuel: which car decides the VAT (mval § 8-4).
  if (/^7000|^71/.test(line.account) || /circle k|esso|shell|uno-x|st1|fuel/i.test(item.title)) {
    if (VAN.test(text)) {
      return {
        evidence,
        suggestion: {
          lines: [{ ...line, account: "7000 Fuel", vat: "1 · Input 25%" }],
          confidence: 0.96,
          reasoning: [
            said1,
            `The van is a goods vehicle (varebil klasse 2), so the ${nok(vatIn(amount, "1 · Input 25%"))} input VAT is deductible.`,
            "Remembered for the client: fuel from now on is for the van unless a receipt says otherwise.",
          ],
        },
      }
    }
    if (PASSENGER_CAR.test(text)) {
      const earlier = sameMistake(item, items)
      const back = earlier.reduce((sum, i) => sum + vatIn(i.amount, i.suggestion.lines[0]?.vat), 0)
      return {
        evidence,
        suggestion: {
          lines: [{ ...line, account: "7000 Fuel", vat: NO_VAT }],
          confidence: 0.94,
          reasoning: [
            said1,
            `Fuel for a passenger car carries no VAT deduction (mval § 8-4): the full ${nok(gross)} goes on 7000, no input VAT.`,
            earlier.length
              ? `${earlier.length} earlier ${item.title} ${earlier.length === 1 ? "receipt" : "receipts"} this year took ${nok(back)} input VAT the same way. See below.`
              : "No earlier fuel this year was booked with VAT, so nothing to correct.",
          ],
          lookBack: earlier.length
            ? {
                itemIds: earlier.map((i) => i.id),
                vat: back,
                why: "Fuel for a passenger car: no input VAT (mval § 8-4)",
              }
            : undefined,
        },
      }
    }
  }

  // A lost receipt: still a cost when the purchase is documented, never
  // input VAT.
  if (LOST.test(text) && !said.attachment) {
    return {
      evidence: { label: "Self-made voucher", attached: true, fileName: `Egenbilag · confirmed by ${said.name}` },
      suggestion: {
        lines: [{ ...line, vat: NO_VAT }],
        confidence: 0.86,
        reasoning: [
          said1,
          `No receipt, so no input VAT: the ${nok(vatIn(amount, line.vat))} VAT is part of the cost.`,
          `Documented with a self-made voucher (egenbilag): what was bought, where, why, confirmed by ${said.name}. It holds up for the cost, not for VAT.`,
        ],
        gap: "A self-made voucher is weaker evidence than a receipt: if it happens often, the auditor will ask.",
      },
    }
  }

  // A meal: who was there decides the account, and spirits decide it all.
  if (/^73[56]0|^5990/.test(line.account) || /restaurant|bistro|cafe|kafé|bar\b/i.test(item.title)) {
    const people = headcount(text)
    if (STAFF.test(text) && !/supplier|customer|client|leverandør|kunde|\(/i.test(text)) {
      return {
        evidence,
        suggestion: {
          lines: [{ account: "5990 Staff welfare", vat: NO_VAT, amount }],
          confidence: 0.93,
          reasoning: [
            said1,
            "A meal for the staff only is welfare (5990), deductible without the per-person limit.",
            "No input VAT on food and drink (mval § 8-3), whatever the account.",
          ],
        },
      }
    }
    if (SPIRITS.test(text)) {
      return {
        evidence,
        suggestion: {
          lines: [{ account: "7360 Entertainment, not deductible", vat: NO_VAT, amount }],
          confidence: 0.95,
          reasoning: [said1, "Spirits on the bill: the whole meal is not deductible, at any amount (7360).", "No input VAT on food and drink (mval § 8-3)."],
        },
      }
    }
    if (people) {
      const each = gross / people
      const over = each > ENTERTAINMENT_LIMIT
      return {
        evidence,
        suggestion: {
          lines: [
            {
              account: over ? "7360 Entertainment, not deductible" : "7350 Entertainment, deductible",
              vat: NO_VAT,
              amount,
            },
          ],
          confidence: 0.93,
          reasoning: [
            said1,
            `${nok(gross)} ÷ ${people} people = ${nok(each)} a person, ${over ? "over" : "within"} the ${ENTERTAINMENT_LIMIT} kr limit for a deductible business meal, so ${over ? "7360. It's added back in the tax return" : "7350"}.`,
            "No input VAT on food and drink (mval § 8-3), whatever the account.",
          ],
          gap: over ? undefined : "The receipt doesn't list the drinks: with spirits on the bill the meal isn't deductible at any amount.",
        },
      }
    }
  }

  // A payment to a person: work, a refund, or something private.
  if (item.kind === "bank_line" || /^vipps/i.test(item.title)) {
    if (WORK.test(text)) {
      return {
        evidence,
        suggestion: {
          lines: [{ account: "5000 Salaries", vat: NO_VAT, amount }],
          confidence: 0.82,
          reasoning: [
            said1,
            "Paid for work, so it's pay: on the a-melding for the month it was paid, with tax withheld and employer's NI. Vipps paid it gross, so the tax is settled with the next run.",
          ],
          gap: "We need their national ID number to report them on the a-melding.",
        },
      }
    }
    if (REFUND.test(text)) {
      return {
        evidence,
        suggestion: {
          lines: [{ account: "2910 Owed to employees", vat: NO_VAT, amount }],
          confidence: 0.8,
          reasoning: [said1, "Repays something they paid for the company, so it settles 2910. The receipt for what they bought is the cost's documentation."],
          gap: "The receipt for what they bought is still missing.",
        },
      }
    }
  }

  if (PRIVATE.test(text)) {
    const owner = client.contacts[0].name.split(" ")[0]
    return {
      evidence,
      suggestion: {
        lines: [{ account: "1570 Receivable, shareholder", vat: NO_VAT, amount, counterparty: said.name }],
        confidence: 0.94,
        reasoning: [
          said1,
          `Private, so it's owed back to the company: 1570, on ${said.name}.`,
          said.name === owner
            ? `${owner} owns shares: credit to a shareholder is taxed as dividend unless it's under 100 000 kr and repaid within 60 days (sktl § 10-11 (4)). Ask for the money back now.`
            : `Taking it from ${said.name}'s next pay needs a written agreement first (aml § 14-15).`,
        ],
      },
    }
  }

  // Anything else is a purpose in their own words: it documents the line.
  if (text.trim().split(/\s+/).length >= 4 && item.issue === "unclear_purpose") {
    return {
      evidence,
      suggestion: {
        lines: item.suggestion.lines,
        confidence: 0.9,
        reasoning: [said1, `Purpose documented from the answer. Keeps ${line.account}${line.vat ? `, VAT ${line.vat}` : ""}.`],
      },
    }
  }
  return null
}

function payroll(item: ReviewItem, said: Said): Reading | null {
  const text = said.text
  const no = /\b(no|not|don'?t|haven'?t|nei|ikke|without)\b/i.test(text)
  const said1 = quote(said)
  const evidence: Evidence = said.attachment
    ? { label: item.evidence.label, attached: true, fileName: said.attachment }
    : { label: "Answer", attached: true, fileName: "Reply" }

  if (item.issue === "sick_leave") {
    if (said.attachment || (/egenmelding|doctor|sykmelding|sick note|lege/i.test(text) && !no)) {
      return {
        evidence: { label: "Sick note", attached: true, fileName: said.attachment ?? "egenmelding.pdf" },
        suggestion: {
          lines: item.suggestion.lines,
          confidence: 0.95,
          reasoning: [said1, "Documented: the sick days are paid as sick pay in the employer period (the first 16 days)."],
        },
      }
    }
    if (no) {
      const kept = item.suggestion.lines.filter((l) => !/^Sick pay/.test(l.account))
      return {
        evidence: { label: "Sick note", attached: false },
        suggestion: {
          lines: kept,
          confidence: 0.85,
          reasoning: [
            said1,
            "Without a sick note the days can't be paid as sick pay: they're left out of this run and paid with the next once a note comes in.",
          ],
          gap: "Egenmelding is up to 3 days at a time; 4 days needs a doctor's note (folketrygdloven § 8-24).",
        },
      }
    }
  }
  if (item.issue === "overtime_unapproved") {
    if (no) {
      return {
        evidence,
        suggestion: {
          lines: item.suggestion.lines.filter((l) => !/^Overtime/.test(l.account)),
          confidence: 0.95,
          reasoning: [said1, "Overtime not approved: left out of the run. The hours stay in Planday if it's approved later."],
        },
      }
    }
    return {
      evidence,
      suggestion: {
        lines: item.suggestion.lines,
        confidence: 0.97,
        reasoning: [said1, "Overtime approved: paid at 40% on top (aml § 10-6 (11))."],
      },
    }
  }
  if (item.issue === "missing_tax_card" && /\b\d{11}\b|fødselsnummer|d-nummer|national id|personnummer/i.test(text)) {
    return {
      evidence: { label: "Tax card", attached: true, fileName: "Skattekort 2026" },
      suggestion: {
        lines: item.suggestion.lines,
        confidence: 0.92,
        reasoning: [said1, "Tax card fetched from Skatteetaten with the national ID number: table withholding instead of 50%."],
      },
    }
  }
  return null
}

/** What the answer settles, or null when the agent can't read anything in
    it beyond the words themselves. */
export function readAnswer(
  item: ReviewItem,
  client: Client,
  items: ReviewItem[],
  said: Said
): Reading | null {
  if (!said.text.trim()) return null
  return item.domain === "payroll" ? payroll(item, said) : bookkeeping(item, client, items, said)
}
