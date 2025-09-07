/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ValueSupervisor } from "#behavior/supervision/ValueSupervisor.js";
import { NetworkRuntime } from "#behavior/system/network/NetworkRuntime.js";
import type { ServerNetworkRuntime } from "#behavior/system/network/ServerNetworkRuntime.js";
import { NetworkCommissioningServer } from "#behaviors/network-commissioning";
import { TimeSynchronizationBehavior } from "#behaviors/time-synchronization";
import { GeneralDiagnostics } from "#clusters/general-diagnostics";
import type { Endpoint } from "#endpoint/Endpoint.js";
import {
    Bytes,
    Duration,
    Hours,
    ImplementationError,
    ipv4ToBytes,
    Logger,
    MaybePromise,
    Millis,
    Minutes,
    Seconds,
    Time,
    Timer,
    Timespan,
} from "#general";
import { FieldElement, Specification } from "#model";
import type { NodeLifecycle } from "#node/NodeLifecycle.js";
import { assertRemoteActor, MdnsService, Val } from "#protocol";
import { CommandId, StatusCode, StatusResponseError, TlvInvokeResponse } from "#types";
import { GeneralDiagnosticsBehavior } from "./GeneralDiagnosticsBehavior.js";

const logger = Logger.get("GeneralDiagnosticsServer");

// Enable DataModelTest feature by default because we use MaxPathsPerInvoke > 1 by default
const Base = GeneralDiagnosticsBehavior.with(GeneralDiagnostics.Feature.DataModelTest);

// Enhance the Schema to store the real operational hours counter we internally use and persist this
const schema = Base.schema!.extend({
    children: [FieldElement({ name: "totalOperationalHoursCounter", type: "uint64", quality: "N" })],
});

/**
 * This is the default server implementation of GeneralDiagnosticsBehavior.
 *
 * The implementation provides convenience methods to register and clear hardware, radio, and network faults and to
 * handle test Event triggers.
 *
 * To handle test Event triggers please override the triggerTestEvent method. If these test events are used in
 * certification please also set the EnableKey in the enhanced state as `deviceTestEnableKey`.
 *
 * To register or clear hardware, radio, and network faults, please use the provided convenience methods:
 * * registerHardwareFault and clearHardwareFault
 * * registerRadioFault and clearRadioFault
 * * registerNetworkFault and clearNetworkFault
 * If you want to send events when faults are registered or cleared you need to enable these events when the Root
 * Endpoint gets initialized.
 */
export class GeneralDiagnosticsServer extends Base {
    declare protected internal: GeneralDiagnosticsServer.Internal;
    declare state: GeneralDiagnosticsServer.State;
    schema = schema;

    override initialize(): MaybePromise {
        if (this.state.testEventTriggersEnabled === undefined) {
            this.state.testEventTriggersEnabled = false;
        } else if (this.state.testEventTriggersEnabled) {
            const enableKey = Bytes.of(this.state.deviceTestEnableKey);
            if (enableKey.every(byte => byte === 0)) {
                throw new ImplementationError("Test event triggers are enabled but no deviceTestEnableKey is set.");
            }
            logger.warn("Test event triggers are enabled. Make sure to disable them in production.");
        }

        if (this.state.rebootCount === undefined) {
            this.state.rebootCount = 0;
        } else {
            this.state.rebootCount++;
        }

        const lifecycle = this.endpoint.lifecycle as NodeLifecycle;
        this.reactTo(lifecycle.online, this.#online, { lock: true });
        this.reactTo(lifecycle.goingOffline, this.#goingOffline, { lock: true });

        if (this.events.activeHardwareFaults$Changed !== undefined) {
            this.reactTo(this.events.activeHardwareFaults$Changed, this.#triggerActiveHardwareFaultsChangedEvent);
        }
        if (this.events.activeRadioFaults$Changed !== undefined) {
            this.reactTo(this.events.activeRadioFaults$Changed, this.#triggerActiveRadioFaultsChangedEvent);
        }
        if (this.events.activeNetworkFaults$Changed !== undefined) {
            this.reactTo(this.events.activeNetworkFaults$Changed, this.#triggerActiveNetworkFaultsChangedEvent);
        }
    }

    #validateTestEnabledKey(enableKey: Bytes) {
        const keyData = Bytes.of(enableKey);
        if (keyData.every(byte => byte === 0)) {
            throw new StatusResponseError("Invalid test enable key, all zeros", StatusCode.ConstraintError);
        }
        const expectedKeyData = Bytes.of(this.state.deviceTestEnableKey);
        keyData.forEach((byte, index) => {
            if (byte !== expectedKeyData[index]) {
                throw new StatusResponseError("Invalid test enable key", StatusCode.ConstraintError);
            }
        });
    }

    override testEventTrigger({ eventTrigger, enableKey }: GeneralDiagnostics.TestEventTriggerRequest): MaybePromise {
        this.#validateTestEnabledKey(enableKey);

        this.triggerTestEvent(eventTrigger);
    }

    protected triggerTestEvent(eventTrigger: number | bigint) {
        throw new StatusResponseError(`Unsupported test event trigger ${eventTrigger}`, StatusCode.InvalidCommand);
    }

    override timeSnapshot(): MaybePromise<GeneralDiagnostics.TimeSnapshotResponse> {
        const time = Time.nowMs;

        // TC_DGGEN_2_4.py fails us if we set this without TimeSynchronizationCluster support.  Spec is worded poorly
        // but my read of "SHALL only if" is "may not unless" and not "SHALL if and only if".  But conforming to tests
        // for now
        const posixTimeMs =
            this.agent.has(TimeSynchronizationBehavior) &&
            this.agent.get(TimeSynchronizationBehavior).state.utcTime !== null
                ? time
                : null;

        return {
            systemTimeMs: time - Time.startup.systemMs,
            posixTimeMs,
        };
    }

    override payloadTestRequest({
        enableKey,
        value,
        count,
    }: GeneralDiagnostics.PayloadTestRequest): MaybePromise<GeneralDiagnostics.PayloadTestResponse> {
        this.#validateTestEnabledKey(enableKey);

        if (!this.state.testEventTriggersEnabled) {
            throw new StatusResponseError("Test event triggers are disabled", StatusCode.ConstraintError);
        }

        const payload = new Uint8Array(count).fill(value);

        // In our case encoding is done completely on an upper layer, so we need to build a dummy single response to get the size
        // Formal note: This is not 100% accurate and we might be some bytes to huge (moreChunkedMessages, commandRef)
        // but near enough
        const responseSize = TlvInvokeResponse.encode({
            suppressResponse: false,
            interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
            moreChunkedMessages: true,
            invokeResponses: [
                {
                    command: {
                        commandPath: {
                            endpointId: this.endpoint.number,
                            clusterId: GeneralDiagnostics.Complete.id,
                            commandId: CommandId(0x04), // Hardcode for now
                        },
                        commandRef: 0,
                        commandFields: GeneralDiagnostics.TlvPayloadTestResponse.encodeTlv({
                            payload,
                        }),
                    },
                },
            ],
        }).byteLength;

        assertRemoteActor(this.context);
        const { exchange } = this.context;

        if (responseSize > exchange.maxPayloadSize) {
            throw new StatusResponseError("Response too large", StatusCode.ResourceExhausted);
        }

        return {
            payload,
        };
    }

    /**
     * Register a hardware fault. This convenience method updates the activeHardwareFaults attribute and sends out the
     * HardwareFaultChanged event. Make sure to clear the fault when it is resolved.
     * This method requires that the activeHardwareFaults attribute is activated when the cluster gets initialized.
     *
     * @param faultType The hardware fault to register.
     */
    registerHardwareFault(faultType: GeneralDiagnostics.HardwareFault) {
        const currentFaults = this.requireAttributeEnabled("activeHardwareFaults");
        const list = currentFaults.filter(fault => fault !== faultType);
        list.push(faultType);
        this.state.activeHardwareFaults = list;
    }

    /**
     * Clear a hardware fault. This convenience method updates the activeHardwareFaults attribute and sends out the
     * HardwareFaultChanged event.
     *
     * @param faultType The hardware fault to clear.
     */
    clearHardwareFault(faultType: GeneralDiagnostics.HardwareFault) {
        const currentFaults = this.requireAttributeEnabled("activeHardwareFaults");
        this.state.activeHardwareFaults = currentFaults.filter(fault => fault !== faultType);
    }

    #triggerActiveHardwareFaultsChangedEvent(
        current: GeneralDiagnostics.HardwareFault[],
        previous: GeneralDiagnostics.HardwareFault[],
    ) {
        this.events.hardwareFaultChange?.emit(
            {
                current,
                previous,
            },
            this.context,
        );
    }

    /**
     * Register a radio fault. This convenience method updates the activeRadioFaults attribute and sends out the
     * RadioFaultChanged event. Make sure to clear the fault when it is resolved.
     * This method requires that the activeRadioFaults attribute is activated when the cluster gets initialized.
     *
     * @param faultType The radio fault to register.
     */
    registerRadioFault(faultType: GeneralDiagnostics.RadioFault) {
        const currentFaults = this.requireAttributeEnabled("activeRadioFaults");
        const list = currentFaults.filter(fault => fault !== faultType);
        list.push(faultType);
        this.state.activeRadioFaults = list;
    }

    /**
     * Clear a radio fault. This convenience method updates the activeRadioFaults attribute and sends out the
     * RadioFaultChanged event.
     *
     * @param faultType The radio fault to clear.
     */
    clearRadioFault(faultType: GeneralDiagnostics.RadioFault) {
        const currentFaults = this.requireAttributeEnabled("activeRadioFaults");
        this.state.activeRadioFaults = currentFaults.filter(fault => fault !== faultType);
    }

    #triggerActiveRadioFaultsChangedEvent(
        current: GeneralDiagnostics.RadioFault[],
        previous: GeneralDiagnostics.RadioFault[],
    ) {
        this.events.radioFaultChange?.emit(
            {
                current,
                previous,
            },
            this.context,
        );
    }

    /**
     * Register a network fault. This convenience method updates the activeNetworkFaults attribute and sends out the
     * NetworkFaultChanged event. Make sure to clear the fault when it is resolved.
     * This method requires that the activeNetworkFaults attribute is activated when the cluster gets initialized.
     *
     * @param faultType The network fault to register.
     */
    registerNetworkFault(faultType: GeneralDiagnostics.NetworkFault) {
        const currentFaults = this.requireAttributeEnabled("activeNetworkFaults");
        const list = currentFaults.filter(fault => fault !== faultType);
        list.push(faultType);
        this.state.activeNetworkFaults = list;
    }

    /**
     * Clear a network fault. This convenience method updates the activeNetworkFaults attribute and sends out the
     * NetworkFaultChanged event.
     *
     * @param faultType The network fault to clear.
     */
    clearNetworkFault(faultType: GeneralDiagnostics.NetworkFault) {
        const currentFaults = this.requireAttributeEnabled("activeNetworkFaults");
        this.state.activeNetworkFaults = currentFaults.filter(fault => fault !== faultType);
    }

    #triggerActiveNetworkFaultsChangedEvent(
        current: GeneralDiagnostics.NetworkFault[],
        previous: GeneralDiagnostics.NetworkFault[],
    ) {
        this.events.networkFaultChange?.emit(
            {
                current,
                previous,
            },
            this.context,
        );
    }

    async #online() {
        this.events.bootReason.emit(
            { bootReason: this.state.bootReason ?? GeneralDiagnostics.BootReason.Unspecified },
            this.context,
        );

        // Update the timestamps now that node is really online.
        this.internal.lastTotalOperationalHoursCounterUpdateTime = Time.nowMs;

        this.internal.lastTotalOperationalHoursTimer = Time.getPeriodicTimer(
            "GeneralDiagnostics.operationalHours",
            Minutes(5),
            this.callback(this.#updateTotalOperationalHoursCounter),
        ).start();

        await this.#updateNetworkList();
    }

    #goingOffline() {
        this.internal.lastTotalOperationalHoursTimer?.stop();
        this.#updateTotalOperationalHoursCounter();
    }

    #updateTotalOperationalHoursCounter() {
        const now = Time.nowMs;
        const elapsedTime = Timespan(this.internal.lastTotalOperationalHoursCounterUpdateTime, now).duration;
        this.state.totalOperationalHoursCounter = Millis(this.state.totalOperationalHoursCounter + elapsedTime);
        this.internal.lastTotalOperationalHoursCounterUpdateTime = now;
    }

    async #updateNetworkList() {
        const mdnsService = this.env.get(MdnsService);
        const mdnsLimitedToNetworkInterfaces = mdnsService.limitedToNetInterface;

        const networkRuntime = this.env.get(NetworkRuntime) as ServerNetworkRuntime;
        const systemNetworkInterfaces = await networkRuntime.getNetworkInterfaces();

        // Determine the network type for all interfaces based on the Network Commissioning Server on the root endpoint
        // TODO: Find a way if needed to handle devices connected with multiple technologies and report that correctly
        //       but irrelevant for now because noone expects that (including chip)
        let networkType = GeneralDiagnostics.InterfaceType.Ethernet;
        if (this.endpoint.behaviors.has(NetworkCommissioningServer)) {
            const networkCommissioning = this.agent.get(NetworkCommissioningServer);
            if (
                "wiFiNetworkInterface" in networkCommissioning.features &&
                networkCommissioning.features.wiFiNetworkInterface
            ) {
                networkType = GeneralDiagnostics.InterfaceType.WiFi;
            } else if (
                "threadNetworkInterface" in networkCommissioning.features &&
                networkCommissioning.features.threadNetworkInterface
            ) {
                networkType = GeneralDiagnostics.InterfaceType.Thread;
            }
        }

        // If we only announce on one network interface, also consider this onw as only operational one (because noone
        // else should connect to the others even if we listen
        const isOperationalReachable =
            mdnsLimitedToNetworkInterfaces === undefined
                ? () => true
                : (name: string) => {
                      return name === mdnsLimitedToNetworkInterfaces;
                  };

        // Filter all unassigned MACs out, sort operational on top, limit to 8 entries and map to the required format.
        this.state.networkInterfaces = systemNetworkInterfaces
            .filter(({ mac }) => mac !== "00:00:00:00:00:00")
            .sort(({ name: nameA }, { name: nameB }) => {
                // sort operational entries on top, others to bottom
                if (isOperationalReachable(nameA) && !isOperationalReachable(nameB)) {
                    return -1;
                }
                if (!isOperationalReachable(nameA) && isOperationalReachable(nameB)) {
                    return 1;
                }
                return 0;
            })
            .slice(0, 8)
            .map(({ name, mac, ipV4, ipV6, type }) => ({
                name: name.substring(0, 32),
                isOperational: isOperationalReachable(name),
                offPremiseServicesReachableIPv4: null, // null means unknown or not supported
                offPremiseServicesReachableIPv6: null, // null means unknown or not supported
                hardwareAddress: Bytes.fromHex(mac.replace(/[^\da-f]/gi, "")),
                iPv4Addresses: ipV4.slice(0, 4).map(ip => ipv4ToBytes(ip)),
                iPv6Addresses: ipV6.slice(0, 8).map(ip => ipv4ToBytes(ip)),
                type: type ?? networkType,
            }));
    }
}

export namespace GeneralDiagnosticsServer {
    export class Internal {
        /** Last time the total operational hours counter was updated. */
        lastTotalOperationalHoursCounterUpdateTime = Time.nowMs;

        /** Timer to update the total operational hours counter every 5 minutes. */
        lastTotalOperationalHoursTimer: Timer | undefined;
    }

    export class State extends Base.State {
        /** Internal counter of the total time, updated every 5 minutes. */
        totalOperationalHoursCounter: Duration = 0;

        /** The TestEnableKey set for this device for the test commands. Default means "not enabled"." */
        deviceTestEnableKey: Bytes = new Uint8Array(16).fill(0);

        [Val.properties](endpoint: Endpoint, _session: ValueSupervisor.Session) {
            return {
                /**
                 * Report uptime
                 *
                 * This value is not available for subscription so we compute dynamically.
                 *
                 * As of 1.4 the spec does not specify what should be considered the "start time" for computing uptime.
                 * They just say "since the device's last reboot".  This could be from power on, or from when the device
                 * is first usable by a user, when it's first available online, etc.
                 *
                 * The tests however expect uptime to reset after factory reset.  So we consider "time brought online"
                 * our boot time.
                 */
                get upTime() {
                    const onlineAt = (endpoint.lifecycle as NodeLifecycle).onlineAt;
                    if (onlineAt === undefined) {
                        return 0;
                    }

                    return Seconds.of(Timespan(onlineAt, Time.nowMs).duration);
                },

                /**
                 * Dynamically calculate the operating Hours from our internal counter. This is ok because the attribute
                 * is not send out via subscriptions anyway.
                 */
                get totalOperationalHours() {
                    const { lastTotalOperationalHoursCounterUpdateTime } =
                        endpoint.behaviors.internalsOf(GeneralDiagnosticsServer);

                    const timeSinceLastUpdate = Timespan(
                        lastTotalOperationalHoursCounterUpdateTime,
                        Time.nowMs,
                    ).duration;

                    const timeAsOfLastUpdate = endpoint.stateOf(GeneralDiagnosticsServer).totalOperationalHoursCounter;

                    const totalOperationalTime = Millis(timeAsOfLastUpdate + timeSinceLastUpdate);

                    return Hours.of(totalOperationalTime);
                },
            };
        }
    }

    export declare const ExtensionInterface: {
        triggerTestEvent: (eventTrigger: number | bigint) => void;
        registerHardwareFault: (
            current: GeneralDiagnostics.HardwareFault[],
            previous: GeneralDiagnostics.HardwareFault[],
        ) => void;
        registerRadioFault: (
            current: GeneralDiagnostics.RadioFault[],
            previous: GeneralDiagnostics.RadioFault[],
        ) => void;
        registerNetworkFault: (
            current: GeneralDiagnostics.NetworkFault[],
            previous: GeneralDiagnostics.NetworkFault[],
        ) => void;
        clearHardwareFault: (faultType: GeneralDiagnostics.HardwareFault) => void;
        clearRadioFault: (faultType: GeneralDiagnostics.RadioFault) => void;
        clearNetworkFault: (faultType: GeneralDiagnostics.NetworkFault) => void;
    };
}
