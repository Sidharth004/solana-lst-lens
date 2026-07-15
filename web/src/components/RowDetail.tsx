// Expanded per-LST detail panel. Phase 4: yield-split breakdown, fee sourcing,
// and the raw decentralization inputs behind the grade (so the composite is
// auditable). History charts and deployment/exit detail layer in later phases.

import type { ReactNode } from "react";
import type { Lst } from "@shared/schema";
import { fmtPct, fmtRate, fmtInt, fmtDate, fmtSol } from "../lib/format";
import { deriveRiskFlags, seriesFor, type HistoryData } from "../lib/history";
import { YieldBar } from "./YieldBar";
import { ScoreBadge } from "./ScoreBadge";
import { Sparkline } from "./Sparkline";
import { InfoTip } from "./InfoTip";

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

export function RowDetail({ lst, history }: { lst: Lst; history: HistoryData }) {
  const { yieldSplit: y, decentralization: d } = lst;
  const rateSeries = seriesFor(history.exchangeRates, lst.symbol);
  const apySeries = seriesFor(history.apy, lst.symbol);
  const risks = deriveRiskFlags(lst, rateSeries);
  return (
    <div className="row-detail">
      <section className="detail-section">
        <h4>
          Yield split <span className="est-tag">estimate</span>
          <InfoTip text="Modeled breakdown of the delivered yield into base staking (network inflation, net of fee) vs MEV/other (the residual). Blockspace LSTs show a hollow ‘coming’ segment — we never invent a number." />
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
          <InfoTip text="How much this LST helps or hurts validator decentralization. We read the pool's on-chain validator set and grade A–F from validator count, stake concentration (Herfindahl), average validator rank, and delinquency. Raw inputs shown so it's auditable." />
        </h4>
        <div className="detail-grid">
          <Field label="Validators" value={fmtInt(d.validatorCount)} hint="Number of validators the pool delegates to" />
          <Field
            label="Stake concentration"
            value={d.stakeConcentration === null ? "—" : d.stakeConcentration.toFixed(3)}
            hint="Herfindahl index of stake within the set (0 spread → 1 concentrated)"
          />
          <Field label="Avg validator rank" value={fmtInt(d.avgValidatorRank)} hint="Mean Stakewiz network rank of delegated validators (higher = smaller validators)" />
          <Field
            label="Delinquent validators"
            value={d.delinquentValidatorCount === null ? "—" : fmtInt(d.delinquentValidatorCount)}
            hint="Validators in the set currently flagged delinquent by Stakewiz"
          />
        </div>
        {d.source && (
          <p className="detail-note">
            Resolved via{" "}
            {d.source === "single"
              ? "the pool's single vote account"
              : "the on-chain validator list (RPC)"}
            . Audits: {lst.auditCount === null ? "—" : lst.auditCount}.
          </p>
        )}
        {d.grade === null && (
          <p className="detail-note">
            Validator set not yet resolved for this pool (unsupported pool type) —
            score pending.
          </p>
        )}
      </section>

      <section className="detail-section">
        <h4>
          DeFi deployment &amp; exit
          <InfoTip text="Where this LST is actually used across DeFi (in SOL), plus the price impact to exit a 1000-SOL position to SOL and your net-after-exit APY. Deployment via DeFiLlama can double-count — treat as an upper bound." />
        </h4>
        {lst.deployment ? (
          <>
            <div className="detail-grid">
              {Object.entries(lst.deployment.byProtocol).map(([name, sol]) => (
                <Field key={name} label={name} value={fmtSol(sol)} />
              ))}
              <Field label="Total deployed" value={fmtSol(lst.deployment.totalDeployed)} />
            </div>
            <p className="detail-note">{lst.deployment.note}</p>
          </>
        ) : (
          <p className="detail-note">No tracked DeFi deployment for this LST.</p>
        )}
        <div className="detail-grid" style={{ marginTop: 12 }}>
          <Field
            label="Exit price impact"
            value={lst.exitCost?.priceImpactPct != null ? fmtPct(lst.exitCost.priceImpactPct, 3) : "—"}
            hint={`Swapping ~${lst.exitCost?.sampleSizeSol ?? 1000} SOL-worth out to SOL`}
          />
          <Field
            label="Net APY after exit"
            value={lst.exitCost?.netApyAfterExit != null ? fmtPct(lst.exitCost.netApyAfterExit) : "—"}
            hint="Realized APY minus the one-time exit haircut at the sample size"
          />
        </div>
      </section>

      <section className="detail-section">
        <h4>
          History
          <InfoTip text="Exchange rate and realized APY over time, built from the daily snapshots this project commits to git (git is the time-series database). It deepens every day the pipeline runs." />
        </h4>
        <div className="spark-row">
          <Sparkline points={rateSeries} label="Exchange rate (SOL)" format={(v) => fmtRate(v)} color="#6366f1" />
          <Sparkline points={apySeries} label="Realized APY" format={(v) => fmtPct(v)} color="#0ea5e9" />
        </div>
      </section>

      <section className="detail-section">
        <h4>
          Risk flags
          <InfoTip text="Automated warnings other dashboards don't compute: overstated APY (advertised ≫ realized), stake concentration, depeg events detected from the exchange-rate history, delinquent validators in the set, and unaudited pools." />
        </h4>
        {risks.length === 0 ? (
          <p className="detail-note">No risk flags raised.</p>
        ) : (
          <ul className="risk-list">
            {risks.map((r) => (
              <li key={r.label} className={`risk-item risk-${r.severity}`}>
                <span className="risk-tag">{r.label}</span>
                <span className="risk-detail">{r.detail}</span>
              </li>
            ))}
          </ul>
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
