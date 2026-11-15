# Project Governance

This document describes how accessibility-broadcast is governed. Pre-1.0 the
model is intentionally small; it will grow as the project grows.

## Current model: Benevolent Dictator, with a path out

As of today the project has a single maintainer, who is also the copyright
holder of the initial work (see `LICENSE` / `NOTICE`). The maintainer has
final say on:

- Accepting or rejecting contributions.
- Release timing and versioning.
- The contents of the roadmap (`ROADMAP.md`).
- The seam interfaces (see `src/services/seams/`).

This is not forever. When sustained external contribution arrives — defined
roughly as "three or more contributors with a pattern of merged PRs over
three months" — we will move to a **Steering Committee** model documented in
this file. The transition is mechanical, not contested.

## Roles

**Contributor.** Anyone who submits code, docs, design, or bug reports. No
approval needed; see `CONTRIBUTING.md`.

**Reviewer.** Trusted to review pull requests. Appointed by the maintainer
based on sustained quality contribution. Listed in `.github/CODEOWNERS`.

**Maintainer.** Can merge PRs, cut releases, and edit governance docs.
Appointed by the existing maintainer(s).

## Decision making

- **Normal PRs**: a reviewer LGTM is sufficient; the maintainer may merge their
  own PRs after a 48-hour waiting window on substantive changes (>100 lines
  non-trivial, or any change to auth, persistence, or the seam interfaces).
- **RFC-class changes** (breaking API, new seam interface, dependency add of
  non-trivial size, license change): an issue tagged `rfc:` must stay open at
  least 7 days. Any maintainer objection is sufficient to block; two must
  agree to proceed if more than one maintainer exists.
- **License changes**: decided by the copyright holder(s) listed in `NOTICE`,
  through the RFC process above.

## Licensing

The code in this repository is licensed under Apache-2.0 (see `LICENSE`).
Rights granted under that license for code already published here cannot be
withdrawn.

This document makes no commitment about the license of future versions and
does not describe or promise a commercial edition. If the license for future
versions changes, the change will be proposed in a pull request against this
file before it takes effect.

Contributions are accepted under the license of the project at the time they
are made (inbound = outbound). A `Signed-off-by` line (DCO) in commit messages
is encouraged. The maintainer may ask for a contributor agreement before
accepting a substantial outside contribution.

The seam interfaces (`UsageEventSink`, `TelemetrySink`, `AuditLogSink`,
`IdentityProvider`, `ModelProvider`) are public extension points. Anyone can
ship a compatible implementation.

## Trademarks

The name "accessibility-broadcast" and any associated marks are owned by the
maintainer. Use for purposes of describing the software, interoperability, or
honest comparison is permitted. Use that could reasonably be confused with an
official, endorsed, or certified status is not. A full trademark policy will
ship alongside the first trademark registration.

## Dispute resolution

We expect most disputes to resolve in-thread on the relevant issue or PR.
If escalation is needed:

1. Direct conversation between the disputants (private is fine).
2. Bring in a maintainer for mediation.
3. If still unresolved, the maintainer's decision stands, subject to the
   Code of Conduct.

## Amending this document

Pre-Steering-Committee: the maintainer may amend, but must announce the change
in a PR and wait 72 hours before merging. Post-Steering-Committee: 2/3
supermajority of the committee.
