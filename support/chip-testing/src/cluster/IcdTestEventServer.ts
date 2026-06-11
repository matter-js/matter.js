/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Millis, Seconds, Time, Timer } from "@matter/general";
import { NodeLifecycle } from "@matter/main";
import { GeneralDiagnosticsServer } from "@matter/main/behaviors/general-diagnostics";
import { IcdManagementServer } from "@matter/main/behaviors/icd-management";
import { IcdManagement } from "@matter/main/clusters";
import { TestGeneralDiagnosticsServer } from "./TestGeneralDiagnosticsServer.js";

// ICD Management cluster test-event-trigger codes (cluster id 0x46 in the high 16 bits).
const ICD_ADD_ACTIVE_MODE = 0x0046000000000001n;
const ICD_REMOVE_ACTIVE_MODE = 0x0046000000000002n;
const ICD_DSLS_FORCE_SIT = 0x0046000000000006n;
const ICD_DSLS_WITHDRAW_SIT = 0x0046000000000007n;

/**
 * Root-endpoint behavior for the lit-icd test app. Two jobs:
 *  1. Map ICD TestEventTriggers onto the device-side ICD API.
 *  2. Drive a fixed idle↔active cadence so a registered client receives unsolicited Check-Ins. Production matter.js
 *     ICD is externally driven (never sleeps on its own), so this simulates the scheduled cycling that the CHIP SDK's
 *     ICDManager does natively. The cadence runs on our own timers — a bounded `activeModeDuration` active window then
 *     an `idleModeDuration` idle window — rather than the spec-layer `mayEnterIdleMode` signal, which inbound
 *     subscription traffic keeps deferring (so the device would otherwise never return to idle, and Check-Ins would
 *     not resume promptly after a subscription is torn down — see TC_ICDB_2_2).
 */
export class IcdTestEventServer extends TestGeneralDiagnosticsServer {
    declare protected internal: IcdTestEventServer.Internal;

    override initialize() {
        super.initialize();

        if (this.endpoint.behaviors.has(IcdManagementServer)) {
            const events = this.endpoint.eventsOf(IcdManagementServer);
            this.reactTo(events.activeModeEntered, this.#onActiveEntered, { lock: true });
            this.reactTo(events.idleModeEntered, this.#onIdleEntered, { lock: true });
            this.reactTo((this.endpoint.lifecycle as NodeLifecycle).goingOffline, this.#stopTimers, { lock: true });
        }
    }

    override triggerTestEvent(eventTrigger: number | bigint) {
        const code = BigInt(eventTrigger);
        switch (code) {
            case ICD_ADD_ACTIVE_MODE:
                this.internal.keepActive = true;
                this.agent.get(IcdManagementServer).requestActiveMode();
                return;
            case ICD_REMOVE_ACTIVE_MODE:
                this.internal.keepActive = false;
                return;
            case ICD_DSLS_FORCE_SIT:
                this.agent.get(IcdManagementServer).setOperatingMode(IcdManagement.OperatingMode.Sit);
                return;
            case ICD_DSLS_WITHDRAW_SIT:
                this.agent.get(IcdManagementServer).withdrawForcedOperatingMode();
                return;
            default:
                // Counter/back-off triggers (…03/…04/…05) are out of v1 scope; delegate the rest
                // (incl. the DGGEN fault triggers) to TestGeneralDiagnosticsServer.
                super.triggerTestEvent(eventTrigger);
        }
    }

    #onActiveEntered() {
        this.#armActiveWindow();
    }

    #armActiveWindow() {
        this.#stopTimers();
        const icd = this.agent.get(IcdManagementServer);
        this.internal.activeTimer = Time.getTimer(
            "icd-test-active-window",
            Millis(icd.state.activeModeDuration),
            this.callback(this.#onActiveWindowDone, { lock: true }),
        ).start();
    }

    #onActiveWindowDone() {
        // AddActiveModeReq holds the device active: re-arm the active window instead of sleeping.
        if (this.internal.keepActive) {
            this.#armActiveWindow();
            return;
        }
        this.agent.get(IcdManagementServer).enterIdleMode();
    }

    #onIdleEntered() {
        this.#stopTimers();
        const icd = this.agent.get(IcdManagementServer);
        this.internal.idleTimer = Time.getTimer(
            "icd-test-idle-window",
            Seconds(icd.state.idleModeDuration),
            this.callback(this.#onIdleWindowDone, { lock: true }),
        ).start();
    }

    #onIdleWindowDone() {
        this.agent.get(IcdManagementServer).requestActiveMode();
    }

    #stopTimers() {
        this.internal.activeTimer?.stop();
        this.internal.idleTimer?.stop();
        this.internal.activeTimer = undefined;
        this.internal.idleTimer = undefined;
    }

    override async [Symbol.asyncDispose]() {
        this.#stopTimers();
        await super[Symbol.asyncDispose]?.();
    }
}

export namespace IcdTestEventServer {
    export class Internal extends GeneralDiagnosticsServer.Internal {
        keepActive = false;
        activeTimer?: Timer;
        idleTimer?: Timer;
    }
}
