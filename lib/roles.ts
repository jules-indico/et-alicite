/**
 * Canonical role catalog for the profile role selector (Account settings).
 * Values double as display labels. The server allowlists these on save;
 * extend here (not in the UI) to add new roles.
 */

export type RoleGroup = {
  label: string
  roles: string[]
}

export const ROLE_GROUPS: RoleGroup[] = [
  {
    label: "Academic & Formal",
    roles: [
      "Researcher",
      "Lead Researcher",
      "Student Researcher",
      "Undergraduate Researcher",
      "Graduate Researcher",
      "Research Assistant",
      "Scholar",
      "Academic",
      "Professor",
      "Lecturer",
    ],
  },
  {
    label: "Research-Themed",
    roles: [
      "Literature Hunter",
      "Data Analyst",
      "Reference Collector",
      "Research Enthusiast",
      "Lab Scientist",
      "Field Researcher",
      "Archivist",
    ],
  },
  {
    label: "Creative & Fun",
    roles: [
      "Creator",
      "Idea Explorer",
      "Knowledge Seeker",
      "Curious Mind",
      "Big Thinker",
      "Question Asker",
    ],
  },
  {
    label: "Funny",
    roles: [
      "Professional Procrastinator",
      "Citation Survivor",
      "Sleep-Deprived Researcher",
      "Deadline Warrior",
      "Coffee-Fueled Scholar",
      "Tab Hoarder",
    ],
  },
  {
    label: "General",
    roles: ["Student", "Educator", "Developer", "Designer", "Writer"],
  },
]

export const ROLE_VALUES: string[] = ROLE_GROUPS.flatMap((g) => g.roles)

export const DEFAULT_ROLE = "Researcher"
