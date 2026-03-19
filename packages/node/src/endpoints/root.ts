/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { PartsBehavior } from "../behavior/system/parts/PartsBehavior.js";
import { IndexBehavior } from "../behavior/system/index/IndexBehavior.js";
import { AccessControlServer as BaseAccessControlServer } from "../behaviors/access-control/AccessControlServer.js";
import {
    BasicInformationServer as BaseBasicInformationServer
} from "../behaviors/basic-information/BasicInformationServer.js";
import {
    GeneralCommissioningServer as BaseGeneralCommissioningServer
} from "../behaviors/general-commissioning/GeneralCommissioningServer.js";
import {
    GeneralDiagnosticsServer as BaseGeneralDiagnosticsServer
} from "../behaviors/general-diagnostics/GeneralDiagnosticsServer.js";
import {
    AdministratorCommissioningServer as BaseAdministratorCommissioningServer
} from "../behaviors/administrator-commissioning/AdministratorCommissioningServer.js";
import {
    OperationalCredentialsServer as BaseOperationalCredentialsServer
} from "../behaviors/operational-credentials/OperationalCredentialsServer.js";
import {
    GroupKeyManagementServer as BaseGroupKeyManagementServer
} from "../behaviors/group-key-management/GroupKeyManagementServer.js";
import {
    LocalizationConfigurationServer as BaseLocalizationConfigurationServer
} from "../behaviors/localization-configuration/LocalizationConfigurationServer.js";
import {
    TimeFormatLocalizationServer as BaseTimeFormatLocalizationServer
} from "../behaviors/time-format-localization/TimeFormatLocalizationServer.js";
import {
    UnitLocalizationServer as BaseUnitLocalizationServer
} from "../behaviors/unit-localization/UnitLocalizationServer.js";
import {
    PowerSourceConfigurationServer as BasePowerSourceConfigurationServer
} from "../behaviors/power-source-configuration/PowerSourceConfigurationServer.js";
import {
    NetworkCommissioningServer as BaseNetworkCommissioningServer
} from "../behaviors/network-commissioning/NetworkCommissioningServer.js";
import { DiagnosticLogsServer as BaseDiagnosticLogsServer } from "../behaviors/diagnostic-logs/DiagnosticLogsServer.js";
import {
    SoftwareDiagnosticsServer as BaseSoftwareDiagnosticsServer
} from "../behaviors/software-diagnostics/SoftwareDiagnosticsServer.js";
import {
    ThreadNetworkDiagnosticsServer as BaseThreadNetworkDiagnosticsServer
} from "../behaviors/thread-network-diagnostics/ThreadNetworkDiagnosticsServer.js";
import {
    WiFiNetworkDiagnosticsServer as BaseWiFiNetworkDiagnosticsServer
} from "../behaviors/wi-fi-network-diagnostics/WiFiNetworkDiagnosticsServer.js";
import {
    EthernetNetworkDiagnosticsServer as BaseEthernetNetworkDiagnosticsServer
} from "../behaviors/ethernet-network-diagnostics/EthernetNetworkDiagnosticsServer.js";
import {
    TimeSynchronizationServer as BaseTimeSynchronizationServer
} from "../behaviors/time-synchronization/TimeSynchronizationServer.js";
import { IcdManagementServer as BaseIcdManagementServer } from "../behaviors/icd-management/IcdManagementServer.js";
import {
    TlsCertificateManagementServer as BaseTlsCertificateManagementServer
} from "../behaviors/tls-certificate-management/TlsCertificateManagementServer.js";
import {
    TlsClientManagementServer as BaseTlsClientManagementServer
} from "../behaviors/tls-client-management/TlsClientManagementServer.js";
import {
    TimeSynchronizationBehavior as BaseTimeSynchronizationBehavior
} from "../behaviors/time-synchronization/TimeSynchronizationBehavior.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { DeviceClassification } from "@matter/model";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * This defines conformance for a root node endpoint (see System Model specification). This endpoint is akin to a "read
 * me first" endpoint that describes itself and the other endpoints that make up the node.
 *
 *   - Device types with Endpoint scope shall NOT be supported on the same endpoint as this device type.
 *
 *   - Clusters with an Application role shall NOT be supported on the same endpoint as this device type.
 *
 *   - Other device types with Node scope may be supported on the same endpoint as this device type.
 *
 * @see {@link MatterSpecification.v142.Device} § 2.1
 */
export interface RootEndpoint extends Identity<typeof RootEndpointDefinition> {}

export namespace RootRequirements {
    /**
     * The AccessControl cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link AccessControlServer} for convenience.
     */
    export const AccessControlServer = BaseAccessControlServer;

    /**
     * The BasicInformation cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link BasicInformationServer} for convenience.
     */
    export const BasicInformationServer = BaseBasicInformationServer;

    /**
     * The GeneralCommissioning cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link GeneralCommissioningServer} for convenience.
     */
    export const GeneralCommissioningServer = BaseGeneralCommissioningServer;

    /**
     * The GeneralDiagnostics cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link GeneralDiagnosticsServer} for convenience.
     */
    export const GeneralDiagnosticsServer = BaseGeneralDiagnosticsServer;

    /**
     * The AdministratorCommissioning cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link AdministratorCommissioningServer} for convenience.
     */
    export const AdministratorCommissioningServer = BaseAdministratorCommissioningServer;

    /**
     * The OperationalCredentials cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link OperationalCredentialsServer} for convenience.
     */
    export const OperationalCredentialsServer = BaseOperationalCredentialsServer;

    /**
     * The GroupKeyManagement cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link GroupKeyManagementServer} for convenience.
     */
    export const GroupKeyManagementServer = BaseGroupKeyManagementServer;

    /**
     * The LocalizationConfiguration cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link LocalizationConfigurationServer} for convenience.
     */
    export const LocalizationConfigurationServer = BaseLocalizationConfigurationServer;

    /**
     * The TimeFormatLocalization cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link TimeFormatLocalizationServer} for convenience.
     */
    export const TimeFormatLocalizationServer = BaseTimeFormatLocalizationServer;

    /**
     * The UnitLocalization cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link UnitLocalizationServer} for convenience.
     */
    export const UnitLocalizationServer = BaseUnitLocalizationServer;

    /**
     * The PowerSourceConfiguration cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link PowerSourceConfigurationServer} for convenience.
     */
    export const PowerSourceConfigurationServer = BasePowerSourceConfigurationServer;

    /**
     * The NetworkCommissioning cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link NetworkCommissioningServer} for convenience.
     */
    export const NetworkCommissioningServer = BaseNetworkCommissioningServer;

    /**
     * The DiagnosticLogs cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link DiagnosticLogsServer} for convenience.
     */
    export const DiagnosticLogsServer = BaseDiagnosticLogsServer;

    /**
     * The SoftwareDiagnostics cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link SoftwareDiagnosticsServer} for convenience.
     */
    export const SoftwareDiagnosticsServer = BaseSoftwareDiagnosticsServer;

    /**
     * The ThreadNetworkDiagnostics cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ThreadNetworkDiagnosticsServer} for convenience.
     */
    export const ThreadNetworkDiagnosticsServer = BaseThreadNetworkDiagnosticsServer;

    /**
     * The WiFiNetworkDiagnostics cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link WiFiNetworkDiagnosticsServer} for convenience.
     */
    export const WiFiNetworkDiagnosticsServer = BaseWiFiNetworkDiagnosticsServer;

    /**
     * The EthernetNetworkDiagnostics cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link EthernetNetworkDiagnosticsServer} for convenience.
     */
    export const EthernetNetworkDiagnosticsServer = BaseEthernetNetworkDiagnosticsServer;

    /**
     * The TimeSynchronization cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link TimeSynchronizationServer} for convenience.
     */
    export const TimeSynchronizationServer = BaseTimeSynchronizationServer;

    /**
     * The IcdManagement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link IcdManagementServer} for convenience.
     */
    export const IcdManagementServer = BaseIcdManagementServer;

    /**
     * The TlsCertificateManagement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link TlsCertificateManagementServer} for convenience.
     */
    export const TlsCertificateManagementServer = BaseTlsCertificateManagementServer;

    /**
     * The TlsClientManagement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link TlsClientManagementServer} for convenience.
     */
    export const TlsClientManagementServer = BaseTlsClientManagementServer;

    /**
     * The TimeSynchronization cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link TimeSynchronizationBehavior} for convenience.
     */
    export const TimeSynchronizationBehavior = BaseTimeSynchronizationBehavior;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        mandatory: {
            Parts: PartsBehavior,
            Index: IndexBehavior,
            AccessControl: AccessControlServer,
            BasicInformation: BasicInformationServer,
            GeneralCommissioning: GeneralCommissioningServer,
            GeneralDiagnostics: GeneralDiagnosticsServer,
            AdministratorCommissioning: AdministratorCommissioningServer,
            OperationalCredentials: OperationalCredentialsServer,
            GroupKeyManagement: GroupKeyManagementServer
        },

        optional: {
            LocalizationConfiguration: LocalizationConfigurationServer,
            TimeFormatLocalization: TimeFormatLocalizationServer,
            UnitLocalization: UnitLocalizationServer,
            PowerSourceConfiguration: PowerSourceConfigurationServer,
            NetworkCommissioning: NetworkCommissioningServer,
            DiagnosticLogs: DiagnosticLogsServer,
            SoftwareDiagnostics: SoftwareDiagnosticsServer,
            ThreadNetworkDiagnostics: ThreadNetworkDiagnosticsServer,
            WiFiNetworkDiagnostics: WiFiNetworkDiagnosticsServer,
            EthernetNetworkDiagnostics: EthernetNetworkDiagnosticsServer,
            TimeSynchronization: TimeSynchronizationServer,
            IcdManagement: IcdManagementServer,
            TlsCertificateManagement: TlsCertificateManagementServer,
            TlsClientManagement: TlsClientManagementServer
        }
    };

    /**
     * A definition for each client cluster supported by the endpoint per the Matter specification.
     */
    export const client = { optional: { TimeSynchronization: TimeSynchronizationBehavior }, mandatory: {} };

    /**
     * A definition for each device type required as a component endpoint per the Matter specification.
     */
    export const deviceTypes = {
        optional: {
            /**
             * The PowerSource device type is optional per the Matter specification.
             */
            PowerSource: { deviceType: 0x11 }
        }
    };
}

export const RootEndpointDefinition = MutableEndpoint({
    name: "RootNode",
    deviceType: 0x16,
    deviceRevision: 4,
    deviceClass: DeviceClassification.Node,
    requirements: RootRequirements,

    behaviors: SupportedBehaviors(
        RootRequirements.server.mandatory.Parts,
        RootRequirements.server.mandatory.Index,
        RootRequirements.server.mandatory.AccessControl,
        RootRequirements.server.mandatory.BasicInformation,
        RootRequirements.server.mandatory.GeneralCommissioning,
        RootRequirements.server.mandatory.GeneralDiagnostics,
        RootRequirements.server.mandatory.AdministratorCommissioning,
        RootRequirements.server.mandatory.OperationalCredentials,
        RootRequirements.server.mandatory.GroupKeyManagement
    )
});

Object.freeze(RootEndpointDefinition);
export const RootEndpoint: RootEndpoint = RootEndpointDefinition;
