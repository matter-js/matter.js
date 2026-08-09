# Candidate test plan fixes

Findings worth raising against the upstream CHIP test plan documents, discovered while translating a
plan into a `TC-*.test.ts` here. Each entry: which TC, what the plan says, what's wrong or ambiguous,
and what we did instead.

Update this file in the same commit as the TC that produced the insight.

## `TC-MDNS-CHECK-0.0`

No entry. `TC-MDNS-CHECK-0.0` is a framework smoke test for the `expectMdns` checker (`plan: "n/a"`,
matching `TC-SMOKE-0.0`), not a translation of a real test plan document, so it produced no test-plan
finding — only the framework-level notes now in `AGENTS.md`.

## `TC-IDM-2.1`

Plan: `interactiondatamodel.adoc` (chip-test-plans), cross-checked against
`Test_TC_IDM_2_1.yaml` (connectedhomeip's own verification-block captures for this TC).

1. **Step 20's verification text describes the wrong direction.** The adoc/YAML step text is DUT-as-client
   throughout TC-IDM-2.1 ("DUT sends the Read Request Message to the TH..."), but step 20's
   `Test_TC_IDM_2_1.yaml` verification block reverses it mid-paragraph: "From TH(all-clusters-app) will
   send read request to DUT(chip-tool), Then DUT(chip-tool) will send the report data message for the
   request which sent from TH...". That's TC-IDM-2.2's direction (DUT as server), not TC-IDM-2.1's — looks
   like a copy/paste artifact from the sibling TC's own captures. Our step 20 keeps the adoc's own
   (correctly-directioned) step text verbatim and implements the DUT-as-client reading, not the reversed
   verification example.

2. **Steps 20 and 21 aren't verifiable end-to-end through a high-level controller API.** Step 20 asks to
   verify that the DUT (our `ControllerAdapter`) sends a `StatusResponseMessage` acking every chunked
   `ReportData` except the last — that's MRP/IM transport-layer acking `InteractionClient.getMultipleAttributesAndStatus`
   abstracts away entirely; there's no adapter hook to observe per-chunk acks without instrumenting the
   underlying exchange machinery. Step 21 asks for coverage of "Manufacturer specific clusters and
   attributes", but neither cert flavor's all-clusters app (matter.js's `AllClustersTestInstance` or
   connectedhomeip's `chip-all-clusters-app`) defines one in a way our commissioned fabric has visibility
   into that's distinguishable from an ordinary standard cluster (chip's own `TestHiddenManufacturerSpecific`
   cluster on endpoint 1 is present, but our own read-side checks don't key off it). Both steps run a large
   full-wildcard read and check the returned attribute count as a proxy for "large enough to require
   chunking" / "read across the full model", with the coverage gap called out in the step's own
   `recorder.check` detail text rather than silently passing on an unrelated assertion.

## `TC-ACT-3.2`

Plan: `actions.adoc` (chip-test-plans, lines 367-451), cross-checked against
`Test_TC_ACT_3_2.yaml` (connectedhomeip's own verification-block captures for this TC) and the current
`examples/bridge-app` source (`bridged-actions-stub.h`/`.cpp`).

1. **The adoc's own expected-outcome text calls `Duration` "a valid uint16" (steps 8-11), but both the
   Matter spec and the model (`Actions.element.ts`) declare the `Duration` field `uint32`.**
   `TransitionTime` (step 12) is genuinely `uint16` per the same model, so this isn't a copy/paste of
   the wrong field name for every numeric field — just `Duration` specifically. Our steps send a
   `Duration` value (100,000) that only a uint32 can carry, and the real chip-bridge-app's captured log
   accepts and echoes it verbatim — confirming the adoc text, not the field's actual wire type, is wrong.

2. **The reference `chip-bridge-app` doesn't implement the Test Setup this TC's own procedure depends
   on.** The Test Setup mandates the TH exposes one `ActionStruct` with `ActionID = 0x1001` and
   `SupportedCommands = 0x0fff` (all 12 commands). The real app's `ActionsDelegateImpl`
   (`bridged-actions-stub.h`) instead hard-codes three actions with IDs `0`/`1`/`2`, and every
   `Handle*Action*` method (`bridged-actions-stub.cpp`) unconditionally returns `Status::NotFound` — none
   of the 12 commands are actually implemented against a `0x1001` action. Against the real chip-bridge-app
   binary tested here, `InstantAction` (step 1) nonetheless returned `SUCCESS` and visibly toggled bridged
   lights, which is inconsistent with both the Test Setup (no `0x1001` action exists to match) and the
   stub source (unconditional `NotFound`) — the binary under test likely predates a later stubbing-out of
   real Actions handling. Steps 2-12 all failed at the protocol layer with `UnsupportedCommand` (0x81)
   before ever reaching the delegate, consistent with the adoc's own note that "Test Steps #2 to #12
   cannot be executed with V1.0 SDK." Per the brief, every step still verifies the *outgoing* command's
   `CommandDataIB`/`CommandFields` against the TH log regardless of the response status it got back.

## `TC-CADMIN-1.17`

Plan: `multiplefabrics.adoc` (chip-test-plans, `[TC-CADMIN-1.17]` section, lines ~713-758), cross-checked
against `Test_TC_CADMIN_1_17.yaml` (connectedhomeip's own verification-block captures) and the current
`connectedhomeip/src` source for every literal log string the YAML quotes.

1. **The plan's own quoted expected-outcome text for step 7 drops a trailing `!!` that both the real
   source and a live capture carry.** Step 7's expected outcome (and the YAML's verification block) both
   quote the device log line as `"Expiring all sessions for fabric 0x2"`. The actual source
   (`SessionManager.cpp`: `ChipLogDetail(Inet, "Expiring all sessions for fabric 0x%x!!", ...)`) and a
   live capture against a real `chip-all-clusters-app` both end the line `0x2!!` — two literal exclamation
   marks. An implementer building an exact-string match from the plan's own quoted text alone would build
   a pattern that never matches. This TC's own `REMOVE_FABRIC_SUCCESS_PATTERN`/fabric-index regex include
   the `!!`, derived from source + a live capture, not from the plan's abbreviated quote.

2. **Step 8's expected outcome implies a network-level failure ("no longer on the network"), but a
   spec-compliant commissioner can — and matter.js's controller does — fail locally instead, without any
   network round trip.** The YAML's own captured evidence for `chip-tool` shows a CASE-resumption error
   (`CHIP Error 0x000000C9: No shared trusted root`) — i.e. chip-tool actually attempts to reach TH_CE and
   gets rejected. Against the same scenario, matter.js's own `PairedNode` proactively detects the session
   loss from the `RemoveFabric` side effect and rejects the very next read/write immediately
   (`Node <id> is not commissioned!`), well under a millisecond, never touching the network. Both are
   legitimate ways to satisfy "verify read/write commands fail as expected" — the plan's wording just
   assumes the slower, network-observable failure mode as the only shape the check needs to tolerate. This
   TC's own `expectRejection` accepts either (bounded by a 25s local timeout as a backstop for an
   implementation that doesn't detect proactively) rather than asserting a specific failure latency or
   error identity.
