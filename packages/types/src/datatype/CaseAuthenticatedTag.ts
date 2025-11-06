/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Branded, Logger } from "#general";
import { ValidationOutOfBoundsError } from "../common/ValidationError.js";
import { TlvUInt32 } from "../tlv/TlvNumber.js";
import { TlvWrapper } from "../tlv/TlvWrapper.js";

const logger = Logger.get("CaseAuthenticatedTag");

/**
 * A CASE Authenticated Tag (CAT) is a special subject distinguished name within the Operational Certificate.
 *
 * @see {@link MatterSpecification.v141.Core} § 6.6.2.1.2.
 */
export type CaseAuthenticatedTag = Branded<number, "CaseAuthenticatedTag">;

export function CaseAuthenticatedTag(id: number): CaseAuthenticatedTag {
    if ((id & 0xffff) === 0) {
        throw new ValidationOutOfBoundsError("CaseAuthenticatedTag version number must not be 0.");
    }

    /** @see {@link MatterSpecification.v142.Core} § 6.6.2.1.2. */
    // 0xF000 till 0xFFFD are reserved, 0xFFFE and 0xFFFF are assigned for special use cases
    if (id >>> 16 > 0xefff) {
        logger.warn(`CaseAuthenticatedTag Identifiers SHOULD NOT exceed 0xEFFF. Please choose a lower value.`);
    }
    return id as CaseAuthenticatedTag;
}

export namespace CaseAuthenticatedTag {
    /** @see {@link MatterSpecification.v142.Core} § 6.6.2.1.2. */
    export const AdministratorIdentifier = 0xffff as CaseAuthenticatedTag;

    /** @see {@link MatterSpecification.v142.Core} § 6.6.2.1.2. */
    export const AnchorIdentifier = 0xfffe as CaseAuthenticatedTag;

    export const getIdentifyValue = (tag: CaseAuthenticatedTag) => tag >>> 16;

    export const getVersion = (tag: CaseAuthenticatedTag) => tag & 0xffff;

    export const increaseVersion = (tag: CaseAuthenticatedTag) => {
        const version = getVersion(tag);
        if (version === 0xffff) {
            throw new ValidationOutOfBoundsError("CaseAuthenticatedTag version number must not exceed 0xffff.");
        }
        return CaseAuthenticatedTag(tag + 1);
    };

    export const validateNocTagList = (tags: CaseAuthenticatedTag[]) => {
        if (tags.length > 3) {
            throw new ValidationOutOfBoundsError(`Too many CaseAuthenticatedTags (${tags.length}).`);
        }
        // Get only the tags: upper 16 bits are identifier value, lower 16 bits are tag version
        const tagIdentifierValues = new Set<number>(tags.map(cat => CaseAuthenticatedTag.getIdentifyValue(cat)));
        if (tagIdentifierValues.size !== tags.length) {
            throw new ValidationOutOfBoundsError("CASEAuthenticatedTags field contains duplicate identifier values.");
        }
    };
}

/** Tlv schema for an CASE Authenticated Tag. */
class TlvCaseAuthenticatedTagSchema extends TlvWrapper<CaseAuthenticatedTag, number> {
    constructor() {
        super(
            TlvUInt32,
            caseAuthenticatedTag => caseAuthenticatedTag,
            value => CaseAuthenticatedTag(value),
        );
    }

    override validate(value: CaseAuthenticatedTag) {
        super.validate(value);

        // verify that lower 16 bit are not 0
        if ((value & 0xffff) === 0) {
            throw new ValidationOutOfBoundsError("CaseAuthenticatedTag version number must not be 0.");
        }
    }
}

export const TlvCaseAuthenticatedTag = new TlvCaseAuthenticatedTagSchema();
