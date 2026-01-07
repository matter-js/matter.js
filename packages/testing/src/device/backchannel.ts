/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A command received through an OOB channel from the test implementation to the subject.
 */
export type BackchannelCommand =
    | BackchannelCommand.SimulateLongPress
    | BackchannelCommand.SimulateMultiPress
    | BackchannelCommand.SimulateLatchPosition
    | BackchannelCommand.SimulateSwitchIdle
    | BackchannelCommand.OperationalStateChange
    | BackchannelCommand.RvcErrors
    | BackchannelCommand.RvcNoParameters
    | BackchannelCommand.RvcRemoveMap
    | BackchannelCommand.RvcAddMap
    | BackchannelCommand.RvcRemoveArea
    | BackchannelCommand.RvcAddArea
    | BackchannelCommand.NoParameters;

export namespace BackchannelCommand {
    export interface Subject {
        backchannel(command?: BackchannelCommand): void | Promise<void>;
    }

    export type SimulateLongPress = {
        name: "simulateLongPress";
        endpointId: number;
        buttonId: number;
        longPressDelayMillis: number;
        longPressDurationMillis: number;
    };

    export type SimulateMultiPress = {
        name: "simulateMultiPress";
        endpointId: number;
        buttonId: number;
        multiPressPressedTimeMillis: number;
        multiPressReleasedTimeMillis: number;
        multiPressNumPresses: number;
        featureMap: number;
        multiPressMax: number;
    };

    export type SimulateSwitchIdle = {
        name: "simulateSwitchIdle";
        endpointId: number;
    };

    export type SimulateLatchPosition = {
        name: "simulateLatchPosition";
        endpointId: number;
        positionId: number;
    };

    export type OperationalStateChange = {
        name: "operationalStateChange";
        device: "Generic" | "Oven";
        operation: "Stop" | "OnFault" | "Start" | "Resume" | "Pause"; // Stop only when Running state
        param: number; // Only with OnFault and is the error state Id
    };

    export type RvcNoParameters = {
        name: "reset" | "chargerFound" | "charged" | "charging" | "docked";
    };

    export type RvcErrors = {
        name: "errorEvent";
        error:
            | "unableToStartOrResume"
            | "unableToCompleteOperation"
            | "commandInvalidInState"
            | "failedToFindChargingDock"
            | "stuck"
            | "dustBinMissing"
            | "dustBinFull"
            | "waterTankEmpty"
            | "waterTankMissing"
            | "waterTankLidOpen"
            | "mopCleaningPadMissing";
    };

    export type RvcRemoveMap = {
        name: "removeMap";
        mapId: number;
    };

    export type RvcAddMap = {
        name: "addMap";
        mapId: number;
        mapName: string;
    };

    export type RvcRemoveArea = {
        name: "removeArea";
        areaId: number;
    };

    export type RvcAddArea = {
        name: "addArea";
        areaId: number;
        mapId: number;
        locationName: string;
    };

    export type NoParameters = {
        name: "factoryReset" | "reboot" | "start" | "stop";
    };
}
