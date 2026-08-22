/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { canonicalizeName } from "./values.js";

/**
 * Differences between our model and CHIP's that we do not intend to remove.
 *
 * These are reported separately from mismatches so a real defect does not hide among them.  An entry states both
 * values so a change on either side stops matching and surfaces as a mismatch again.
 */

/**
 * Types we and CHIP name differently.
 *
 * We use the name the specification gives the type; CHIP names several of them after the structure that defines them.
 * Keys and values are canonical (lower case, alphanumeric only).
 */
export const TYPE_ALIASES: Record<string, string> = {
    attribid: "attributeid",
    currency: "currencystruct",
    endpointno: "endpointid",
    locationdesc: "locationdescriptorstruct",
    price: "pricestruct",
    semtag: "semantictagstruct",
    systimems: "systemtimems",
    systimeus: "systemtimeus",
};

export interface KnownDifference {
    /** Path of the element; a leading "*." matches the trailing segments of any path */
    path: string;

    property: string;

    /** The value CHIP states; a difference stops being known when either side changes */
    chip: string;

    /** The value we state, or "undefined" where we state none */
    matter: string;

    reason: string;
}

export const KNOWN_DIFFERENCES: KnownDifference[] = [
    {
        path: "ClosureDimension.Resolution",
        property: "default",
        chip: "0.01",
        matter: "1",
        reason: "CHIP states the fallback of a percent100ths attribute unscaled; 0.01 is not a value of the type",
    },
    {
        path: "ClosureDimension.StepValue",
        property: "default",
        chip: "0.01",
        matter: "1",
        reason: "CHIP states the fallback of a percent100ths attribute unscaled; 0.01 is not a value of the type",
    },
    {
        path: "GeneralCommissioning.ArmFailSafeResponse.ErrorCode",
        property: "default",
        chip: "success",
        matter: "0",
        reason: "The specification names the value Ok where the global status names it Success; spec enhancement filed",
    },
    {
        path: "GeneralCommissioning.SetRegulatoryConfigResponse.ErrorCode",
        property: "default",
        chip: "success",
        matter: "0",
        reason: "The specification names the value Ok where the global status names it Success; spec enhancement filed",
    },
    {
        path: "GeneralCommissioning.CommissioningCompleteResponse.ErrorCode",
        property: "default",
        chip: "success",
        matter: "0",
        reason: "The specification names the value Ok where the global status names it Success; spec enhancement filed",
    },
    {
        path: "GeneralCommissioning.SetTcAcknowledgementsResponse.ErrorCode",
        property: "default",
        chip: "success",
        matter: "0",
        reason: "The specification names the value Ok where the global status names it Success; spec enhancement filed",
    },
    {
        path: "OperationalCredentials.NocResponse.FabricIndex",
        property: "conformance",
        chip: "statuscode==success,o",
        matter: "statuscode==ok,o",
        reason: "The specification names the value Ok where the global status names it Success; spec enhancement filed",
    },
    {
        path: "JointFabricAdministrator.IcaccsrResponse.Icaccsr",
        property: "conformance",
        chip: "statuscode==success,o",
        matter: "statuscode==ok,o",
        reason: "The specification names the value Ok where the global status names it Success; spec enhancement filed",
    },
    {
        path: "DoorLock.DoorStateChange",
        property: "priority",
        chip: "desc",
        matter: "critical",
        reason: "The specification requires CRITICAL for the states that matter and permits INFO otherwise, so our model states CRITICAL; a DoorLock override records that deliberately",
    },
    {
        path: "DoorLock.LockOperation",
        property: "priority",
        chip: "desc",
        matter: "critical",
        reason: "The specification requires CRITICAL for the states that matter and permits INFO otherwise, so our model states CRITICAL; a DoorLock override records that deliberately",
    },
    {
        path: "DoorLock.LockOperationError",
        property: "priority",
        chip: "desc",
        matter: "critical",
        reason: "The specification requires CRITICAL for the states that matter and permits INFO otherwise, so our model states CRITICAL; a DoorLock override records that deliberately",
    },
    {
        path: "DoorLock.ClearWeekDaySchedule.WeekDayIndex",
        property: "constraint",
        chip: "254",
        matter: "1tonumberofweekdayschedulessupportedperuser,254",
        reason: "We keep both alternatives the specification states; CHIP keeps the sentinel",
    },
    {
        path: "DoorLock.ClearYearDaySchedule.YearDayIndex",
        property: "constraint",
        chip: "254",
        matter: "1tonumberofyeardayschedulessupportedperuser,254",
        reason: "We keep both alternatives the specification states; CHIP keeps the sentinel",
    },
    {
        path: "DoorLock.ClearHolidaySchedule.HolidayIndex",
        property: "constraint",
        chip: "254",
        matter: "1tonumberofholidayschedulessupported,254",
        reason: "We keep both alternatives the specification states; CHIP keeps the sentinel",
    },
    {
        path: "DoorLock.ClearUser.UserIndex",
        property: "constraint",
        chip: "65534",
        matter: "1tonumberoftotaluserssupported,65534",
        reason: "We keep both alternatives the specification states; CHIP keeps the sentinel",
    },
    {
        path: "IlluminanceMeasurement.MeasuredValue",
        property: "constraint",
        chip: "0",
        matter: "0,minmeasuredvaluetomaxmeasuredvalue",
        reason: "We keep the range the specification states alongside the zero sentinel",
    },
    {
        path: "Thermostat.SetpointChangeAmount",
        property: "type",
        chip: "int16s",
        matter: "temperaturedifference",
        reason: "We name the temperature type the specification defines; CHIP states a primitive",
    },
    {
        path: "ContentLauncher.ContentSearchStruct.ParameterList",
        property: "default",
        chip: "0",
        matter: "undefined",
        reason: "CHIP states a numeric fallback for a list; the specification states none",
    },
    {
        path: "*.SolicitOfferResponse.VideoStreamId",
        property: "conformance",
        chip: "solicitoffer,d",
        matter: "solicitoffer.videostreamid,d",
        reason: "We keep the field the conformance selects; CHIP names only the command",
    },
    {
        path: "*.SolicitOfferResponse.AudioStreamId",
        property: "conformance",
        chip: "solicitoffer,d",
        matter: "solicitoffer.audiostreamid,d",
        reason: "We keep the field the conformance selects; CHIP names only the command",
    },
    {
        path: "*.ProvideOfferResponse.VideoStreamId",
        property: "conformance",
        chip: "provideoffer,d",
        matter: "provideoffer.videostreamid,d",
        reason: "We keep the field the conformance selects; CHIP names only the command",
    },
    {
        path: "*.ProvideOfferResponse.AudioStreamId",
        property: "conformance",
        chip: "provideoffer,d",
        matter: "provideoffer.audiostreamid,d",
        reason: "We keep the field the conformance selects; CHIP names only the command",
    },
    {
        path: "*.Reserved28",
        property: "semanticTag",
        chip: "absent",
        matter: "present",
        reason: "The specification lists the deprecated tags; CHIP omits them",
    },
    {
        path: "*.Reserved30",
        property: "semanticTag",
        chip: "absent",
        matter: "present",
        reason: "The specification lists the deprecated tags; CHIP omits them",
    },
    {
        path: "*.Reserved49",
        property: "semanticTag",
        chip: "absent",
        matter: "present",
        reason: "The specification lists the deprecated tags; CHIP omits them",
    },
    {
        path: "KeypadInput.CecKeyCodeEnum.Reserved",
        property: "field",
        chip: "present",
        matter: "absent",
        reason: "We drop a value the specification names Reserved; CHIP keeps it",
    },
    {
        path: "Messages.MessageID",
        property: "datatype",
        chip: "absent",
        matter: "present",
        reason: "The specification defines the type in the cluster; CHIP treats it as a built-in",
    },
    {
        path: "ScenesManagement.LogicalSceneTable",
        property: "datatype",
        chip: "absent",
        matter: "present",
        reason: "The specification defines the type in the cluster; CHIP omits it",
    },
    {
        path: "Base Device Type",
        property: "deviceType",
        chip: "present",
        matter: "absent",
        reason: "We name the base device type Base",
    },
    {
        path: "*.ModeChangeStatus",
        property: "datatype",
        chip: "absent",
        matter: "present",
        reason: "We name the status codes of the mode clusters; CHIP types the field as the global status",
    },
    {
        path: "RvcCleanMode.StatusCodeEnum",
        property: "datatype",
        chip: "present",
        matter: "absent",
        reason: "We name the status codes of the mode clusters ModeChangeStatus",
    },
    {
        path: "RvcRunMode.StatusCodeEnum",
        property: "datatype",
        chip: "present",
        matter: "absent",
        reason: "We name the status codes of the mode clusters ModeChangeStatus",
    },
    {
        path: "Thermostat.MinSetpointDeadBand",
        property: "constraint",
        chip: "0to127",
        matter: "0to12.7°c",
        reason: "We keep the temperature notation of the specification where CHIP states the encoded value",
    },
    {
        path: "OperationalCredentials.AttestationResponse.AttestationElements",
        property: "constraint",
        chip: "maxresp_max",
        matter: "max900",
        reason: "We resolve the RESP_MAX constant the specification defines; CHIP keeps the name",
    },
    {
        path: "OperationalCredentials.CsrResponse.NocsrElements",
        property: "constraint",
        chip: "maxresp_max",
        matter: "max900",
        reason: "We resolve the RESP_MAX constant the specification defines; CHIP keeps the name",
    },
];

function matches(pattern: string, path: string) {
    const wanted = pattern
        .replace(/^\*\.?/, "")
        .split(".")
        .map(segment => canonicalizeName(segment));
    const actual = path.split(".").map(segment => canonicalizeName(segment));

    if (!pattern.startsWith("*")) {
        return wanted.length === actual.length && wanted.every((segment, index) => segment === actual[index]);
    }

    // A wildcard matches whole segments, so "*.Foo.Bar" does not match a single element named "FooBar"
    if (wanted.length > actual.length) {
        return false;
    }

    const offset = actual.length - wanted.length;
    return wanted.every((segment, index) => segment === actual[offset + index]);
}

const MATTER_NAMES = Object.fromEntries(Object.entries(TYPE_ALIASES).map(([ours, chip]) => [chip, ours]));

/** The name CHIP gives a type we name differently */
export function aliasOf(matterType: string) {
    return TYPE_ALIASES[matterType];
}

/** The name we give a type CHIP names differently */
export function matterNameFor(chipType: string) {
    return MATTER_NAMES[canonicalizeName(chipType)];
}

/** The reason a difference exists by design, if we know of one */
export function reasonFor(path: string, property: string, chip?: string, matter?: string) {
    const stated = matter ?? "undefined";

    for (const known of KNOWN_DIFFERENCES) {
        if (known.property !== property || known.chip !== chip || known.matter !== stated) {
            continue;
        }

        if (matches(known.path, path)) {
            return known.reason;
        }
    }
}
