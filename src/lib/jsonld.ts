/**
 * Schema.org JSON-LD builders. Every value comes from src/data/company.ts.
 * Base.astro renders organizationLd + websiteLd on every page; pages pass
 * extra blocks (e.g. FAQPage) through Base's `jsonLd` prop.
 */
import { COMPANY, SITE_URL } from "../data/company";

/**
 * Founder instruction (2026-10-08): the invest pages must not change in any
 * way, so shared components skip their GEO additions on these paths.
 */
export function isInvestPath(pathname: string): boolean {
  return /^\/(invest|investor-pitch)(\/|$)/.test(pathname);
}

const ORG_ID = `${SITE_URL}/#organization`;

export function organizationLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORG_ID,
    name: COMPANY.name,
    legalName: COMPANY.legalName,
    url: COMPANY.url,
    logo: COMPANY.logo,
    description: COMPANY.summary,
    email: COMPANY.email,
    foundingDate: COMPANY.foundingDate,
    address: {
      "@type": "PostalAddress",
      addressLocality: COMPANY.address.locality,
      addressRegion: COMPANY.address.region,
      addressCountry: COMPANY.address.country,
    },
    founder: COMPANY.founders.map((p) => ({
      "@type": "Person",
      name: p.name,
      ...(p.alternateName ? { alternateName: p.alternateName } : {}),
      jobTitle: p.jobTitle,
      ...(p.sameAs?.length ? { sameAs: p.sameAs } : {}),
    })),
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "general inquiries",
      email: COMPANY.email,
      url: `${SITE_URL}/contact`,
    },
    ...(COMPANY.sameAs.length ? { sameAs: COMPANY.sameAs } : {}),
  };
}

export function websiteLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: COMPANY.name,
    url: SITE_URL,
    description: COMPANY.summary,
    inLanguage: "en",
    publisher: { "@id": ORG_ID },
  };
}

export function faqPageLd(items: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

/** Serialize for a <script type="application/ld+json"> body; escapes "<" so content cannot close the tag. */
export function ldJson(data: object): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
