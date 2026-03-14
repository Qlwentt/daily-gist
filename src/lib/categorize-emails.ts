import type { RawEmailRow } from "@/lib/generate-episode";

export type CategorizationRule = {
  sender_email: string;
  from_name_pattern: string | null;
  subject_pattern: string | null;
  category: string;
  priority: number;
};

/**
 * Match an email against categorization rules (sorted by priority descending).
 * Returns the matched category slug, or null if no rule matches.
 */
export function matchCategory(
  email: RawEmailRow,
  rules: CategorizationRule[]
): string | null {
  const matching = rules.filter(
    (r) => r.sender_email === email.from_email
  );

  // Try rules with patterns first (already sorted by priority)
  const patternRule = matching.find((r) => {
    const hasPattern = r.from_name_pattern || r.subject_pattern;
    if (!hasPattern) return false;
    if (r.from_name_pattern) {
      const nameMatch = email.from_name
        ?.toLowerCase()
        .includes(r.from_name_pattern.toLowerCase());
      if (!nameMatch) return false;
    }
    if (r.subject_pattern) {
      const subjectMatch = email.subject
        ?.toLowerCase()
        .includes(r.subject_pattern.toLowerCase());
      if (!subjectMatch) return false;
    }
    return true;
  });
  if (patternRule) return patternRule.category;

  // Fall back to catch-all (no patterns)
  const catchAll = matching.find(
    (r) => !r.from_name_pattern && !r.subject_pattern
  );
  return catchAll?.category ?? null;
}

/**
 * Group emails by matched category. Returns a map of category → emails.
 * Emails that don't match any rule are collected under the null key.
 */
export function groupEmailsByCategory(
  emails: RawEmailRow[],
  rules: CategorizationRule[]
): Map<string | null, RawEmailRow[]> {
  const grouped = new Map<string | null, RawEmailRow[]>();

  for (const email of emails) {
    const category = matchCategory(email, rules);
    if (!grouped.has(category)) {
      grouped.set(category, []);
    }
    grouped.get(category)!.push(email);
  }

  return grouped;
}
