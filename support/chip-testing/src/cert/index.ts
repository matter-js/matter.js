/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Boot, Environment, InternalError, Logger, RuntimeService } from "@matter/main";
import type {
    BackchannelCommand,
    CertDevice,
    CertDeviceFactory,
    DeviceExitInfo,
    DeviceFlavor,
    Subject,
} from "@matter/testing";
import {
    LineQueue,
    LogFollower,
    registerCertAppPics,
    registerControllerAdapterFactory,
    registerMatterJsCertSubject,
} from "@matter/testing";
import { AsyncLocalStorage } from "node:async_hooks";
import { join } from "node:path";
import { env } from "node:process";
import { AllClustersTestInstance } from "../AllClustersTestInstance.js";
import { BridgeTestInstance } from "../BridgeTestInstance.js";
import { DeviceTestInstanceConstructor } from "../GenericTestApp.js";
import { IcdTestInstance } from "../IcdTestInstance.js";
import { NodeTestInstance } from "../NodeTestInstance.js";
import { OtaProviderTestInstance } from "../OtaProviderTestInstance.js";
import { OtaRequestorTestInstance } from "../OtaRequestorTestInstance.js";
import { CHIP_TOOL_CONTROLLER_PICS, ChipToolControllerAdapter } from "./ChipToolControllerAdapter.js";
import {
    controllerAdapterClaimsLogs,
    InProcessControllerAdapter,
    MATTERJS_CONTROLLER_PICS,
} from "./InProcessControllerAdapter.js";
import { forgetLogOriginClaims, logOriginsAreClaimed, OriginDestination, registerLogOrigin } from "./log-origins.js";

registerControllerAdapterFactory(
    "matterjs",
    (id, options) => new InProcessControllerAdapter(id, options),
    MATTERJS_CONTROLLER_PICS,
);
registerControllerAdapterFactory(
    "chip-tool",
    (id, options) => new ChipToolControllerAdapter(id, options),
    CHIP_TOOL_CONTROLLER_PICS,
);

// EvidenceRecorder (packages/testing, generic) has no knowledge of this package's own directory
// layout; this is the seam cert-dsl.ts documents for choosing an outDir. matter-test's working
// directory is already this package's root while tests run, so this is package-relative.
env.MATTER_CERT_EVIDENCE_DIR ??= join(process.cwd(), "build/cert-evidence");

const activeDeviceId = new AsyncLocalStorage<string>();

// A crashed runtime cancels every worker it holds, which for a run that starts one node after another
// takes down services the later nodes need. matter.js reports the cause through its own logger, and
// the test runner keeps a passing test's log to itself — so a crash inside a test that still passes
// leaves nothing behind but the damage. Report it where no log policy can discard it.
//
// Unlike Logger.destinations below, the default environment survives Boot.reboot(), so a fresh
// observer per spec file would report one crash once per file run before it.
let crashReporterRuntime: RuntimeService | undefined;
Boot.init(() => {
    const runtime = Environment.default.runtime;
    if (runtime === crashReporterRuntime) {
        return;
    }
    crashReporterRuntime = runtime;

    runtime.crashed.on((cause: unknown) => {
        console.error("A matter.js runtime crashed during a certification run:", cause);
    });
});
const deviceQueues = new Map<string, LineQueue>();

// Boot.reboot() runs before every spec file and replaces Logger.destinations wholesale (see
// Logger.ts's own Boot.init), so a one-time install at module load would stop forwarding device log
// lines from the second cert-test file onward. Boot.init re-runs this on every reboot instead.
Boot.init(() => {
    forgetLogOriginClaims();

    Logger.destinations["cert-matterjs-device"] = OriginDestination("cert-matterjs-device", "device", text => {
        const id = activeDeviceId.getStore();
        const queue = id === undefined ? undefined : deviceQueues.get(id);
        if (queue !== undefined) {
            queue.push(text);
            return;
        }

        if (controllerAdapterClaimsLogs() || !logOriginsAreClaimed()) {
            return;
        }

        // A line nobody claims still has to be seen. matter.js reports a crashed endpoint and a
        // crashed runtime through this logger, and both happen outside the calls this tags — a
        // node tearing down, a construction rejecting on its own microtask — so dropping the
        // unattributed lines hides exactly the failures worth reading.
        console.error(text);
    });
});

/**
 * Runs `fn` with `id` as the fallback attribution for any log line it produces, for the components that do not yet
 * name their own owner.
 */
export function runTaggedForDevice<T>(id: string, fn: () => Promise<T>): Promise<T> {
    return activeDeviceId.run(id, fn);
}

/**
 * Adds {@link CertDevice}'s extra fields (`log`/`flavor`/`exit`) to an in-process matter.js test
 * subject by delegation, so `cert-dsl.ts` (which cannot depend on matter.js) never needs to
 * construct or cast one itself.
 *
 * A line reaches this device's log by either of two routes. A component that logs through
 * `Environment.logger()` — `ExchangeManager` and `SessionManager` today — names its own environment on
 * every message, and `log-origins.ts` routes by that whatever the call stack holds, which is what makes
 * a line written from a socket or timer callback readable. Everything else still logs through a
 * module-level `Logger.get()` and is attributed by the `AsyncLocalStorage` tag that
 * `initialize()`/`start()`/`stop()`/`close()` install.
 *
 * **A cert test may declare several devices, so several of these run concurrently.** The tag route has
 * a limit the owner route does not: a service resolved lazily from the shared parent environment
 * during whichever device happened to start first captures that device's tag for good, and lines it
 * later emits on behalf of another device land in the first device's log. For a component on the tag
 * route, a step that must attribute a line to one of several devices should assert on something only
 * that device says.
 */
class MatterJsCertDevice implements CertDevice {
    readonly flavor: DeviceFlavor = "matterjs";
    readonly log: LogFollower;
    // In-process subjects have no separate process/container to crash independently of the test
    // itself; this simply never settles rather than claiming a liveness guarantee we can't check.
    readonly exit: Promise<DeviceExitInfo> = new Promise<DeviceExitInfo>(() => {});

    #inner: Subject;
    #id: string;
    #queue: LineQueue;
    #releaseLogOrigin: () => void;

    constructor(inner: Subject, id: string, environment: Environment) {
        if (deviceQueues.has(id)) {
            throw new InternalError(
                `MatterJsCertDevice "${id}" is already registered; two live devices with the same id would ` +
                    "misattribute each other's logs (deviceQueues is keyed by id) — give each device role a " +
                    "unique id",
            );
        }

        this.#inner = inner;
        this.#id = id;
        this.#queue = new LineQueue();
        deviceQueues.set(id, this.#queue);
        this.#releaseLogOrigin = registerLogOrigin(environment.logOrigin, "device", this.#queue);
        this.log = new LogFollower(this.#queue, id);
    }

    get id() {
        return this.#inner.id;
    }

    get app() {
        return this.#inner.app;
    }

    get commissioning() {
        return this.#inner.commissioning;
    }

    get pics() {
        return this.#inner.pics;
    }

    initialize() {
        return runTaggedForDevice(this.#id, () => this.#inner.initialize());
    }

    start() {
        return runTaggedForDevice(this.#id, () => this.#inner.start());
    }

    stop() {
        return runTaggedForDevice(this.#id, () => this.#inner.stop());
    }

    async close() {
        try {
            await runTaggedForDevice(this.#id, () => this.#inner.close());
        } finally {
            this.#releaseLogOrigin();
            deviceQueues.delete(this.#id);
            this.#queue.close();
        }
    }

    snapshot() {
        return this.#inner.snapshot();
    }

    restore(snapshot: {}) {
        return this.#inner.restore(snapshot);
    }

    backchannel(command: BackchannelCommand) {
        return runTaggedForDevice(this.#id, () => this.#inner.backchannel(command));
    }
}

/**
 * Wraps a `DeviceTestInstanceConstructor` (the same matter.js test-app classes `test/support.ts`
 * registers for py/yaml tests) as a {@link CertDeviceFactory} for the "matterjs" cert flavor.
 */
function MatterJsCertSubject(implementation: DeviceTestInstanceConstructor<NodeTestInstance>): CertDeviceFactory {
    return (domain: string, options?: Subject.Options) => {
        const inner = new implementation({
            domain,
            commandPipeFactory: async () => {},
            discriminator: options?.identity?.discriminator ?? 3840,
            passcode: options?.identity?.passcode ?? 20202021,
            port: options?.identity?.port,
            appArgs: options?.appArgs,
        });
        return new MatterJsCertDevice(inner, `${inner.id}`, inner.env);
    };
}

registerMatterJsCertSubject("all-clusters", MatterJsCertSubject(AllClustersTestInstance));
registerMatterJsCertSubject("bridge", MatterJsCertSubject(BridgeTestInstance));
registerMatterJsCertSubject("lit-icd", MatterJsCertSubject(IcdTestInstance));
registerMatterJsCertSubject("ota-requestor", MatterJsCertSubject(OtaRequestorTestInstance));
registerMatterJsCertSubject("ota-provider", MatterJsCertSubject(OtaProviderTestInstance));

// BDX roles an OTA requestor takes when it downloads an image: it opens the transfer with a
// ReceiveInit and receives the blocks. The CHIP PICS file answers these for a generic device, where
// no app in this suite has the receiver role, so it answers 0 for every app alike. Both flavors'
// requestors were observed in those roles by TC-BDX-1.4 and TC-BDX-2.1, which read this exchange
// from the other side.
const OTA_REQUESTOR_BDX_ROLES = {
    "MCORE.BDX.Receiver": 1,
    "MCORE.BDX.Initiator": 1,
    "MCORE.BDX.SynchronousReceiver": 1,
    "MCORE.BDX.Driver": 1,
} as const;

registerCertAppPics("matterjs", "ota-requestor", {
    ...OTA_REQUESTOR_BDX_ROLES,
    "MCORE.OTA.Requestor": 1,

    // `transferProtocolsSupported` is left at its default, which lists BDX synchronous alone.
    "MCORE.OTA.HTTPS": 0,

    // `CertOtaRequestorServer` implements `requestUserConsent`, and the subject declares `canConsent`.
    "MCORE.OTA.RequestorConsent": 1,

    // Asynchronous transfer is refused outright, whichever side proposes it (`bdxSessionInitiator`).
    "MCORE.BDX.AsynchronousReceiver": 0,

    // matter.js honors an inbound BlockQueryWithSkip but never sends one, and this key asks about
    // sending it.
    "MCORE.BDX.BlockQueryWithSkip": 0,
});

// For chip's requestor, no BDX key beyond the roles: what it does with BlockQueryWithSkip and asynchronous
// transfer has not been observed here. Note this leaves the controller's own answers standing for those
// keys, which describe the controller rather than chip's requestor — a step gated on one of them would
// need this app to declare it first.
//
// The OTA keys are what the app is as this suite starts it. `DefaultOTARequestor` lists BDX synchronous
// alone in ProtocolsSupported. It sends RequestorCanConsent false unless started with
// `--requestorCanConsent true` or with `--userConsentState`, which installs a consent delegate; a case
// passing either through `appArgs` makes the consent answer here wrong. CHIP's own PICS file, which
// describes a generic device, answers both keys `1`.
const CHIP_OTA_REQUESTOR = {
    ...OTA_REQUESTOR_BDX_ROLES,
    "MCORE.OTA.Requestor": 1,
    "MCORE.OTA.HTTPS": 0,
    "MCORE.OTA.RequestorConsent": 0,
} as const;

registerCertAppPics("chip-local", "ota-requestor", CHIP_OTA_REQUESTOR);
registerCertAppPics("chip-docker", "ota-requestor", CHIP_OTA_REQUESTOR);
