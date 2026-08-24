/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Boot, InternalError, LogDestination, LogFormat, Logger } from "@matter/main";
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

registerControllerAdapterFactory("matterjs", id => new InProcessControllerAdapter(id), MATTERJS_CONTROLLER_PICS);
registerControllerAdapterFactory("chip-tool", id => new ChipToolControllerAdapter(id), CHIP_TOOL_CONTROLLER_PICS);

// EvidenceRecorder (packages/testing, generic) has no knowledge of this package's own directory
// layout; this is the seam cert-dsl.ts documents for choosing an outDir. matter-test's working
// directory is already this package's root while tests run, so this is package-relative.
env.MATTER_CERT_EVIDENCE_DIR ??= join(process.cwd(), "build/cert-evidence");

const activeDeviceId = new AsyncLocalStorage<string>();
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
            if (id === undefined) {
                return;
            }
            deviceQueues.get(id)?.push(text);
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
 * activity). It does not guarantee attribution for every line if multiple matterjs-flavored devices
 * ever ran concurrently in one process — today's cert tests only ever activate one at a time.
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
            discriminator: 3840,
            passcode: 20202021,
            appArgs: options?.appArgs,
        });
        return new MatterJsCertDevice(inner, `${inner.id}`);
    };
}

registerMatterJsCertSubject("all-clusters", MatterJsCertSubject(AllClustersTestInstance));
registerMatterJsCertSubject("bridge", MatterJsCertSubject(BridgeTestInstance));
