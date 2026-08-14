/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PairingHintBitmap } from "#advertisement/PairingHintBitmap.js";
import { SupportedTransportsBitmap } from "#common/SupportedTransportsBitmap.js";
import type { Fabric } from "#fabric/Fabric.js";
import { SessionIntervals } from "#session/SessionIntervals.js";
import type { ProductDescription, TypeFromPartialBitSchema } from "@matter/types";
import { IcdManagement } from "@matter/types/clusters/icd-management";
import { CommissioningMode } from "./CommissioningMode.js";

export type ServiceDescription =
    | ServiceDescription.Operational
    | ServiceDescription.Commissionable
    | ServiceDescription.Commissioner;

export namespace ServiceDescription {
    export function isCommissioning(description: ServiceDescription): description is Commissionable | Commissioner {
        return description.kind === "commissionable" || description.kind === "commissioner";
    }

    export function isOperational(description: ServiceDescription): description is Operational {
        return description.kind === "operational";
    }

    export interface Base extends Partial<SessionIntervals> {
        /**
         * The IP port for the Matter protocol.
         */
        port?: number;

        /**
         * Indicate support for TCP.
         */
        tcp?: SupportedTransportsBitmap;

        /**
         * Indicate support for ICD.
         */
        icd?: IcdManagement.OperatingMode;
    }

    export interface Commissionable extends Base, ProductDescription {
        readonly kind: "commissionable";

        /**
         * The commissioning mode.
         */
        readonly mode: CommissioningMode;

        /**
         * Device discriminator for commissionable announcements.
         */
        readonly discriminator: number;

        /**
         * Pairing hint of the device for commissionable announcements.
         */
        readonly pairingHint?: TypeFromPartialBitSchema<typeof PairingHintBitmap>;

        /**
         * Pairing instruction of the device for commissionable announcements.
         */
        readonly pairingInstructions?: string;
    }

    export function Commissionable(definition: Omit<Commissionable, "kind">): Commissionable {
        return {
            ...definition,
            kind: "commissionable",
        };
    }

    export interface Operational extends Base {
        readonly kind: "operational";

        /**
         * The advertised fabric.
         */
        readonly fabric: Fabric;
    }

    export function Operational(definition: Omit<Operational, "kind">): Operational {
        return {
            ...definition,
            kind: "operational",
        };
    }

    export interface Commissioner extends Omit<ProductDescription, "deviceType">, Base {
        readonly kind: "commissioner";

        /**
         * The device type.
         *
         * This is optional for commissioner advertisement.
         */
        readonly deviceType?: number;
    }

    export function Commissioner(definition: Omit<Commissioner, "kind">): Commissioner {
        return {
            ...definition,
            kind: "commissioner",
        };
    }
}
