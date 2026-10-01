/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

const TYPE_ERRORS: { [badType: string]: string } = {
    "attribute-id": "attrib-id",
    bitmap8: "map8",
    "node-idx": "node-id",
    SystemTimeMicroseconds: "systime-us",
    HardwareAddress: "hwadr",
    String: "string",
    variable: "any",
    SubjectId: "subject-id",
    SubjectID: "subject-id",
    SignedTemperatureType: "SignedTemperature",
    UnsignedTemperatureType: "UnsignedTemperature",
    "system-us": "systime-us",
    "system-ms": "systime-ms",
    "Time of Day": "TimeOfDay",
    "voltage-mW": "voltage-mV",
    utc: "epoch-s",
    ipv4addr: "ipv4adr",
    ipv6addr: "ipv6adr",
    "endpoint-id": "endpoint-no",
    "ModeBitmap.": "ModeBitmap",
    StatusCode: "status",
    boolean: "bool",
    Boolean: "bool",

    // Asciidoctor renders these as "FooType" in table cells but headings strip " Type" suffix
    VideoStreamIDType: "VideoStreamID",
    AudioStreamIDType: "AudioStreamID",
    SnapshotStreamIDType: "SnapshotStreamID",
    AnalysisStreamIDType: "AnalysisStreamID",

    // Humidistat tables name its enums by their link text rather than their headings
    HumidistatMode: "ModeEnum",
    HumidistatSystemStateEnum: "SystemStateEnum",

    // Cross-cluster type references (types defined in other clusters referenced by name)
    ChimeSound: "ChimeSoundStruct",
};

export function repairTypeIdentifier<T extends string | undefined>(type: T): T {
    if (type === undefined) {
        return type;
    }

    // 1.4 also started putting section identifiers in some type columns, so we end up with e.g.
    // Section11.24.5.2,“DatastoreStatusEntryType”. Perhaps alchemy trying to be fancy as it tends to happen along with
    // DataTypeList
    type = type.replace(/Section\d+(?:\.\d+)*,“([^”]+)Type”/gi, "$1") as typeof type;

    // Grr core says list is list[...] but 1.4 decided DataTypeList[...] is good too without documenting.  Possibly an
    // alchemy bug
    const listMatch = type!.match(/^(?:list|DataTypeList)\[(.*)\]$/);

    if (listMatch) {
        let entryType = listMatch[1];
        if (TYPE_ERRORS[entryType]) {
            entryType = TYPE_ERRORS[entryType];
        }
        return `list[${entryType}]` as T;
    }

    if (TYPE_ERRORS[type!]) {
        return TYPE_ERRORS[type!] as T;
    }

    return type;
}

export function repairType(record: { type?: string; constraint?: string }) {
    let type = record.type;
    if (type === undefined) {
        return type;
    }

    type = repairTypeIdentifier(type);

    // Bug in scene ID in 1.3 cluster spec 1.4.9.15 "CopyScene" command
    if (type === "max254") {
        type = "uint8";
        record.constraint = "max 254";
    }

    record.type = type;
}
