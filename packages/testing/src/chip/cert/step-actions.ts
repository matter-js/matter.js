/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AttestationApi,
    CertGroupApi,
    CertIcdClientApi,
    CertNodeApi,
    ControllerAdapter,
    UnsupportedByControllerError,
    WebRtcRequestorApi,
} from "./controller-adapter.js";

/**
 * How a member of the controller API bears on a device: `"action"` may change it, `"none"` reads or touches only the
 * controller, and a {@link Handle} leads to a further part of the API.
 */
type Classification = "action" | "none" | Handle;

interface Handle {
    readonly handle: Table;
}

type Table = Readonly<Record<string, Classification>>;

/** Every member of `T`, optional ones included, so a member added to an interface does not build until classified. */
type Classified<T> = { readonly [K in keyof T]-?: Classification };

const ICD_CLIENT: Classified<CertIcdClientApi> = {
    register: "action",
    unregister: "action",
    stayActive: "action",
    // Subscriptions change what the device reports, as `CertNodeApi.subscribe` does, not its data
    stopSubscription: "none",
    events: "none",
    waitFor: "none",
};

const NODE: Classified<CertNodeApi> = {
    invoke: "action",
    invokeBatch: "action",
    readAttribute: "none",
    readAttributes: "none",
    writeAttribute: "action",
    writeAttributes: "action",
    // A subscription changes what the device reports, not its data
    subscribe: "none",
    readEvents: "none",
    subscribeEvents: "none",
    observeEvents: "none",
    clientEndpoints: "none",
    clientAttribute: "none",
    sessions: "none",
    icdClient: { handle: ICD_CLIENT },
    severTransportConnection: "action",
    serveOtaUpdate: "action",
    announceOtaProvider: "action",
    scriptOtaProvider: "none",
    openCommissioningWindow: "action",
    decommission: "action",
    operationalMdnsInstanceName: "none",
};

const GROUP: Classified<CertGroupApi> = {
    // The key set lives in the controller's own fabric until a node is told about it
    defineKeySet: "none",
    invoke: "action",
};

const ATTESTATION: Classified<AttestationApi> = {
    installRevocations: "none",
};

const WEB_RTC_REQUESTOR: Classified<WebRtcRequestorApi> = {
    endpoint: "none",
    upsertSession: "none",
    removeSession: "none",
    sessions: "none",
    signals: "none",
    nextSignal: "none",
};

const CONTROLLER: Classified<ControllerAdapter> = {
    id: "none",
    start: "none",
    close: "none",
    build: "none",
    commission: "action",
    parseQrPayload: "none",
    parseManualPairingCode: "none",
    node: { handle: NODE },
    group: { handle: GROUP },
    webRtcRequestor: { handle: WEB_RTC_REQUESTOR },
    attestation: { handle: ATTESTATION },
    log: "none",
};

/**
 * Counts the controller calls of the current step that may change a device.
 *
 * A call counts when it starts, so one still running when the step ends is counted, and a call that is refused
 * with {@link UnsupportedByControllerError} is taken back: a controller refuses before it sends anything. A call
 * that fails otherwise stays counted, since its request may have reached the device.
 */
export class StepActions {
    #step = 0;
    #count = 0;

    get count() {
        return this.#count;
    }

    nextStep() {
        this.#step++;
        this.#count = 0;
    }

    /** `controller` with every call that may change a device counted toward the step running when it starts. */
    track(controller: ControllerAdapter): ControllerAdapter {
        return this.#wrap(controller, CONTROLLER);
    }

    #wrap<T extends object>(api: T, table: Table): T {
        return new Proxy(api, {
            get: (target, property) => {
                const member: unknown = Reflect.get(target, property, target);
                const classification =
                    typeof property === "string" && Object.hasOwn(table, property) ? table[property] : undefined;
                // Every method runs on the target: the adapters keep their state in private fields, which a
                // Proxy as `this` cannot reach
                if (typeof member === "function") {
                    return (...args: unknown[]) => {
                        if (classification === "action") {
                            return this.#act(() => Reflect.apply(member, target, args));
                        }
                        const result: unknown = Reflect.apply(member, target, args);
                        return typeof classification === "object" && isApi(result)
                            ? this.#wrap(result, classification.handle)
                            : result;
                    };
                }
                return typeof classification === "object" && isApi(member)
                    ? this.#wrap(member, classification.handle)
                    : member;
            },
        });
    }

    #act(call: () => unknown): unknown {
        const step = this.#step;
        this.#count++;
        const refused = (error: unknown) => {
            if (error instanceof UnsupportedByControllerError && step === this.#step) {
                this.#count--;
            }
        };

        let result: unknown;
        try {
            result = call();
        } catch (error) {
            refused(error);
            throw error;
        }
        if (result instanceof Promise) {
            return result.catch((error: unknown) => {
                refused(error);
                throw error;
            });
        }
        return result;
    }
}

/** An API object to wrap, as opposed to a value or a promise of one, which a Proxy would break. */
function isApi(value: unknown): value is object {
    return typeof value === "object" && value !== null && !("then" in value);
}
