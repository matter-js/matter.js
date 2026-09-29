/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as devices from "#devices/index";
import { Endpoint } from "#endpoint/Endpoint.js";
import { EndpointType } from "#endpoint/type/EndpointType.js";
import { AggregatorEndpoint } from "#endpoints/aggregator";
import * as endpoints from "#endpoints/index";
import { ClosurePanelTag, ClosureTag, CommodityTariffCommodityTag } from "#tags/index.js";
import { Bytes } from "@matter/general";
import { Matter } from "@matter/model";
import { MeasurementType, Status } from "@matter/types";
import { AirQuality } from "@matter/types/clusters/air-quality";
import { ApplicationBasic } from "@matter/types/clusters/application-basic";
import { CameraAvStreamManagement } from "@matter/types/clusters/camera-av-stream-management";
import { ColorControl } from "@matter/types/clusters/color-control";
import { DoorLock } from "@matter/types/clusters/door-lock";
import { EnergyEvse } from "@matter/types/clusters/energy-evse";
import { EnergyEvseMode } from "@matter/types/clusters/energy-evse-mode";
import { FanControl } from "@matter/types/clusters/fan-control";
import { JointFabricDatastore } from "@matter/types/clusters/joint-fabric-datastore";
import { MediaPlayback } from "@matter/types/clusters/media-playback";
import { MicrowaveOvenMode } from "@matter/types/clusters/microwave-oven-mode";
import { OperationalState } from "@matter/types/clusters/operational-state";
import { RvcOperationalState } from "@matter/types/clusters/rvc-operational-state";
import { RvcRunMode } from "@matter/types/clusters/rvc-run-mode";
import { Thermostat } from "@matter/types/clusters/thermostat";
import { WaterHeaterManagement } from "@matter/types/clusters/water-heater-management";
import { WaterHeaterMode } from "@matter/types/clusters/water-heater-mode";
import { MockServerNode } from "../../node/mock-server-node.js";
import { createUnjudgedNode, violationsOf } from "./validation-helpers.js";

function isEndpointType(value: unknown): value is EndpointType {
    return (
        typeof value === "object" &&
        value !== null &&
        "deviceType" in value &&
        "behaviors" in value &&
        "deviceRevision" in value
    );
}

/**
 * Every standard generated endpoint type, deduplicated by name.
 */
function standardDeviceTypes() {
    const types = new Map<string, EndpointType>();
    for (const value of [...Object.values(devices), ...Object.values(endpoints)]) {
        if (isEndpointType(value) && !types.has(value.name)) {
            types.set(value.name, value);
        }
    }
    return [...types].sort(([a], [b]) => a.localeCompare(b));
}

const DOOR_LOCK_STATE = {
    lockState: DoorLock.LockState.Locked,
    lockType: DoorLock.LockType.DeadBolt,
    actuatorEnabled: true,
    operatingMode: DoorLock.OperatingMode.Normal,
};

const FAN_CONTROL_STATE = {
    fanMode: FanControl.FanMode.Off,
    fanModeSequence: FanControl.FanModeSequence.OffLowMedHigh,
    percentSetting: 50,
    percentCurrent: 50,
};

const OPERATIONAL_STATE_WITH_ERROR = {
    operationalState: OperationalState.OperationalStateEnum.Stopped,
    operationalStateList: [{ operationalStateId: OperationalState.OperationalStateEnum.Error }],
};

const RVC_OPERATIONAL_STATE_WITH_ERROR = {
    operationalState: RvcOperationalState.OperationalState.Error,
    operationalStateList: [{ operationalStateId: RvcOperationalState.OperationalState.Error }],
};

const RVC_RUN_MODE_STATE = {
    supportedModes: [
        { label: "Idle", mode: 0, modeTags: [{ value: RvcRunMode.ModeTag.Idle }] },
        { label: "Clean", mode: 1, modeTags: [{ value: RvcRunMode.ModeTag.Cleaning }] },
    ],
};

// Manual and TimeOfUse must not appear together on the same mode
const ENERGY_EVSE_MODE_STATE = {
    supportedModes: [
        { label: "Manual", mode: 0, modeTags: [{ value: EnergyEvseMode.ModeTag.Manual }] },
        { label: "Quick", mode: 1, modeTags: [{ value: EnergyEvseMode.ModeTag.TimeOfUse }] },
    ],
};

const MICROWAVE_OVEN_MODE_STATE = {
    supportedModes: [{ label: "Normal", mode: 0, modeTags: [{ value: MicrowaveOvenMode.ModeTag.Normal }] }],
};

const WATER_HEATER_MODE_STATE = {
    supportedModes: [
        { label: "Off", mode: 0, modeTags: [{ value: WaterHeaterMode.ModeTag.Off }] },
        { label: "Manual", mode: 1, modeTags: [{ value: WaterHeaterMode.ModeTag.Manual }] },
    ],
};

const MODE_SELECT_STATE = {
    description: "Test Mode",
    supportedModes: [{ label: "Mode0", mode: 0, semanticTags: [] }],
};

const COLOR_TEMPERATURE_BOUNDS = {
    colorMode: ColorControl.ColorMode.ColorTemperatureMireds,
    colorTempPhysicalMinMireds: 1,
    colorTempPhysicalMaxMireds: 65279,
    coupleColorTempToLevelMinMireds: 1,
};

const SOIL_MOISTURE_LIMITS = {
    measurementType: MeasurementType.SoilMoisture,
    measured: true,
    minMeasuredValue: 20,
    maxMeasuredValue: 80,
    accuracyRanges: [{ rangeMin: 20, rangeMax: 80, percentMax: 1000 }],
};

const THREAD_BORDER_ROUTER_STATE = {
    borderRouterName: "Test Border Router",
    borderAgentId: Bytes.fromHex("0102030405060708090a0b0c0d0e0f10"),
    threadVersion: 4,
    interfaceEnabled: true,
};

const CAMERA_MICROPHONE_CAPABILITIES = {
    maxNumberOfChannels: 1,
    supportedCodecs: [CameraAvStreamManagement.AudioCodec.Opus],
    supportedSampleRates: [48000],
    supportedBitDepths: [16],
};

const CAMERA_VIDEO_SENSOR_PARAMS = {
    sensorWidth: 1920,
    sensorHeight: 1080,
    maxFps: 30,
};

/**
 * Camera exposes the Video, Audio and Snapshot features; AudioDoorbell and Intercom expose Audio only.
 */
const CAMERA_AV_STREAM_MANAGEMENT_AUDIO_STATE = {
    microphoneCapabilities: CAMERA_MICROPHONE_CAPABILITIES,
    allocatedAudioStreams: [],
    microphoneMuted: false,
    microphoneVolumeLevel: 50,
    microphoneMaxLevel: 100,
    microphoneMinLevel: 0,
};

const CAMERA_AV_STREAM_MANAGEMENT_STATE = {
    ...CAMERA_AV_STREAM_MANAGEMENT_AUDIO_STATE,
    maxConcurrentEncoders: 1,
    maxEncodedPixelRate: 10000,
    videoSensorParams: CAMERA_VIDEO_SENSOR_PARAMS,
    minViewportResolution: { width: 640, height: 480 },
    rateDistortionTradeOffPoints: [],
    currentFrameRate: 30,
    allocatedVideoStreams: [],
    viewport: { x1: 0, y1: 0, x2: 1920, y2: 1080 },
    snapshotCapabilities: [],
    allocatedSnapshotStreams: [],
};

/**
 * The smallest state that lets each type build. A type not listed here needs none.
 */
const fixtures: Record<string, object> = {
    AirPurifier: { fanControl: FAN_CONTROL_STATE },
    AirQualitySensor: { airQuality: { airQuality: AirQuality.AirQualityEnum.Good } },
    AudioDoorbell: { cameraAvStreamManagement: CAMERA_AV_STREAM_MANAGEMENT_AUDIO_STATE },
    BasicVideoPlayer: { mediaPlayback: { currentState: MediaPlayback.PlaybackState.NotPlaying } },
    Camera: { cameraAvStreamManagement: CAMERA_AV_STREAM_MANAGEMENT_STATE },
    CastingVideoPlayer: { mediaPlayback: { currentState: MediaPlayback.PlaybackState.NotPlaying } },
    Chime: { chime: { installedChimeSounds: [{ chimeId: 1, name: "Default" }] } },
    Closure: { descriptor: { tagList: [ClosureTag.Door] } },
    ClosurePanel: { descriptor: { tagList: [ClosurePanelTag.Lift] } },
    ColorTemperatureLight: { colorControl: COLOR_TEMPERATURE_BOUNDS },
    ContentApp: {
        applicationBasic: {
            applicationName: "Test App",
            application: { catalogVendorId: 0, applicationId: "test" },
            status: ApplicationBasic.ApplicationStatus.Stopped,
            applicationVersion: "1",
        },
    },
    Dishwasher: { operationalState: OPERATIONAL_STATE_WITH_ERROR },
    DoorLock: { doorLock: DOOR_LOCK_STATE },
    ElectricalEnergyTariff: { descriptor: { tagList: [CommodityTariffCommodityTag.ElectricalEnergy] } },
    EnergyEvse: {
        energyEvse: { supplyState: EnergyEvse.SupplyState.Disabled, faultState: EnergyEvse.FaultState.NoError },
        energyEvseMode: ENERGY_EVSE_MODE_STATE,
    },
    ExtendedColorLight: { colorControl: COLOR_TEMPERATURE_BOUNDS },
    ExtractorHood: { fanControl: FAN_CONTROL_STATE },
    Fan: { fanControl: FAN_CONTROL_STATE },
    Intercom: { cameraAvStreamManagement: CAMERA_AV_STREAM_MANAGEMENT_AUDIO_STATE },
    JointFabricAdministrator: {
        jointFabricDatastore: {
            anchorRootCa: Bytes.fromHex("00"),
            anchorNodeId: 1,
            anchorVendorId: 1,
            friendlyName: "Test Fabric",
            groupKeySetList: [
                {
                    groupKeySetId: 0,
                    groupKeySecurityPolicy: JointFabricDatastore.DatastoreGroupKeySecurityPolicy.TrustFirst,
                    epochKey0: null,
                    epochStartTime0: null,
                    epochKey1: null,
                    epochStartTime1: null,
                    epochKey2: null,
                    epochStartTime2: null,
                },
            ],
            groupList: [
                {
                    groupId: 1,
                    friendlyName: "Test Group",
                    groupKeySetId: null,
                    groupCat: null,
                    groupCatVersion: null,
                    groupPermission: JointFabricDatastore.DatastoreAccessControlEntryPrivilege.View,
                },
            ],
            nodeList: [],
            adminList: [
                {
                    nodeId: 1,
                    friendlyName: "Test Admin",
                    vendorId: 1,
                    icac: Bytes.fromHex("00"),
                },
            ],
            status: {
                state: JointFabricDatastore.DatastoreState.Committed,
                updateTimestamp: 946684800,
                failureCode: Status.Success,
            },
        },
    },
    LaundryDryer: { operationalState: OPERATIONAL_STATE_WITH_ERROR },
    LaundryWasher: { operationalState: OPERATIONAL_STATE_WITH_ERROR },
    MicrowaveOven: {
        operationalState: OPERATIONAL_STATE_WITH_ERROR,
        microwaveOvenMode: MICROWAVE_OVEN_MODE_STATE,
    },
    ModeSelect: { modeSelect: MODE_SELECT_STATE },
    NetworkInfrastructureManager: { threadBorderRouterManagement: THREAD_BORDER_ROUTER_STATE },
    RoboticVacuumCleaner: {
        rvcRunMode: RVC_RUN_MODE_STATE,
        rvcOperationalState: RVC_OPERATIONAL_STATE_WITH_ERROR,
    },
    SoilSensor: { soilMeasurement: { soilMoistureMeasurementLimits: SOIL_MOISTURE_LIMITS } },
    TemperatureControlledCabinet: {
        temperatureControl: { minTemperature: 0, maxTemperature: 1000, temperatureSetpoint: 400 },
    },
    ThreadBorderRouter: { threadBorderRouterManagement: THREAD_BORDER_ROUTER_STATE },
    WaterHeater: {
        waterHeaterManagement: { boostState: WaterHeaterManagement.BoostState.Inactive },
        waterHeaterMode: WATER_HEATER_MODE_STATE,
        thermostat: {
            systemMode: Thermostat.SystemMode.Heat,
            controlSequenceOfOperation: Thermostat.ControlSequenceOfOperation.HeatingOnly,
        },
    },
};

/**
 * The exact violations each type is expected to carry once it builds, as `"<kind> <deviceType> <requirement>"`.
 * A type absent from this table is expected to carry none.
 */
const expectedViolations: Record<string, string[]> = {
    AudioDoorbell: ["missing AudioDoorbell Switch"],
    BatteryStorage: [
        "instanceCount BatteryStorage device:ElectricalSensor",
        "instanceCount BatteryStorage device:PowerSource",
        "instanceCount BatteryStorage device:DeviceEnergyManagement",
    ],
    Closure: ["missing Closure ClosureControl"],
    ClosurePanel: ["missing ClosurePanel ClosureDimension"],
    DeviceEnergyManagement: ["missing DeviceEnergyManagement DeviceEnergyManagement"],
    ElectricalMeter: [
        "missing ElectricalMeter ElectricalPowerMeasurement",
        "missing ElectricalMeter ElectricalEnergyMeasurement",
        "instanceCount ElectricalMeter device:ElectricalSensor",
    ],
    ElectricalSensor: ["missing ElectricalSensor PowerTopology"],
    EnergyEvse: [
        "instanceCount EnergyEvse device:PowerSource",
        "instanceCount EnergyEvse device:DeviceEnergyManagement",
        "instanceCount EnergyEvse device:ElectricalSensor",
    ],
    FloodlightCamera: [
        "instanceCount FloodlightCamera device:OnOffLight",
        "instanceCount FloodlightCamera device:Camera",
    ],
    GenericSwitch: ["missing GenericSwitch Switch"],
    HeatPump: [
        "instanceCount HeatPump device:PowerSource",
        "instanceCount HeatPump device:DeviceEnergyManagement",
        "instanceCount HeatPump device:ElectricalSensor",
    ],
    Intercom: ["instanceCount Intercom device:GenericSwitch"],
    IrrigationSystem: ["instanceCount IrrigationSystem device:WaterValve"],
    MicrowaveOven: ["missing MicrowaveOven MicrowaveOvenControl"],
    OccupancySensor: ["missing OccupancySensor OccupancySensing"],
    Oven: ["instanceCount Oven device:TemperatureControlledCabinet", "instanceCount Oven condition:Heater"],
    PowerSource: ["missing PowerSource PowerSource"],
    Pump: ["missing Pump PumpConfigurationAndControl"],
    Refrigerator: [
        "instanceCount Refrigerator device:TemperatureControlledCabinet",
        "instanceCount Refrigerator condition:Cooler",
    ],
    RoomAirConditioner: ["missing RoomAirConditioner Thermostat"],
    SecondaryNetworkInterface: ["missing SecondaryNetworkInterface NetworkCommissioning"],
    SmokeCoAlarm: ["missing SmokeCoAlarm SmokeCoAlarm", "instanceCount SmokeCoAlarm device:PowerSource"],
    SolarPower: ["instanceCount SolarPower device:PowerSource", "instanceCount SolarPower device:ElectricalSensor"],
    Thermostat: ["missing Thermostat Thermostat"],
    VideoDoorbell: ["instanceCount VideoDoorbell device:Camera", "instanceCount VideoDoorbell device:Doorbell"],
    WindowCovering: ["missing WindowCovering WindowCovering"],
};

function explain(e: unknown, depth = 0): string {
    if (!(e instanceof Error) || depth > 4) {
        return String(e);
    }
    const parts = [e.message.split("\n")[0]];
    if (e.cause !== undefined) {
        parts.push(explain(e.cause, depth + 1));
    }
    if ("errors" in e && Array.isArray(e.errors)) {
        for (const inner of e.errors) {
            parts.push(explain(inner, depth + 1));
        }
    }
    return parts.join(" <- ");
}

function violationStringsOf(endpoint: Endpoint) {
    return violationsOf(endpoint).map(v => `${v.kind} ${v.deviceType} ${v.requirement}`);
}

describe("StandardDeviceTypeCorpus", () => {
    const types = standardDeviceTypes();

    it("collects the standard device type corpus", () => {
        expect(types.length).greaterThan(0);
        expect(types.map(([name]) => name))
            .includes("OnOffLight")
            .and.includes("Aggregator");

        // Every collected type's ID must resolve in the model; an unresolvable ID makes the validator judge no
        // requirements and the corpus would then pin an empty violation list for the wrong reason
        for (const [name, type] of types) {
            expect(Matter.deviceTypes(type.deviceType), name).not.undefined;
        }

        // A stale key would never run, so a renamed or removed device type would silently stop being pinned
        const names = new Set(types.map(([name]) => name));
        for (const table of [fixtures, expectedViolations]) {
            for (const key of Object.keys(table)) {
                expect(names.has(key), key).true;
            }
        }
    });

    it("refuses a Closure endpoint without the tags its Descriptor TagList requires", async () => {
        const node = await createUnjudgedNode();
        try {
            const error = await node.add(devices.ClosureDevice, { id: "ep" }).then(
                () => undefined,
                (e: unknown) => e,
            );
            expect(explain(error)).contains("descriptor.state.tagList");
        } finally {
            await node.close();
        }
    });

    for (const [name, type] of types) {
        if (name === "RootNode") {
            // RootNode can only be a node's own root, so it is judged as the root of a node without other endpoints
            it(`judges ${name}`, async () => {
                const node = await MockServerNode.createOnline(undefined, { device: undefined });
                try {
                    expect(violationStringsOf(node)).deep.equals(expectedViolations[name] ?? []);
                } finally {
                    await node.close();
                }
            });
            continue;
        }

        it(`judges ${name}`, async () => {
            const node = await createUnjudgedNode();
            try {
                const parent = name === "BridgedNode" ? await node.add(AggregatorEndpoint, { id: "aggregator" }) : node;

                let endpoint: Endpoint;
                try {
                    endpoint = await parent.add(type, { id: "ep", ...(fixtures[name] ?? {}) });
                } catch (e) {
                    // Preserves the causal chain a bare "Behaviors have errors" hides, e.g. which attribute a
                    // fixture still needs to set
                    expect.fail(`${name} failed to build: ${explain(e)}`);
                }

                expect(violationStringsOf(endpoint)).deep.equals(expectedViolations[name] ?? []);
            } finally {
                await node.close();
            }
        });
    }
});
