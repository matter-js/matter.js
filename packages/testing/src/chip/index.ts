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
export { certTest, MultiDeviceUnsupportedError } from "./cert/cert-dsl.js";
export type { CertStepOptions, CertTestBuilder, CertTestOptions } from "./cert/cert-dsl.js";
/** @internal Test seam — not API. Production cert tests go through the `certTest()` DSL, not this class directly. */
export { CertTest } from "./cert/cert-test.js";
export { ChipDockerSubject, ChipLocalSubject } from "./cert/chip-app-subject.js";
/** @internal Test seam — not API. `ChipDockerDevice`'s own constructor, and its Docker collaborator types. */
export { ChipDockerDevice, HARNESS_DBUS_CONTAINER } from "./cert/chip-app-subject.js";
/** @internal Test seam — not API. */
export type { CompositionHandle, DockerHandle } from "./cert/chip-app-subject.js";
export { registerControllerAdapterFactory } from "./cert/controller-adapter.js";
export type {
    AttributePathSpec,
    AttributeWriteEntry,
    AttributeWriteStatus,
    CertNodeApi,
    CertNodeRef,
    CommissioningTarget,
    ControllerAdapter,
    ControllerAdapterFactory,
    ReadAttributeOptions,
    SubscribeOptions,
} from "./cert/controller-adapter.js";
export { resolveDeviceFlavor } from "./cert/device-config.js";
export { EvidenceRecorder } from "./cert/evidence.js";
export type { RunRecord, StepRecord } from "./cert/evidence.js";
export { CertLogClosedError, CertLogTimeoutError, LogFollower } from "./cert/log-follower.js";
export type { LogExpectOptions, LogExpectPatterns, LogExpectResult, LogLine } from "./cert/log-follower.js";
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
