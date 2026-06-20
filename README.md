# oscen-website

Marketing and investor-facing site for OSCEN at https://oscen.ai. Astro + Tailwind CSS + GSAP ScrollTrigger. Deploys to Netlify from `main`.

This repo lives at `jayb967/oscen-website` (personal account, public). The product/architecture/business docs live in `oscenai/oscen` and `oscenai/oscen-internal`; this repo is only the public site.

## Pages

| Route | Purpose |
|---|---|
| `/` | Landing. 9 sections: Hero, Problem, Solution, HowItWorks, Proof, Market, Vision, FounderVision, CTA |
| `/architecture` | Architecture overview for technical audiences |
| `/research` | Research notes, papers, neuroscience context |
| `/invest` | Investor entry point |
| `/investor-pitch/*` | Pitch deck pages |
| `/contact` | Contact form |

## Project layout

```
src/
  components/sections/   # one component per landing-page section
  layouts/               # shared <html>/<head> wrappers
  styles/global.css      # design tokens, glass/flip/expand card patterns
  pages/                 # each .astro file becomes a route
  data/                  # static content (copy, links)
  lib/                   # client-side helpers
  scripts/               # build/dev helper scripts
public/                  # static assets served as-is
```

## Local development

```sh
npm install
npm run dev       # http://localhost:4321
npm run build     # writes static site to dist/
npm run preview   # preview production build locally
```

## Deploy

Pushes to `main` deploy to Netlify automatically. There is no separate build step to run.

## Related

- Product PRD: `oscen-internal/docs/OSCEN-SITE-PRD.md` (founder access only).
- Brand and content vision lives in the PRD, not in this repo.
- Code repo (closed): `oscenai/oscen`.
