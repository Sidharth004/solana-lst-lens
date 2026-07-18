// Relevant project/app links for an LST. The first three are derived from the
// on-chain mint/symbol, so they're correct for every LST and verified to resolve:
//   - Sanctum:  https://app.sanctum.so/trade/{symbol}   (mint / stake / trade)
//   - Jupiter:  https://jup.ag/tokens/{mint}            (swap + token info)
//   - Explorer: https://explorer.solana.com/address/{mint}
// The issuer website is a small curated, verified map (shown only when known).

import type { Lst } from "@shared/schema";

export interface LstLink {
  label: string;
  href: string;
}

// Verified issuer homepages (curl 200, or a live site that bot-blocks curl).
// Keyed by lowercased issuer. Add here as new issuers are curated.
const ISSUER_SITES: Record<string, string> = {
  jito: "https://www.jito.network",
  marinade: "https://marinade.finance",
  jupiter: "https://jup.ag",
  sanctum: "https://sanctum.so",
  raiku: "https://raiku.com",
  blazestake: "https://stake.solblaze.org",
  solblaze: "https://stake.solblaze.org",
  drift: "https://www.drift.trade",
  helius: "https://www.helius.dev",
};

export function lstLinks(lst: Lst): LstLink[] {
  const links: LstLink[] = [
    { label: "Sanctum", href: `https://app.sanctum.so/trade/${encodeURIComponent(lst.symbol)}` },
    { label: "Jupiter", href: `https://jup.ag/tokens/${lst.mint}` },
    { label: "Explorer", href: `https://explorer.solana.com/address/${lst.mint}` },
  ];
  // Prefer the per-token website from Jupiter; fall back to the curated map.
  const site = lst.website ?? (lst.issuer ? ISSUER_SITES[lst.issuer.toLowerCase()] : undefined);
  if (site) links.push({ label: lst.issuer ?? "Website", href: site });
  return links;
}
