# Risk assessment

| # | Risk | Likelihood | Impact | Mitigation / status |
|---|---|---|---|---|
| 1 | **No revenue while free** — the RD$100 model was removed | High | High | Deliberate strategy (growth first). DG Monetization keeps a tested payment engine ready for *optional* products; ads/sponsorships need providers + policy review (MONETIZATION.md) |
| 1b | **Legacy buyers** — players who paid RD$100 before the change | Certain | Medium | Their progress is kept, they get the Fundador badge, history is visible in their dashboard; refund/communication policy is a business decision |
| 2 | **Performance on low-end PCs** (common iGPUs in DR) | High | High | LOW preset, dynamic resolution, density sliders, capability detection; needs testing on real hardware |
| 3 | **Intellectual-property confusion with GTA** | Medium | High | Original name/branding, no GTA assets/fonts/music/characters, explicit non-affiliation notice; avoid “GTA” in marketing |
| 4 | **Real brands or people depicted** | Low | Medium | All businesses fictional; generic vehicle names; landmarks are public monuments represented generically |
| 5 | **Geographic inaccuracy** | Medium | Medium | All streets/coast from OSM; procedural infill disclosed; landmark models are simplified approximations |
| 6 | **ODbL compliance** | Low | Medium | Attribution in UI; derived database (world data) must be offered under ODbL if publicly distributed |
| 7 | **Abuse of free accounts** (bots, spam sign-ups, ranking cheating) | Medium | Medium | Per-IP rate limits, lockout, admin suspension, ranking opt-out, audit trail; recommended: captcha on sign-up if abuse appears, server-side plausibility checks before prized competitions |
| 8 | **Data protection (Ley 172-13)** | Medium | Medium | Minimal data, hashed passwords, no card data, privacy policy draft — legal review pending |
| 9 | **Consumer law (Ley 358-05) / tax (ITBIS, NCF)** | Medium | Medium | Refund policy in terms, ITBIS-inclusive price, NCF provider not yet integrated — accountant review |
| 10 | **Browser support (WebGL 2 / WASM)** | Low | Medium | Detection with clear Spanish error messages; Safari 17+ expected to work but untested |
| 11 | **Mobile users expecting to play** | High | Low | Game pages and FAQ state desktop-only; the platform UI is designed for desktop first |
| 15 | **Catalog concepts read as promises** | Medium | Medium | Upcoming titles are labelled “Próximamente” + “Arte conceptual”, never playable, no dates promised |
| 12 | **Single-region hosting latency/outage** | Low | Medium | Stateless API, CDN for static assets, DB backups |
| 13 | **Scope creep (AAA expectations)** | High | Medium | Milestone plan in ROADMAP; honest status in QA checklist |
| 14 | **Headless-only QA in this environment** | High | Medium | Deterministic debug hooks + e2e; real-GPU playtesting required before launch |
