# Plan: Cross-Command Field References in Conformance

## Context

Spec 1.5 introduces conformance references like `SolicitOffer.VideoStreamID` on response fields,
meaning "this response field is present when the request's VideoStreamID field was provided."

Session: spec15gen branch, March 2026.

## Current State

- **Parser**: Already handles `CommandName.FieldName` syntax correctly (Conformance.ts lines 573-583)
- **Model**: Parsed as `Special.Name` with param `"SolicitOffer.VideoStreamID"`
- **Validation**: 4 UNRESOLVED_CONFORMANCE_NAME errors because the resolver doesn't split dotted names
- **Runtime**: Would treat unresolved names as `undefined` → field disallowed (wrong)

## Affected clusters

- `WebRtcTransportProvider`: SolicitOfferResponse.videoStreamId/audioStreamId, ProvideOfferResponse.videoStreamId/audioStreamId

## Phase 1: Model validation fix

**File:** `packages/model/src/logic/definition-validation/ValueValidator.ts` (lines 29-45)

Add dotted name resolution to the resolver callback: split on `.`, find command in cluster, find field in command.

## Phase 2: Runtime conformance evaluation

Requires architectural changes:

1. **Pass request data to response validator** — Command invoke handlers must carry decoded request
   payload when validating/constructing the response
2. **Extend ValidationLocation** — Add optional `requestPayload?: Val.Struct`
3. **Extend NameResolver** — Detect `CommandName.FieldName`, resolve from request context
4. **Extend conformance compiler** — `createNameReference` handles dotted names via request context
5. **Interim**: Treat unresolved dotted names as `Code.Optional` (safe default)

Key files:
- `packages/node/src/behavior/state/validation/conformance-compiler.ts` — createName/createNameReference
- `packages/node/src/behavior/state/managed/NameResolver.ts` — sibling field resolution
- `packages/node/src/behavior/state/validation/location.ts` — ValidationLocation
- `packages/node/src/behavior/state/validation/conformance.ts` — createConformanceValidator
