/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Boot, Environment, InternalError, LogDestination, LogFormat, Logger, RuntimeService } from "@matter/main";
import type {
    BackchannelCommand,
    CertDevice,
    CertDeviceFactory,
    DeviceExitInfo,
    DeviceFlavor,
    Subject,
} from "@matter/testing";
import { LineQueue, LogFollower, registerControllerAdapterFactory, registerMatterJsCertSubject } from "@matter/testing";
import { AsyncLocalStorage } from "node:async_hooks";
import { join } from "node:path";
import { env } from "node:process";
import { AllClustersTestInstance } from "../AllClustersTestInstance.js";
import { BridgeTestInstance } from "../BridgeTestInstance.js";
import { DeviceTestInstanceConstructor } from "../GenericTestApp.js";
import { NodeTestInstance } from "../NodeTestInstance.js";
import { CHIP_TOOL_CONTROLLER_PICS, ChipToolControllerAdapter } from "./ChipToolControllerAdapter.js";
import { InProcessControllerAdapter, MATTERJS_CONTROLLER_PICS } from "./InProcessControllerAdapter.js";

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
    Logger.destinations["cert-matterjs-device"] = LogDestination({
        name: "cert-matterjs-device",
        format: LogFormat.formats.plain,
        write(text: string) {
            const id = activeDeviceId.getStore();
            const queue = id === undefined ? undefined : deviceQueues.get(id);
            if (queue !== undefined) {
                queue.push(text);
                return;
            }

            // A line nobody claims still has to be seen. matter.js reports a crashed endpoint and a
            // crashed runtime through this logger, and both happen outside the calls this tags — a
            // node tearing down, a construction rejecting on its own microtask — so dropping the
            // unattributed lines hides exactly the failures worth reading.
            console.error(text);
        },
    });
});

function runTaggedForDevice<T>(id: string, fn: () => Promise<T>): Promise<T> {
    return activeDeviceId.run(id, fn);
}

/**
 * Adds {@link CertDevice}'s extra fields (`log`/`flavor`/`exit`) to an in-process matter.js test
 * subject by delegation, so `cert-dsl.ts` (which cannot depend on matter.js) never needs to
 * construct or cast one itself.
 *
 * Log attribution is best-effort: `initialize()`/`start()`/`stop()`/`close()` tag the matter.js
 * `Logger` sink with this device's id via `AsyncLocalStorage`, which Node propagates through any
 * async work descending from those calls (including most of a server node's own background
 * activity).
 *
 * **A cert test may now declare several devices, so several of these do run concurrently.** Each
 * node's own transport and storage are created inside `runTaggedForDevice`, so its own lines carry
 * its own tag. What this cannot tag correctly is a service resolved lazily from the shared parent
 * environment during whichever device happened to start first: that resolution captures the first
 * device's tag for good, and lines it later emits on behalf of another device land in the first
 * device's log. Attribution is therefore reliable for a device's own interactions — which is what a
 * step's device-log checks read — and not for shared-service chatter. A step that must attribute a
 * line to one of several devices should assert on something only that device says.
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

    constructor(inner: Subject, id: string) {
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
        return new MatterJsCertDevice(inner, `${inner.id}`);
    };
}

registerMatterJsCertSubject("all-clusters", MatterJsCertSubject(AllClustersTestInstance));
registerMatterJsCertSubject("bridge", MatterJsCertSubject(BridgeTestInstance));
