/**
 * Placeholder seed content, not an architecture decision -- confirmed
 * with the project owner as a reasonable generic default (spec 8.1:
 * "System seeds a default degree and department taxonomy which the
 * college can then edit"). Trivially overridden per-college afterward.
 */
export const DEFAULT_TAXONOMY: ReadonlyArray<{ degree: string; departments: readonly string[] }> = [
  {
    degree: "B.Tech",
    departments: [
      "Computer Science and Engineering",
      "Information Science and Engineering",
      "Electronics and Communication Engineering",
      "Electrical and Electronics Engineering",
      "Mechanical Engineering",
      "Civil Engineering",
    ],
  },
  {
    degree: "M.Tech",
    departments: ["Computer Science and Engineering", "VLSI Design and Embedded Systems"],
  },
  { degree: "MBA", departments: [] },
  { degree: "MCA", departments: [] },
];
