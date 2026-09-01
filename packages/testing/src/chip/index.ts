/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Cert-test seams are exported explicitly rather than via a wildcard `export *`, so the public
// surface stays deliberate. Most stay package-internal (tests within this package import them
// relatively); the ones below marked "test seam — not API" are re-exported anyway because
// support/chip-testing's own cert-framework tests (a separate package, `@matter/testing` consumer)
// need them and can only reach this module's `.` entrypoint.
export type {
    CertDevice,
    CertDeviceFactory,
    CertStepContext,
    CertStepDefinition,
    CertTestDefinition,
    CheckRecord,
    DeviceExitInfo,
    DeviceFlavor,
    LogSource,
    StepRecorder,
    StepVerdict,
} from "./cert/cert-context.js";
export { certTest } from "./cert/cert-dsl.js";
/** @internal Test seam — not API. Per-device identity assignment for a multi-device run. */
export { DeviceIdentityExhaustedError, identityFor } from "./cert/cert-dsl.js";
export type { CertStepOptions, CertTestBuilder, CertTestOptions } from "./cert/cert-dsl.js";
/** @internal Test seam — not API. The gate `certTest()` applies before a test's device starts. */
export { certPicsFile, unmetTestPics } from "./cert/cert-dsl.js";
/** @internal Test seam — not API. Production cert tests go through the `certTest()` DSL, not this class directly. */
export { CertTest } from "./cert/cert-test.js";
export { ChipDockerSubject, ChipLocalSubject } from "./cert/chip-app-subject.js";
/** @internal Test seam — not API. `ChipDockerDevice`'s own constructor, and its Docker collaborator types. */
export { ChipDockerDevice, HARNESS_DBUS_CONTAINER } from "./cert/chip-app-subject.js";
/** @internal Test seam — not API. */
export type { CompositionHandle, DockerHandle } from "./cert/chip-app-subject.js";
export {
    controllerPicsOverridesFor,
    registerControllerAdapterFactory,
    UnsupportedByControllerError,
} from "./cert/controller-adapter.js";
/** @internal Test seam — not API. Cert-test wiring calls this from `cert-dsl.ts`; direct use is for registry tests. */
export { createControllerAdapter } from "./cert/controller-adapter.js";
/** @internal Test seam — not API. */
export { resetControllerAdapterFactoryForTesting } from "./cert/controller-adapter.js";
export type {
    AttributePathSpec,
    AttributeReadEntry,
    AttributeWriteEntry,
    AttributeWriteStatus,
    BatchCommandResult,
    BatchCommandSpec,
    CertGroupApi,
    GroupKeySetSpec,
    CertNodeApi,
    CertNodeRef,
    ClientEndpointEntry,
    CommissioningTarget,
    ControllerAdapter,
    ControllerAdapterFactory,
    ControllerAdapterOptions,
    ControllerTransport,
    EventPathSpec,
    EventReadEntry,
    ManualPairingCodeFields,
    OnboardingPayloadFields,
    ReadAttributeOptions,
    ReadEventOptions,
    SubscribeEventOptions,
    SubscribeOptions,
    TimedInteractionOptions,
} from "./cert/controller-adapter.js";
export { resolveControllerImplementation, resolveDeviceFlavor } from "./cert/device-config.js";
export type { ControllerImplementation } from "./cert/device-config.js";
export { EvidenceRecorder } from "./cert/evidence.js";
export type { RunRecord, StepRecord } from "./cert/evidence.js";
export { CertLogClosedError, CertLogTimeoutError, forFlavor, LogFollower } from "./cert/log-follower.js";
export type {
    LogExpectOptions,
    LogExpectPatterns,
    LogExpectResult,
    LogExpectSequences,
    LogLine,
} from "./cert/log-follower.js";
export { registerMatterJsCertSubject } from "./cert/matterjs-subject-registry.js";
export { PromptDrivenPythonTest } from "./cert/prompt-driven-python-test.js";
export type { PromptHandler } from "./cert/prompt-driven-python-test.js";
export {
    assertChipBinsDirOwnership,
    CERT_BINS_IMAGE,
    CERT_BINS_PLATFORM,
    ChipBinsOwnershipError,
    ChipBinsPermissionError,
    chipBinsDir,
    chipBinsExtractionDir,
    chipBinsPlatformSupported,
    DEFAULT_CERT_BINS_TAG,
    ensureChipBins,
    prepareChipBins,
    requestedChipBinsTag,
    resolveChipBinsSource,
    resolveChipBinsTag,
} from "./chip-bins.js";
export type { ChipBinsSource, EnsureChipBinsResult } from "./chip-bins.js";
/** @internal Test seam — not API. */
export { parseDockerHubTagsResponse, resetChipBinsPrepareCacheForTesting } from "./chip-bins.js";
/** @internal Test seam — not API. */
export type { ChipBinsDockerHandle } from "./chip-bins.js";
export * from "./chip.js";
export * from "./command-pipe.js";
export * from "./pics/index.js";
