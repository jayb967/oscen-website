/**
 * Contributor wall tokens.
 *
 * The wall is now sourced LIVE from the CRM. Supporter display names are
 * captured at Stripe checkout and written by the CRM Stripe webhook; the CRM
 * exposes the public, active, wall-eligible list at PUBLIC_SUPPORTERS_URL. This
 * See src/components/ContributorWall.astro, which fetches that endpoint on the
 * client and renders the result. The local sample list below is included only
 * in Astro dev builds so the team can review the wall layout before Stripe
 * webhook data exists.
 */

export type ContributorTier = "spark" | "synapse" | "cortex" | "custom";
export type ContributorWallEntry = {
  displayName: string;
  tier: ContributorTier;
  since: string;
};

export const TIER_DOT: Record<ContributorTier, string> = {
  spark:   "bg-accent-cyan",
  synapse: "bg-accent-blue",
  cortex:  "bg-accent-amber",
  custom:  "bg-accent-purple",
};

const sampleNames = [
  "Avery Cole", "Maya Reed", "Jordan Hale", "Noah Pierce", "Sofia Bennett", "Elias Grant",
  "Nina Kapoor", "Theo Mercer", "Clara Vaughn", "Miles Carter", "Leah Brooks", "Owen Ellis",
  "Amara Singh", "Julian Park", "Iris Morgan", "Caleb Stone", "Priya Shah", "Rowan Blake",
  "Elena Cruz", "Marcus Lee", "Tessa Quinn", "Adrian Wells", "Naomi Hart", "Felix Rivera",
  "Lena Fischer", "Samir Patel", "Grace Monroe", "Dylan Ross", "Mira Chen", "Jonah Price",
  "Layla Morris", "Hugo Foster", "Anika Rao", "Evan Miles", "Celia Ward", "Mateo Silva",
  "Zara Mitchell", "Nolan Hayes", "Ivy Coleman", "Arjun Mehta", "Eva Laurent", "Rafael Torres",
  "Mina Okafor", "Callum Wright", "Hannah Kim", "Jasper Lane", "Aisha Rahman", "Finn Roberts",
  "Lara Jensen", "Kai Donovan", "Mila Santos", "Ezra Clarke", "Nora Gallagher", "Victor Chen",
  "Sana Malik", "Oscar Hughes", "Lucia Romano", "Ben Walker", "Ines Duarte", "Aria Collins",
  "Kieran Shaw", "Yara Haddad", "Leo Martin", "Freya Lewis", "Omar Aziz", "Maeve Turner",
  "Luca Moretti", "Isla Freeman", "Rina Das", "Theo Walsh", "June Fletcher", "Max Nguyen",
  "Sienna Patel", "Adam Brooks", "Keira Nolan", "Luis Moreno", "Talia Green", "Simon Adler",
  "Noelle Hart", "Akira Tanaka", "Mara Stevens", "Eli Dawson", "Zoe Carter", "Nikhil Rao",
  "Camila Ruiz", "Arthur Bell", "Lina Novak", "Micah Ford", "Sara Ibrahim", "Rory Bennett",
  "Daphne King", "Malik Thompson", "Anya Petrova", "Cole Spencer", "Maya Ellis", "Ravi Menon",
  "Ella Murphy", "Tomas Vega", "Nadia Khan", "Jude Palmer", "Bianca Rossi", "Peter Walsh",
  "Lila Ahmed", "Gavin Reed", "Mei Lin", "Andre Lewis", "Kira Foster", "Soren Dahl",
  "Natalie West", "Diego Alvarez", "Alina Popov", "Henry Clarke", "Farah Osman", "Mason Young",
  "Gemma Scott", "Vikram Iyer", "Cora James", "Anton Weber", "Selena Ortiz", "Ethan Cole",
  "Amelia Brooks", "Ryan Singh", "Tara Morgan",
] as const;

export const LOCAL_SAMPLE_SUPPORTERS: ContributorWallEntry[] = sampleNames.map((displayName, index) => {
  const tier: ContributorTier = index % 13 === 0 ? "cortex" : index % 7 === 0 ? "custom" : "synapse";
  const month = 1 + (index % 8);
  return {
    displayName,
    tier,
    since: `2026-${String(month).padStart(2, "0")}`,
  };
});
