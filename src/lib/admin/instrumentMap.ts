/** Matching eLP laboratory names to the app's accounts. Client- and server-safe. */

/** "AMNAJCHAROEN HOSP.  รพ. อำนาจเจริญ" -> "AMNAJCHAROEN HOSP." (the English part only). */
export function englishLabName(lab: string): string {
  return lab.split(/\s{2,}|[฀-๿]/)[0].trim();
}

/** eLP and the app spell the same lab slightly differently (HOSP. / HOSPITAL, CO.,LTD). */
export function normalizeName(s: string): string {
  return s
    .toUpperCase()
    .replace(/\bHOSP\b\.?/g, "HOSPITAL")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\b(CO|LTD|LIMITED|THE|OF|AND|PUBLIC|COMPANY)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export const instrumentKey = (serial: string, systemClass: string) => `${serial}|${systemClass}`;
