// Client-side evaluation of a ReUI Filters query, lifted from the
// data-grid-filtering-2 block so every grid in the app filters the same way.
import type { FilterCondition } from "@/components/reui/filters/filters-query"

/** Operators that take no value, so an empty `values` list is expected. */
const VALUELESS_OPERATORS = new Set(["empty", "not_empty"])

export function getActiveFilters(filters: FilterCondition[]) {
  return filters.filter((filter) => {
    const { operator, values } = filter
    if (VALUELESS_OPERATORS.has(operator)) return true
    if (!values || values.length === 0) return false
    if (
      values.every((value) => typeof value === "string" && value.trim() === "")
    ) {
      return false
    }
    if (values.every((value) => value === null || value === undefined)) {
      return false
    }
    if (values.every((value) => Array.isArray(value) && value.length === 0)) {
      return false
    }
    return true
  })
}

function matchesFilterCondition(
  fieldValue: unknown,
  operator: string,
  values: unknown[]
): boolean {
  switch (operator) {
    case "is":
      return values.includes(fieldValue)
    case "is_not":
      return !values.includes(fieldValue)
    case "is_any_of":
      return values.some((value) => fieldValue === value)
    case "is_none_of":
      return !values.some((value) => fieldValue === value)
    case "contains": {
      const tokens = values.map((value) => String(value).trim()).filter(Boolean)
      if (tokens.length === 0) return true
      return tokens.some((token) =>
        String(fieldValue).toLowerCase().includes(token.toLowerCase())
      )
    }
    case "not_contains":
      return !values.some((value) =>
        String(fieldValue).toLowerCase().includes(String(value).toLowerCase())
      )
    case "empty":
      return fieldValue === "" || fieldValue == null
    case "not_empty":
      return fieldValue !== "" && fieldValue != null
    default:
      return true
  }
}

/** A field with several values, like a line's anomalies: "is" matches
    when any of them does, "is not" when none does. */
function matchesList(list: unknown[], operator: string, values: unknown[]) {
  if (operator === "empty") return list.length === 0
  if (operator === "not_empty") return list.length > 0
  if (operator === "is_not" || operator === "is_none_of" || operator === "not_contains")
    return list.every((value) => matchesFilterCondition(value, operator, values))
  return list.some((value) => matchesFilterCondition(value, operator, values))
}

export function applyFilters<T>(
  data: T[],
  filters: FilterCondition[],
  fieldValue: (row: T, field: string) => unknown
): T[] {
  let result = [...data]

  getActiveFilters(filters).forEach(({ field, operator, values, negated }) => {
    result = result.filter((row) => {
      const raw = fieldValue(row, field)
      const matches = Array.isArray(raw)
        ? matchesList(raw, operator, values)
        : matchesFilterCondition(raw ?? "", operator, values)
      // A chip negated from its menu keeps its operator and flips its meaning.
      return negated ? !matches : matches
    })
  })

  return result
}

export function renderSingleSelectedLabel(
  values: unknown[],
  options: { value: string; label: string }[]
) {
  if (values.length === 0) return "Select..."
  if (values.length > 1) return `${values.length} selected`
  const option = options.find((item) => item.value === values[0])
  return option?.label ?? String(values[0])
}
