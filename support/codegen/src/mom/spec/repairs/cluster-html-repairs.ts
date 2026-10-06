/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "@matter/general";
import { ClusterReference, GlobalReference, SpecReference } from "../spec-types.js";

export enum ScanDirective {
    // Ignore section in stream
    IGNORE = 1,

    // Treat as one level higher than actual in stream
    POP = 2,

    // Treat as two levels higher
    POP2 = 3,

    // Collect section as a "namespace" entry
    NAMESPACE = 4,
}

const IGNORE = () => ScanDirective.IGNORE;
const POP = () => ScanDirective.POP;
const POP2 = () => ScanDirective.POP2;
const NAMESPACE = () => ScanDirective.NAMESPACE;

type HtmlRepair = (ref: SpecReference, ownerRef: ClusterReference | GlobalReference) => ScanDirective | void;

type HtmlRepairs = Record<string, HtmlRepair>;

// A cluster's datatypes sit two levels below the cluster heading
const POP_WHEN_NESTED: HtmlRepair = (ref, ownerRef) =>
    depthOf(ref) > depthOf(ownerRef) + 2 ? ScanDirective.POP : undefined;

function depthOf(ref: SpecReference) {
    return ref.xref.section.split(".").length;
}

export const ClusterHtmlRepairs: Record<string, HtmlRepairs> = {
    "General Commissioning": {
        // In 1.1 spec, command table is not here...
        "11.9.6"(subref) {
            if (subref.name === "Commands" && !subref.tables) {
                return ScanDirective.IGNORE;
            }
        },

        // ...but here
        "11.9.6.1"(subref) {
            if (subref.name === "Common fields in General Commissioning cluster responses" && subref.tables) {
                subref.name = "Commands";
                subref.detailSection = "11.9.6";
            }
        },
    },

    Thermostat: {
        "4.3.9.6": IGNORE,
        "4.3.9.7": IGNORE,

        // In 1.1 spec thermostat features is errantly nested under cluster identifiers
        "4.3.3.1": POP,
    },

    "Content Launcher": {
        // In 1.1. spec, SupportedStreamingProtocols bitmap is not here...
        "6.7.3.2": IGNORE,

        // ...but here
        "6.7.3.2.1"(subref) {
            subref.name = "SupportedStreamingProtocols Attribute";
        },
    },

    "Door Lock": {
        // These two are nested one level too deep in 1.3 spec
        "5.2.6.25.1": POP,
        "5.2.6.25.2": POP,
    },

    "Operational State": {
        // 1.2+ use this terminology to define a subset of the values for ErrorStateEnum.  We inject the table into the
        // previous section, after its table of ranges, so translation picks them up
        "ErrorStateEnum GeneralErrors Range"(subref, ownerRef) {
            const { datatypes } = ownerRef as ClusterReference;
            const datatype = datatypes?.[datatypes.length - 1];
            if (datatype?.name !== "ErrorStateEnum" || !datatype.tables || !subref.tables?.length) {
                throw new InternalError("OperationalState.ErrorStateEnum definition uses unexpected format");
            }
            datatype.tables.push(subref.tables[0]);
            return ScanDirective.IGNORE;
        },
    },

    "Mode Base": {
        // This is buried too deeply to fix elegantly (in a field in a datatype of the mode base cluster).  So just
        // designate as processing as a namespace
        "Mode Base Status CommonCodes Range": NAMESPACE,

        // The manufacturer range of the status codes
        "Mode Base Status Code Ranges": NAMESPACE,

        // This at a reasonable level but is a one-off.  So easiest to handle here
        "Mode Namespace": NAMESPACE,
    },

    "ICD Management": {
        // ClientTypeEnum is one level too deep (1.4 core)
        "ClientTypeEnum Type": POP_WHEN_NESTED,
    },

    "Service Area": {
        // SelectAreasStatus and SkipAreaStatus enums are too deep (1.4 cluster)
        "SelectAreasStatus Type": POP_WHEN_NESTED,
        "SkipAreaStatus Type": POP_WHEN_NESTED,
    },

    "Joint Fabric Datastore": {
        // This is a fake section number for a datatype that generates at the same level as a field for the previous
        // datatype (1.4 core)
        "11.24.5.4.7": POP2,
    },

    "Joint Fabric PKI": {
        // The joint fabric guys really don't adhere to conventions.  We can mostly correct automatically but in this
        // case they spelled out Signing Request instead of using abbreviation SR from defining table
        "11.25.4.1"(subref) {
            if (subref.name === "ICAC Signing Request Status Enum Type") {
                subref.name = "IcacsrRequestStatusEnum";
            }
        },
    },
};

// Modify incoming stream to workaround specific spec issues
export function repairIncomingHtml(subref: SpecReference, ownerRef: ClusterReference | GlobalReference) {
    const repairs = ClusterHtmlRepairs[ownerRef.name];
    if (!repairs) {
        return;
    }

    const repair = repairs[subref.xref.section] ?? repairs[subref.name];
    if (repair) {
        return repair(subref, ownerRef);
    }
}
