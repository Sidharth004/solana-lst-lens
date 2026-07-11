// Expanded per-LST detail panel. Phase 4: yield-split breakdown, fee sourcing,
// and the raw decentralization inputs behind the grade (so the composite is
// auditable). History charts and deployment/exit detail layer in later phases.

import type { ReactNode } from "react";
import type { Lst } from "@shared/schema";
import { fmtPct, fmtRate, fmtInt, fmtDate } from "../lib/format";
import { YieldBar } from "./YieldBar";
import { ScoreBadge } from "./ScoreBadge";

function Field({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="detail-field">
      <div className="detail-label" title={hint}>
        {label}
      </div>
      <div className="detail-value num">{value}</div>
    </div>
  );
}

export function RowDetail({ lst }: { lst: Lst }) {
  const { yieldSplit: y, decentralization: d } = lst;
  return (
    <div className="row-detail">
      <section className="detail-section">
        <h4>
          Yield split <span className="est-tag">estimate</span>
        </h4>
        <YieldBar lst={lst} showValue={false} />
        <div className="detail-grid">
          <Field label="Base staking" value={fmtPct(y.baseStakingApy)} hint="Network inflation component, net of the protocol fee" />
          <Field label="MEV" value={y.mevApy === null ? "—" : fmtPct(y.mevApy)} hint="Not separated at this layer; folded into Other" />
          <Field label="Other" value={fmtPct(y.otherApy)} hint="MEV + fee-sharing + residual" />
          <Field label="Realized total" value={fmtPct(lst.realizedApy)} />
        </div>
      </section>

      <section className="detail-section">
        <h4>Fee &amp; rate</h4>
        <div className="detail-grid">
          <Field label="Protocol fee" value={fmtPct(lst.feePct)} hint="Manager withhold rate from Sanctum" />
          <Field label="Exchange rate" value={fmtRate(lst.exchangeRate)} hint="LST → SOL (solValue); the basis for realized yield" />
          <Field label="Advertised" value={fmtPct(lst.advertisedApy)} />
          <Field label="Realized" value={fmtPct(lst.realizedApy)} />
        </div>
      </section>

      <section className="detail-section">
        <h4>
          Decentralization <span className="est-tag">our index</span>{" "}
          <ScoreBadge grade={d.grade} />
        </h4>
        <div className="detail-grid">
          <Field label="Validators" value={fmtInt(d.validatorCount)} hint="Number of validators the pool delegates to" />
          <Field
            label="Stake concentration"
            value={d.stakeConcentration === null ? "—" : d.stakeConcentration.toFixed(3)}
            hint="Herfindahl index of stake within the set (0 spread → 1 concentrated)"
          />
          <Field label="Avg validator rank" value={fmtInt(d.avgValidatorRank)} hint="Mean Stakewiz network rank of delegated validators (higher = smaller validators)" />
          <Field label="Audits" value={lst.auditCount === null ? "—" : fmtInt(lst.auditCount)} />
        </div>
        {d.grade === null && (
          <p className="detail-note">
            Validator set not yet resolved for this pool — score pending (needs the
            on-chain validator list via RPC).
          </p>
        )}
      </section>

      <section className="detail-section detail-meta">
        <Field label="Type" value={lst.type} />
        <Field label="Issuer" value={lst.issuer ?? "—"} />
        <Field label="Launched" value={fmtDate(lst.launchDate)} />
        <Field label="Mint" value={<code className="mint">{lst.mint}</code>} />
      </section>
    </div>
  );
}
