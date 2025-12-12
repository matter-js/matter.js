/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as MatterClusters from "#clusters";
import { capitalize } from "#general";
import { MatterModel } from "#model";
import { ClusterId, DeviceTypeId } from "#types";

/**
 * General device classification categories.
 */
export enum DeviceClasses {
    /** Node device type. */
    Node = "Node",

    /**
     * Utility device type.
     * A Utility device type supports configuration and settings.
     */
    Utility = "Utility",

    /**
     * Application device type.
     * Application devices types are typically the most datatype endpoints on a node and in the network.
     */
    App = "App",

    /**
     * Simple device type.
     * A Simple device type supports local control that is persistent, independent, and unsupervised.
     */
    Simple = "Simple",

    /**
     * Dynamic device type.
     * A Dynamic device type supports intelligent and supervisory services, such as commissioning,
     * monitoring, trend analysis, scheduling and central management. A dynamic device type is an
     * application device type.
     */
    Dynamic = "Dynamic",

    /** There exists a client application cluster on the endpoint. */
    Client = "Client",

    /** There exists a server application cluster on the endpoint. */
    Server = "Server",

    /** The device type is composed of 2 or more device types. */
    Composed = "Composed",

    /** Composed device type that is composed of 2 or more endpoints with the same device type. */
    Multiple = "Multiple",

    /** The endpoint is an Initiator for Zigbee EZ-Mode Finding & Binding. */
    "EZInitiator" = "EZ-Initiator",

    /** The endpoint is a Target for Zigbee EZ-Mode Finding & Binding. */
    "EZTarget" = "EZ-Target",

    /**
     * The endpoint represents a Bridged Device, for which information about the state of
     * its power source is available to the Bridge
     */
    BridgedPowerSourceInfo = "BridgedPowerSourceInfo",
}

export interface DeviceTypeDefinition {
    name: string;
    code: DeviceTypeId;
    deviceClass: DeviceClasses;
    superSet?: string;
    revision: number;
    requiredServerClusters: ClusterId[];
    optionalServerClusters: ClusterId[];
    requiredClientClusters: ClusterId[];
    optionalClientClusters: ClusterId[];
    unknown: boolean;
}

export const DeviceTypeDefinition = ({
    name,
    code,
    deviceClass,
    superSet,
    revision,
    requiredServerClusters = [],
    optionalServerClusters = [],
    requiredClientClusters = [],
    optionalClientClusters = [],
    unknown = false,
}: {
    name: string;
    code: number;
    deviceClass: DeviceClasses;
    superSet?: string;
    revision: number;
    requiredServerClusters?: ClusterId[];
    optionalServerClusters?: ClusterId[];
    requiredClientClusters?: ClusterId[];
    optionalClientClusters?: ClusterId[];
    unknown?: boolean;
}): DeviceTypeDefinition => ({
    name,
    code: DeviceTypeId(code),
    deviceClass,
    superSet,
    revision,
    requiredServerClusters,
    optionalServerClusters,
    requiredClientClusters,
    optionalClientClusters,
    unknown,
});

/**
 * @deprecated These definitions will not be updated beyond Matter 1.1, please instead use definitions in ../endpoint.
 */
export const DeviceTypes: { [key: string]: DeviceTypeDefinition } = {
    // Utility Device Types
    // A Utility device type supports configuration and settings.
    /**
     * This represents a Root Node for devices.
     * @see {@link MatterSpecification.v10.Device} § 2.1
     */
    ROOT: DeviceTypeDefinition({
        name: "MA-rootdevice",
        code: 0x0016,
        deviceClass: DeviceClasses.Node,
        revision: 1,
        requiredServerClusters: [
            MatterClusters.BasicInformationCluster.id,
            MatterClusters.AccessControlCluster.id,
            MatterClusters.GroupKeyManagementCluster.id,
            MatterClusters.GeneralCommissioningCluster.id,
            MatterClusters.AdministratorCommissioningCluster.id,
            MatterClusters.OperationalCredentialsCluster.id,
            MatterClusters.GeneralDiagnosticsCluster.id,
        ],
        optionalServerClusters: [
            MatterClusters.PowerSourceConfigurationCluster.id,
            MatterClusters.TimeSynchronizationCluster.id,
            MatterClusters.NetworkCommissioningCluster.id, // mandatory if !CustomNetworkConfig
            MatterClusters.LocalizationConfigurationCluster.id, // mandatory if LanguageLocale
            MatterClusters.TimeFormatLocalizationCluster.id, // mandatory if TimeLocale
            MatterClusters.UnitLocalizationCluster.id, // mandatory if UnitLocale
            MatterClusters.DiagnosticLogsCluster.id,
            MatterClusters.SoftwareDiagnosticsCluster.id,
            MatterClusters.EthernetNetworkDiagnosticsCluster.id, // optional if Ethernet
            MatterClusters.WiFiNetworkDiagnosticsCluster.id, // optional if WiFi
            MatterClusters.ThreadNetworkDiagnosticsCluster.id, // optional if Thread
        ],
    }),

    /**
     * This represents a Power Source Node for devices.
     * @see {@link MatterSpecification.v10.Device} § 2.2
     */
    POWER_SOURCE: DeviceTypeDefinition({
        name: "MA-powersource",
        code: 0x011,
        deviceClass: DeviceClasses.Node, // ???
        revision: 1,
        requiredServerClusters: [
            MatterClusters.PowerSourceCluster.id, // any cluster features allowed
        ],
    }),

    /**
     * An OTA Requestor is a device that is capable of receiving an OTA software
     * update.
     * @see {@link MatterSpecification.v10.Device} § 2.3
     */
    OTA_REQUESTOR: DeviceTypeDefinition({
        name: "MA-otarequestor",
        code: 0x012,
        deviceClass: DeviceClasses.Node, // ???
        revision: 1,
        requiredServerClusters: [
            //OtaSoftwareUpdateRequestorCluster.id
        ],
        requiredClientClusters: [
            //OtaSoftwareUpdateProviderCluster.id
        ],
    }),

    /**
     * An OTA Provider is a node that is capable of providing an OTA software
     * update to other nodes on the same fabric.
     * @see {@link MatterSpecification.v10.Device} § 2.4
     */
    OTA_PROVIDER: DeviceTypeDefinition({
        name: "MA-otaprovider",
        code: 0x0014,
        deviceClass: DeviceClasses.Node, // ???
        revision: 1,
        requiredServerClusters: [
            //OtaSoftwareUpdateProviderCluster.id
        ],
        optionalClientClusters: [
            //OtaSoftwareUpdateRequestorCluster.id
        ],
    }),

    /**
     * This represents a Aggregator Node.
     * @see {@link MatterSpecification.v10.Device} § 2.5
     */
    AGGREGATOR: DeviceTypeDefinition({
        name: "MA-aggregator",
        code: 0x000e,
        deviceClass: DeviceClasses.Utility,
        revision: 1,
        optionalServerClusters: [MatterClusters.ActionsCluster.id, MatterClusters.IdentifyCluster.id],
    }),

    /**
     * This represents a Bridged Node to identify a bridged device without Power Source information.
     * @see {@link MatterSpecification.v10.Device} § 2.6
     */
    BRIDGED_NODE: DeviceTypeDefinition({
        name: "MA-bridgednode",
        code: 0x0013,
        deviceClass: DeviceClasses.Simple,
        revision: 1,
        requiredServerClusters: [MatterClusters.BridgedDeviceBasicInformationCluster.id],
    }),

    /**
     * This represents a Bridged Node to identify a bridged device with Power Source information.
     * @see {@link MatterSpecification.v10.Device} § 2.6
     */
    BRIDGED_DEVICE_WITH_POWERSOURCE_INFO: DeviceTypeDefinition({
        name: "MA-bridgeddevice",
        code: 0x0013,
        deviceClass: DeviceClasses.BridgedPowerSourceInfo,
        revision: 1,
        requiredServerClusters: [
            MatterClusters.BridgedDeviceBasicInformationCluster.id,
            MatterClusters.PowerSourceConfigurationCluster.id,
            MatterClusters.PowerSourceCluster.id, // any cluster features allowed
        ],
    }),

    /* Application Device Types */
    /* Application devices types are typically the most datatype endpoints on a node and in the network. */
    /* ------------------------- Lighting ------------------------------- */
    /**
     * The On/Off Light is a lighting device that is capable of being switched
     * on or off by means of a bound controller device such as anOn/Off Light
     * Switch or a Dimmer Switch. In addition, an on/off light is also capable
     * of being switched by means of a bound occupancy sensor.
     * @see {@link MatterSpecification.v10.Device} § 4.1
     */
    ON_OFF_LIGHT: DeviceTypeDefinition({
        name: "MA-onofflight",
        code: 0x0100,
        deviceClass: DeviceClasses.Simple,
        revision: 2,
        requiredServerClusters: [
            MatterClusters.IdentifyCluster.id,
            MatterClusters.GroupsCluster.id,
            MatterClusters.OnOffCluster.id,
        ],
        optionalServerClusters: [MatterClusters.LevelControlCluster.id],
        optionalClientClusters: [MatterClusters.OccupancySensingCluster.id],
    }),

    /**
     * A Dimmable Light is a lighting device that is capable of being switched
     * on or off and the intensity of its light adjusted by means of a bound
     * controller device such as a Dimmer Switch or a Color Dimmer Switch.
     * In addition, a Dimmable Light device is also capable of being switched
     * by means of a bound occupancy sensor or other device(s).
     * @see {@link MatterSpecification.v10.Device} § 4.2
     */
    DIMMABLE_LIGHT: DeviceTypeDefinition({
        name: "MA-dimmablelight",
        code: 0x0101,
        deviceClass: DeviceClasses.Simple,
        superSet: "ON_OFF_LIGHT",
        revision: 2,
        requiredServerClusters: [
            MatterClusters.IdentifyCluster.id,
            MatterClusters.GroupsCluster.id,
            MatterClusters.OnOffCluster.id,
            MatterClusters.LevelControlCluster.id,
        ],
        optionalClientClusters: [MatterClusters.OccupancySensingCluster.id],
    }),

    /**
     * A Color Temperature Light is a lighting device that is capable of being
     * switched on or off, the intensity of its light adjusted, and its
     * color temperature adjusted by means of a bound controller device such
     * as a Color Dimmer Switch.
     * @see {@link MatterSpecification.v10.Device} § 4.3
     */
    COLOR_TEMPERATURE_LIGHT: DeviceTypeDefinition({
        name: "MA-colortemperaturelight",
        code: 0x010c,
        deviceClass: DeviceClasses.Simple,
        superSet: "DIMMABLE_LIGHT",
        revision: 2,
        requiredServerClusters: [
            MatterClusters.IdentifyCluster.id,
            MatterClusters.GroupsCluster.id,
            MatterClusters.OnOffCluster.id,
            MatterClusters.LevelControlCluster.id,
            MatterClusters.ColorControlCluster.id,
        ],
    }),

    /**
     * An Extended Color Light is a lighting device that is capable of being
     * switched on or off, the intensity of its light adjusted, and its color
     * adjusted by means of a bound controller device such as a Color Dimmer
     * Switch or Control Bridge. The device supports adjustment of color by
     * means of hue/saturation, enhanced hue, color looping, XY coordinates,
     * and color temperature. In addition, the extended color light is also
     * capable of being switched by means of a bound occupancy sensor.
     * @see {@link MatterSpecification.v10.Device} § 4.4
     */
    EXTENDED_COLOR_LIGHT: DeviceTypeDefinition({
        name: "MA-extendedcolorlight",
        code: 0x010d,
        deviceClass: DeviceClasses.Simple,
        superSet: "COLOR_TEMPERATURE_LIGHT",
        revision: 2,
        requiredServerClusters: [
            MatterClusters.IdentifyCluster.id,
            MatterClusters.GroupsCluster.id,
            MatterClusters.OnOffCluster.id,
            MatterClusters.LevelControlCluster.id,
            MatterClusters.ColorControlCluster.id,
        ],
    }),

    /* ------------ Smart Plugs/outlets and other actuators ----------------- */
    /**
     * An On/Off Plug-in Unit is a device that is capable of being switched on
     * or off by means of a bound controller device such as an On/Off Light
     * Switch or a Dimmer Switch. The On/Off Plug-in Unit is typically used
     * to control a conventional non-communicating light by switching its mains
     * connection. Other appliances can be controlled this way as well.
     * @see {@link MatterSpecification.v10.Device} § 5.1
     */
    ON_OFF_PLUGIN_UNIT: DeviceTypeDefinition({
        name: "MA-onoffpluginunit",
        code: 0x010a,
        deviceClass: DeviceClasses.Simple,
        revision: 2,
        requiredServerClusters: [
            MatterClusters.IdentifyCluster.id,
            MatterClusters.GroupsCluster.id,
            MatterClusters.OnOffCluster.id,
        ],
        optionalServerClusters: [MatterClusters.LevelControlCluster.id],
    }),

    /**
     * A Dimmable Plug-In Unit is a device that is capable of being switched on
     * or off and have its level adjusted by means of a bound controller device
     * such as a Dimmer Switch or a Color Dimmer Switch. The Dimmable Plug-in
     * Unit is typically used to control a conventional non-communicating light
     * through its mains connection using phase cutting.
     * @see {@link MatterSpecification.v10.Device} § 5.2
     */
    DIMMABLE_PLUGIN_UNIT: DeviceTypeDefinition({
        name: "MA-dimmablepluginunit",
        code: 0x010b,
        deviceClass: DeviceClasses.Simple,
        revision: 2,
        requiredServerClusters: [
            MatterClusters.IdentifyCluster.id,
            MatterClusters.GroupsCluster.id,
            MatterClusters.OnOffCluster.id,
            MatterClusters.LevelControlCluster.id,
        ],
    }),

    /**
     * A Pump device is a pump that may have variable speed. It may have
     * optional built-in sensors and a regulation mechanism. It is typically
     * used for pumping fluids like water.
     * @see {@link MatterSpecification.v10.Device} § 5.3
     */
    PUMP: DeviceTypeDefinition({
        name: "MA-pump",
        code: 0x0303,
        deviceClass: DeviceClasses.Simple,
        revision: 2,
        requiredServerClusters: [
            MatterClusters.OnOffCluster.id,
            MatterClusters.PumpConfigurationAndControlCluster.id,
            MatterClusters.IdentifyCluster.id,
        ],
        optionalServerClusters: [
            MatterClusters.LevelControlCluster.id,
            MatterClusters.GroupsCluster.id,
            MatterClusters.TemperatureMeasurementCluster.id,
            MatterClusters.PressureMeasurementCluster.id,
            MatterClusters.FlowMeasurementCluster.id,
        ],
        optionalClientClusters: [
            MatterClusters.TemperatureMeasurementCluster.id,
            MatterClusters.PressureMeasurementCluster.id,
            MatterClusters.FlowMeasurementCluster.id,
            MatterClusters.OccupancySensingCluster.id,
        ],
    }),

    /* ---------------- Switches and Controls ----------------------- */
    /**
     * An On/Off Light Switch is a controller device that, when bound to a
     * lighting device such as an On/Off Light, is capable of being used to
     * switch the device on or off.
     * @see {@link MatterSpecification.v10.Device} § 6.1
     */
    ON_OFF_LIGHT_SWITCH: DeviceTypeDefinition({
        name: "MA-onofflightswitch",
        code: 0x0103,
        deviceClass: DeviceClasses.Simple,
        revision: 2,
        requiredServerClusters: [MatterClusters.IdentifyCluster.id],
        requiredClientClusters: [MatterClusters.IdentifyCluster.id, MatterClusters.OnOffCluster.id],
        optionalClientClusters: [MatterClusters.GroupsCluster.id],
    }),

    /**
     * A Dimmer Switch is a controller device that, when bound to a lighting
     * device such as a Dimmable Light, is capable of being used to switch the
     * device on or off and adjust the intensity of the light being emitted.
     * @see {@link MatterSpecification.v10.Device} § 6.2
     */
    DIMMER_SWITCH: DeviceTypeDefinition({
        name: "MA-dimmerswitch",
        code: 0x0104,
        deviceClass: DeviceClasses.Simple,
        superSet: "ON_OFF_LIGHT_SWITCH",
        revision: 2,
        requiredServerClusters: [MatterClusters.IdentifyCluster.id],
        requiredClientClusters: [
            MatterClusters.IdentifyCluster.id,
            MatterClusters.OnOffCluster.id,
            MatterClusters.LevelControlCluster.id,
        ],
        optionalClientClusters: [MatterClusters.GroupsCluster.id],
    }),

    /**
     * A Color Dimmer Switch is a controller device that, when bound to a
     * lighting device such as an Extended Color Light, is capable of being
     * used to adjust the color of the light being emitted.
     * @see {@link MatterSpecification.v10.Device} § 6.3
     */
    COLOR_DIMMER_SWITCH: DeviceTypeDefinition({
        name: "MA-colordimmerswitch",
        code: 0x0105,
        deviceClass: DeviceClasses.Simple,
        superSet: "DIMMER_SWITCH",
        revision: 2,
        requiredServerClusters: [MatterClusters.IdentifyCluster.id],
        requiredClientClusters: [
            MatterClusters.IdentifyCluster.id,
            MatterClusters.OnOffCluster.id,
            MatterClusters.LevelControlCluster.id,
            MatterClusters.ColorControlCluster.id,
        ],
        optionalClientClusters: [MatterClusters.GroupsCluster.id],
    }),

    /**
     * A Control Bridge is a controller device that, when bound to a lighting
     * device such as an Extended Color Light, is capable of being used to
     * switch the device on or off, adjust the intensity of the light being
     * emitted and adjust the color of the light being emitted. In addition, a
     * Control Bridge device is capable of being used for setting scenes.
     * @see {@link MatterSpecification.v10.Device} § 6.4
     */
    CONTROL_BRIDGE: DeviceTypeDefinition({
        name: "MA-controlbridge",
        code: 0x0840,
        deviceClass: DeviceClasses.Simple,
        revision: 2,
        requiredServerClusters: [MatterClusters.IdentifyCluster.id],
        requiredClientClusters: [
            MatterClusters.IdentifyCluster.id,
            MatterClusters.GroupsCluster.id,
            MatterClusters.OnOffCluster.id,
            MatterClusters.LevelControlCluster.id,
            MatterClusters.ColorControlCluster.id,
        ],
        optionalClientClusters: [
            MatterClusters.IlluminanceMeasurementCluster.id,
            MatterClusters.OccupancySensingCluster.id,
        ],
    }),

    /**
     * A Pump Controller device is capable of configuring and controlling a
     * Pump device.
     * @see {@link MatterSpecification.v10.Device} § 6.5
     */
    PUMP_CONTROLLER: DeviceTypeDefinition({
        name: "MA-pumpcontroller",
        code: 0x0304,
        deviceClass: DeviceClasses.Simple,
        revision: 2,
        requiredServerClusters: [MatterClusters.IdentifyCluster.id],
        requiredClientClusters: [
            MatterClusters.BindingCluster.id,
            MatterClusters.OnOffCluster.id,
            MatterClusters.PumpConfigurationAndControlCluster.id,
        ],
        optionalClientClusters: [
            MatterClusters.IdentifyCluster.id,
            MatterClusters.GroupsCluster.id,
            MatterClusters.LevelControlCluster.id,
            MatterClusters.TemperatureMeasurementCluster.id,
            MatterClusters.PressureMeasurementCluster.id,
            MatterClusters.FlowMeasurementCluster.id,
        ],
    }),

    /**
     * This defines conformance for the Generic Switch device type.
     * @see {@link MatterSpecification.v10.Device} § 6.6
     */
    GENERIC_SWITCH: DeviceTypeDefinition({
        name: "MA-genericswitch",
        code: 0x000f,
        deviceClass: DeviceClasses.Simple,
        revision: 1,
        requiredServerClusters: [MatterClusters.IdentifyCluster.id, MatterClusters.SwitchCluster.id],
        optionalServerClusters: [MatterClusters.FixedLabelCluster.id],
    }),

    /* ---------------------------- Sensors --------------------------- */
    /**
     * This defines conformance to the Contact Sensor device type.
     * @see {@link MatterSpecification.v10.Device} § 7.1
     */
    CONTACT_SENSOR: DeviceTypeDefinition({
        name: "MA-contactsensor",
        code: 0x0015,
        deviceClass: DeviceClasses.Simple,
        revision: 1,
        requiredServerClusters: [MatterClusters.IdentifyCluster.id, MatterClusters.BooleanStateCluster.id],
    }),

    /**
     * A Light Sensor device is a measurement and sensing device that is capable
     * of measuring and reporting the intensity of light (illuminance) to which
     * the sensor is being subjected.
     * @see {@link MatterSpecification.v10.Device} § 7.2
     */
    LIGHT_SENSOR: DeviceTypeDefinition({
        name: "MA-lightsensor",
        code: 0x0106,
        deviceClass: DeviceClasses.Simple,
        revision: 2,
        requiredServerClusters: [MatterClusters.IdentifyCluster.id, MatterClusters.IlluminanceMeasurementCluster.id],
        optionalClientClusters: [MatterClusters.GroupsCluster.id],
    }),

    /**
     * An Occupancy Sensor is a measurement and sensing device that is capable
     * of measuring and reporting the occupancy state in a designated area.
     * @see {@link MatterSpecification.v10.Device} § 7.3
     */
    OCCUPANCY_SENSOR: DeviceTypeDefinition({
        name: "MA-occupancysensor",
        code: 0x0107,
        deviceClass: DeviceClasses.Simple,
        revision: 2,
        requiredServerClusters: [MatterClusters.IdentifyCluster.id, MatterClusters.OccupancySensingCluster.id],
        optionalClientClusters: [MatterClusters.GroupsCluster.id],
    }),

    /**
     * A Temperature Sensor device reports measurements of temperature.
     * @see {@link MatterSpecification.v10.Device} § 7.4
     */
    TEMPERATURE_SENSOR: DeviceTypeDefinition({
        name: "MA-tempsensor",
        code: 0x0302,
        deviceClass: DeviceClasses.Simple,
        revision: 2,
        requiredServerClusters: [MatterClusters.TemperatureMeasurementCluster.id, MatterClusters.IdentifyCluster.id],
    }),

    /**
     * A Pressure Sensor device measures and reports the pressure of a fluid.
     * @see {@link MatterSpecification.v10.Device} § 7.5
     */
    PRESSURE_SENSOR: DeviceTypeDefinition({
        name: "MA-pressuresensor",
        code: 0x0305,
        deviceClass: DeviceClasses.Simple,
        revision: 2,
        requiredServerClusters: [MatterClusters.PressureMeasurementCluster.id, MatterClusters.IdentifyCluster.id],
    }),

    /**
     * A Flow Sensor device measures and reports the flow rate of a fluid.
     * @see {@link MatterSpecification.v10.Device} § 7.6
     */
    FLOW_SENSOR: DeviceTypeDefinition({
        name: "MA-flowsensor",
        code: 0x0306,
        deviceClass: DeviceClasses.Simple,
        revision: 2,
        requiredServerClusters: [MatterClusters.FlowMeasurementCluster.id, MatterClusters.IdentifyCluster.id],
    }),

    /**
     * A humidity sensor (in most cases a Relative humidity sensor) reports humidity measurements.
     * @see {@link MatterSpecification.v10.Device} § 7.7
     */
    HUMIDITY_SENSOR: DeviceTypeDefinition({
        name: "MA-humiditysensor",
        code: 0x0307,
        deviceClass: DeviceClasses.Simple,
        revision: 2,
        requiredServerClusters: [
            MatterClusters.IdentifyCluster.id,
            MatterClusters.RelativeHumidityMeasurementCluster.id,
        ],
    }),

    /**
     * An On/Off Sensor is a measurement and sensing device that, when bound to
     * a lighting device such as a Dimmable Light, is capable of being used to
     * switch the device on or off.
     * @see {@link MatterSpecification.v10.Device} § 7.8
     */
    ON_OFF_SENSOR: DeviceTypeDefinition({
        name: "MA-onoffsensor",
        code: 0x0850,
        deviceClass: DeviceClasses.Simple,
        revision: 2,
        requiredServerClusters: [MatterClusters.IdentifyCluster.id],
        requiredClientClusters: [MatterClusters.IdentifyCluster.id, MatterClusters.OnOffCluster.id],
        optionalClientClusters: [
            MatterClusters.GroupsCluster.id,
            MatterClusters.LevelControlCluster.id,
            MatterClusters.ColorControlCluster.id,
        ],
    }),

    /* ---------------------------- Closures --------------------------- */
    /**
     * A Door Lock is a device used to secure a door. It is possible to actuate
     * a door lock either by means of a manual or a remote method.
     * @see {@link MatterSpecification.v10.Device} § 8.1
     */
    DOOR_LOCK: DeviceTypeDefinition({
        name: "MA-doorlock",
        code: 0x000a,
        deviceClass: DeviceClasses.Simple,
        revision: 2,
        requiredServerClusters: [MatterClusters.IdentifyCluster.id, MatterClusters.DoorLockCluster.id],
        optionalServerClusters: [
            //MatterClusters.PollControlCluster.id, //0x20 Not existing in Specs 1.1
        ],
        optionalClientClusters: [MatterClusters.TimeSynchronizationCluster.id],
    }),

    /**
     * A Door Lock Controller is a device capable of controlling a door lock.
     * @see {@link MatterSpecification.v10.Device} § 8.2
     */
    DOOR_LOCK_CONTROLLER: DeviceTypeDefinition({
        name: "MA-doorlockcontroller",
        code: 0x000b,
        deviceClass: DeviceClasses.Simple,
        revision: 2,
        optionalServerClusters: [
            MatterClusters.IdentifyCluster.id, // Optional if EZ-Target
            MatterClusters.TimeSynchronizationCluster.id,
        ],
        requiredClientClusters: [MatterClusters.DoorLockCluster.id],
        optionalClientClusters: [
            MatterClusters.IdentifyCluster.id, // Optional if EZ-Initiator
            MatterClusters.GroupsCluster.id, // Required if Zigbee
        ],
    }),

    /**
     * This defines conformance to the Window Covering device type.
     * @see {@link MatterSpecification.v10.Device} § 8.3
     */
    WINDOW_COVERING: DeviceTypeDefinition({
        name: "MA-windowcovering",
        code: 0x0202,
        deviceClass: DeviceClasses.Simple,
        revision: 2,
        requiredServerClusters: [MatterClusters.IdentifyCluster.id, MatterClusters.WindowCoveringCluster.id],
        optionalServerClusters: [
            MatterClusters.GroupsCluster.id, // Required when Awake, else optional
        ],
    }),

    /**
     * A Window Covering Controller is a device that controls an automatic
     * window covering.
     * @see {@link MatterSpecification.v10.Device} § 8.4
     */
    WINDOW_COVERING_CONTROLLER: DeviceTypeDefinition({
        name: "MA-windowcoveringcontroller",
        code: 0x0203,
        deviceClass: DeviceClasses.Simple,
        revision: 2,
        optionalServerClusters: [MatterClusters.IdentifyCluster.id],
        requiredClientClusters: [MatterClusters.WindowCoveringCluster.id],
        optionalClientClusters: [
            MatterClusters.IdentifyCluster.id,
            MatterClusters.GroupsCluster.id, // Required when Awake, else optional
        ],
    }),

    /* ---------------------------- HVAC --------------------------- */
    /**
     * A Heating/Cooling Unit is a device capable of heating or cooling a space
     * in a house. It is not mandatory to provide both functionalities (for
     * example, the device may just heat but not cool). It may be an indoor air
     * handler.
     * @see {@link MatterSpecification.v10.Device} § 9.1
     */
    HEATING_COOLING_UNIT: DeviceTypeDefinition({
        name: "MA-heatcool",
        code: 0x0300,
        deviceClass: DeviceClasses.Simple,
        revision: 2,
        requiredServerClusters: [
            MatterClusters.IdentifyCluster.id,
            MatterClusters.GroupsCluster.id,
            MatterClusters.OnOffCluster.id,
        ],
        optionalServerClusters: [MatterClusters.LevelControlCluster.id, MatterClusters.FanControlCluster.id],
        requiredClientClusters: [MatterClusters.ThermostatCluster.id],
    }),

    /**
     * A Thermostat device is capable of having either built-in or separate
     * sensors for temperature, humidity or occupancy. It allows the desired
     * temperature to be set either remotely or locally. The thermostat is
     * capable of sending heating and/or cooling requirement notifications to a
     * heating/cooling unit (for example, an indoor air handler) or is
     * capable of including a mechanism to control a heating or cooling unit
     * directly.
     * @see {@link MatterSpecification.v10.Device} § 9.2
     */
    THERMOSTAT: DeviceTypeDefinition({
        name: "MA-thermostat",
        code: 0x0301,
        deviceClass: DeviceClasses.Simple,
        revision: 2,
        requiredServerClusters: [MatterClusters.IdentifyCluster.id, MatterClusters.ThermostatCluster.id],
        optionalServerClusters: [
            MatterClusters.GroupsCluster.id, // Required when Awake
            MatterClusters.ThermostatUserInterfaceConfigurationCluster.id,
            MatterClusters.TimeSynchronizationCluster.id,
        ],
        optionalClientClusters: [
            MatterClusters.RelativeHumidityMeasurementCluster.id,
            MatterClusters.TimeSynchronizationCluster.id,
            MatterClusters.FanControlCluster.id,
            MatterClusters.TemperatureMeasurementCluster.id,
            MatterClusters.OccupancySensingCluster.id,
        ],
    }),

    /**
     * This defines conformance to the Fan device type.
     * @see {@link MatterSpecification.v10.Device} § 9.3
     */
    FAN: DeviceTypeDefinition({
        name: "MA-fan",
        code: 0x002b,
        deviceClass: DeviceClasses.Simple,
        revision: 1,
        requiredServerClusters: [
            MatterClusters.IdentifyCluster.id,
            MatterClusters.GroupsCluster.id,
            MatterClusters.FanControlCluster.id,
        ],
    }),

    /* ---------------------------- Media --------------------------- */
    /**
     * A Video Player (either Basic or Casting) represents a device that is able
     * to play media to a physical output or to a display screen which is part
     * of the device.
     * A Basic Video Player has playback controls (play, pause, etc.) and keypad
     * remote controls (up, down, number input), but is not able to launch
     * content and is not a content app platform (the Casting Video Player
     * device type is used for these functions).
     * @see {@link MatterSpecification.v10.Device} § 10.2
     */
    BASIC_VIDEO_PLAYER: DeviceTypeDefinition({
        name: "MA-basic-videoplayer",
        code: 0x0028,
        deviceClass: DeviceClasses.Simple,
        revision: 1,
        requiredServerClusters: [
            MatterClusters.OnOffCluster.id,
            MatterClusters.MediaPlaybackCluster.id,
            MatterClusters.KeypadInputCluster.id,
        ],
        optionalServerClusters: [
            MatterClusters.WakeOnLanCluster.id,
            MatterClusters.ChannelCluster.id,
            MatterClusters.TargetNavigatorCluster.id,
            MatterClusters.MediaInputCluster.id, // Required if PhysicalInputs
            MatterClusters.LowPowerCluster.id,
            MatterClusters.AudioOutputCluster.id,
        ],
    }),

    /**
     * A Casting Video Player has basic controls for playback (play, pause,
     * etc.) and keypad input (up, down, number input), and is able to launch
     * content.
     * @see {@link MatterSpecification.v10.Device} § 10.3
     */
    CASTING_VIDEO_PLAYER: DeviceTypeDefinition({
        name: "MA-casting-videoplayer",
        code: 0x0023,
        deviceClass: DeviceClasses.Simple,
        revision: 1,
        requiredServerClusters: [
            MatterClusters.OnOffCluster.id,
            MatterClusters.MediaPlaybackCluster.id,
            MatterClusters.KeypadInputCluster.id,
            MatterClusters.ContentLauncherCluster.id,
        ],
        optionalServerClusters: [
            MatterClusters.WakeOnLanCluster.id,
            MatterClusters.ChannelCluster.id,
            MatterClusters.TargetNavigatorCluster.id,
            MatterClusters.MediaInputCluster.id, // Required if PhysicalInputs
            MatterClusters.LowPowerCluster.id,
            MatterClusters.AudioOutputCluster.id,
            MatterClusters.ApplicationLauncherCluster.id, // Required if ContentAppPlatform
            MatterClusters.AccountLoginCluster.id,
        ],
    }),

    /**
     * This feature controls the speaker volume of the device.
     * @see {@link MatterSpecification.v10.Device} § 10.4
     */
    SPEAKER: DeviceTypeDefinition({
        name: "MA-speaker",
        code: 0x0022,
        deviceClass: DeviceClasses.Simple,
        revision: 1,
        requiredServerClusters: [MatterClusters.OnOffCluster.id, MatterClusters.LevelControlCluster.id],
    }),

    /**
     * A Content App is usually an application built by a Content Provider. A
     * Casting Video Player with a Content App Platform is able to launch
     * Content Apps and represent these apps as separate endpoints.
     * @see {@link MatterSpecification.v10.Device} § 10.5
     */
    CONTENT_APP: DeviceTypeDefinition({
        name: "MA-contentapp",
        code: 0x0024,
        deviceClass: DeviceClasses.Simple,
        revision: 1,
        requiredServerClusters: [
            MatterClusters.KeypadInputCluster.id,
            MatterClusters.ApplicationLauncherCluster.id,
            MatterClusters.ApplicationBasicCluster.id,
        ],
        optionalServerClusters: [
            MatterClusters.ChannelCluster.id,
            MatterClusters.TargetNavigatorCluster.id,
            MatterClusters.MediaPlaybackCluster.id,
            MatterClusters.ContentLauncherCluster.id,
            MatterClusters.AccountLoginCluster.id,
        ],
    }),

    /**
     * A Casting Video Client is a client that can launch content on a Casting
     * Video Player, for example, a Smart Speaker or a Content Provider phone
     * app.
     * @see {@link MatterSpecification.v10.Device} § 10.6
     */
    CASTING_VIDEO_CLIENT: DeviceTypeDefinition({
        name: "MA-casting-videoclient",
        code: 0x0029,
        deviceClass: DeviceClasses.Simple,
        revision: 1,
        requiredClientClusters: [
            MatterClusters.OnOffCluster.id,
            MatterClusters.KeypadInputCluster.id,
            MatterClusters.ContentLauncherCluster.id,
            MatterClusters.ApplicationBasicCluster.id,
        ],
        optionalClientClusters: [
            MatterClusters.LevelControlCluster.id,
            MatterClusters.WakeOnLanCluster.id,
            MatterClusters.ChannelCluster.id,
            MatterClusters.TargetNavigatorCluster.id,
            MatterClusters.MediaPlaybackCluster.id,
            MatterClusters.MediaInputCluster.id,
            MatterClusters.LowPowerCluster.id,
            MatterClusters.AudioOutputCluster.id,
            MatterClusters.ApplicationLauncherCluster.id,
            MatterClusters.AccountLoginCluster.id,
        ],
    }),

    /**
     * A Video Remote Control is a client that can control a Video Player, for
     * example, a traditional universal remote control.
     * @see {@link MatterSpecification.v10.Device} § 10.7
     */
    VIDEO_REMOTE_CONTROL: DeviceTypeDefinition({
        name: "MA-video-remotecontrol",
        code: 0x002a,
        deviceClass: DeviceClasses.Simple,
        revision: 1,
        requiredClientClusters: [
            MatterClusters.OnOffCluster.id,
            MatterClusters.MediaPlaybackCluster.id,
            MatterClusters.KeypadInputCluster.id,
        ],
        optionalClientClusters: [
            MatterClusters.LevelControlCluster.id,
            MatterClusters.WakeOnLanCluster.id,
            MatterClusters.ChannelCluster.id,
            MatterClusters.TargetNavigatorCluster.id,
            MatterClusters.MediaInputCluster.id,
            MatterClusters.LowPowerCluster.id,
            MatterClusters.ContentLauncherCluster.id,
            MatterClusters.AudioOutputCluster.id,
            MatterClusters.ApplicationLauncherCluster.id,
            MatterClusters.AccountLoginCluster.id,
        ],
    }),

    /* ---------------------------- Generic --------------------------- */
    /**
     * This defines conformance to the Mode device type.
     * @see {@link MatterSpecification.v10.Device} § 11.1
     */
    MODE_SELECT: DeviceTypeDefinition({
        name: "MA-modeselect",
        code: 0x0027,
        deviceClass: DeviceClasses.Simple,
        revision: 1,
        requiredServerClusters: [MatterClusters.ModeSelectCluster.id],
    }),
};

/** Cache of all device types dynamically generated from model. */
const DynamicDeviceType: { [key: string]: DeviceTypeDefinition } = {};

export const UnknownDeviceType = (code: number, revision: number) =>
    DeviceTypeDefinition({
        code,
        name: `Unknown Device Type ${code}`,
        deviceClass: DeviceClasses.Simple,
        revision,
        unknown: true,
    });

/** @deprecated */
export function getDeviceTypeDefinitionByCode(code: number): DeviceTypeDefinition | undefined {
    for (const key in DeviceTypes) {
        if (DeviceTypes[key].code === code) {
            return DeviceTypes[key];
        }
    }
    return undefined;
}

export function getDeviceTypeDefinitionFromModelByCode(code: number): DeviceTypeDefinition | undefined {
    if (DynamicDeviceType[code] !== undefined) {
        return DynamicDeviceType[code];
    }

    const device = MatterModel.standard.deviceTypes.find(d => d.id === code);
    if (device === undefined) {
        return undefined;
    }

    const deviceDetails = {
        name: `MA-${device.name.toLowerCase()}`,
        revision: 0,
        code: device.id,
        deviceClass: capitalize(device.classification as string) as DeviceClasses,
        superSet: device.type
            ?.replace(/([A-Z])/g, "_$1")
            .substring(1)
            .toUpperCase(),
        requiredServerClusters: new Array<ClusterId>(),
        optionalServerClusters: new Array<ClusterId>(),
        requiredClientClusters: new Array<ClusterId>(),
        optionalClientClusters: new Array<ClusterId>(),
    };

    device.requirements.forEach(req => {
        if (req.id === undefined) {
            return;
        }
        if (req.name === "Descriptor") {
            const deviceTypeList = req.requirements.find(r => r.element === "attribute" && r.name === "DeviceTypeList");
            if (deviceTypeList) {
                deviceDetails.revision = deviceTypeList.default[0].revision;
            }
        } else if (req.element === "serverCluster") {
            if (req.isMandatory) {
                deviceDetails.requiredServerClusters.push(ClusterId(req.id));
            } else {
                deviceDetails.optionalServerClusters.push(ClusterId(req.id));
            }
        } else if (req.element === "clientCluster") {
            if (req.isMandatory) {
                deviceDetails.requiredClientClusters.push(ClusterId(req.id));
            } else {
                deviceDetails.optionalClientClusters.push(ClusterId(req.id));
            }
        }
    });

    if (
        deviceDetails.revision === 0 ||
        (deviceDetails.requiredClientClusters.length === 0 &&
            deviceDetails.requiredServerClusters.length === 0 &&
            deviceDetails.optionalClientClusters.length === 0 &&
            deviceDetails.optionalServerClusters.length === 0)
    ) {
        return undefined;
    }

    DynamicDeviceType[code] = DeviceTypeDefinition(deviceDetails);

    return DynamicDeviceType[code];
}
