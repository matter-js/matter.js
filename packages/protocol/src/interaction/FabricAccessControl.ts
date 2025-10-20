/**
 * @license
 * Copyright 2022-2023 Project CHIP Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { Subject } from "#action/server/Subject.js";
import { AccessControl } from "#clusters/access-control";
import type { Fabric } from "#fabric/Fabric.js";
import { Diagnostic, InternalError, Logger, MatterFlowError } from "#general";
import { AccessLevel } from "#model";
import {
    CaseAuthenticatedTag,
    ClusterId,
    DeviceTypeId,
    EndpointNumber,
    FabricIndex,
    NodeId,
    StatusCode,
    StatusResponseError,
    SubjectId,
} from "#types";
import { AccessControl as AccessControlContext } from "../action/server/AccessControl.js";

const logger = Logger.get("FabricAccessControl");

export type AclEntry = Omit<AccessControl.AccessControlEntry, "privilege"> & {
    privilege: AccessLevel;
};
export type AclList = AclEntry[];

export type AclExtensionEntry = AccessControl.AccessControlExtension;
export type AclExtensionList = AclExtensionEntry[];

export type AclEndpointContext = {
    id: EndpointNumber;
    deviceTypes: DeviceTypeId[];
};

const ImplicitDefaultPaseAclEntry: AclEntry = {
    fabricIndex: FabricIndex.NO_FABRIC, // not fabric-specific
    privilege: AccessLevel.Administer,
    authMode: AccessControl.AccessControlEntryAuthMode.Pase,
    subjects: [],
    targets: [], // entire node
};

enum AuthModeNone {
    None = 0,
}

export type IncomingSubjectDescriptor = {
    isCommissioning: boolean;
    authMode: AccessControl.AccessControlEntryAuthMode | AuthModeNone;
    subjects: SubjectId[];
    fabricIndex: FabricIndex;
};

export class AccessDeniedError extends StatusResponseError {
    constructor(message?: string) {
        super(message ?? "Unauthorized", StatusCode.UnsupportedAccess);
    }
}

/**
 * Implements Access Control Logic For one fabric as per Matter Specification @see {@link MatterSpecification.v12.Core}
 * § 6.6.5.2.
 */
export class FabricAccessControl {
    #fabricIndex: FabricIndex;
    #aclList: AclList = [];
    #extensionEntryAccessCheck: (
        aclList: AclList,
        aclEntry: AclEntry,
        subjectDesc: IncomingSubjectDescriptor,
        endpoint: AclEndpointContext,
        clusterId: ClusterId,
    ) => boolean = () => true;

    constructor(fabric?: Fabric) {
        if (fabric === undefined) {
            this.#fabricIndex = FabricIndex.NO_FABRIC;
            // Add the implicit default PASE ACL entry for the fabric
            this.#aclList.push(ImplicitDefaultPaseAclEntry);
        } else {
            this.#fabricIndex = fabric.fabricIndex;
        }
    }

    /**
     * Public method used to update the Access Control List on changes.
     */
    set aclList(aclList: AccessControl.AccessControlEntry[]) {
        if (aclList.some(({ fabricIndex }) => fabricIndex !== this.#fabricIndex)) {
            throw new InternalError("ACL entries must match the fabric index of the manager");
        }
        this.#aclList = [...aclList] as unknown as AclList; // It is the same structure we just use an internal type for privilege
        logger.info(
            "ACL List updated",
            this.#aclList.map(e => Diagnostic.dict(e)),
        );
    }

    set extensionEntryAccessCheck(
        func: (
            aclList: AclList,
            aclEntry: AclEntry,
            subjectDesc: IncomingSubjectDescriptor,
            endpoint: AclEndpointContext,
            clusterId: ClusterId,
        ) => boolean,
    ) {
        this.#extensionEntryAccessCheck = func;
    }

    /**
     * Implements the access control check for the given context, location and endpoint and is called by the
     * InteractionServer. The method returns the list of granted Access privileges for the given context, location and
     * endpoint.
     */
    accessLevelsFor(
        context: AccessControlContext.Session,
        location: AccessControlContext.Location,
        endpoint?: AclEndpointContext,
    ): AccessLevel[] {
        if (location.cluster === undefined) {
            // Without a cluster, internal behaviors are only accessible internally, so this is an irrelevant placeholder
            logger.warn("Access control check without cluster, returning View access level");
            return [AccessLevel.View];
        }
        if (endpoint === undefined) {
            // Without an endpoint, we can't determine access levels, ???
            logger.warn("Access control check without endpoint, returning View access level");
            return [AccessLevel.View];
        }

        return this.#getGrantedPrivileges(context, endpoint, location.cluster);
    }

    /**
     * Subjects must match exactly, or both are CAT with matching CAT ID and acceptable CAT version
     */
    #subjectMatches(aclSubject: SubjectId, isdSubject: SubjectId): boolean {
        if (BigInt(aclSubject) === BigInt(isdSubject)) {
            return true;
        }
        const aclNode = NodeId(aclSubject);
        const isdNode = NodeId(isdSubject);
        if (!NodeId.isCaseAuthenticatedTag(aclNode) || !NodeId.isCaseAuthenticatedTag(isdNode)) {
            return false;
        }
        const aclSubjectCat = NodeId.extractAsCaseAuthenticatedTag(aclNode);
        const isdSubjectCat = NodeId.extractAsCaseAuthenticatedTag(isdNode);
        return (
            CaseAuthenticatedTag.getIdentifyValue(aclSubjectCat) ===
                CaseAuthenticatedTag.getIdentifyValue(isdSubjectCat) &&
            CaseAuthenticatedTag.getVersion(isdSubjectCat) >= CaseAuthenticatedTag.getVersion(aclSubjectCat)
        );
    }

    /**
     * Add the new privilege to the granted privileges set and also add any privileges subsumed by the new privilege.
     */
    #addGrantedPrivilege(grantedPrivileges: Set<AccessLevel>, privilege: AccessLevel): void {
        // Add the new privilege to the granted privileges set
        grantedPrivileges.add(privilege);
        // Also add any privileges subsumed by the new privilege
        switch (privilege) {
            case AccessLevel.ProxyView:
                grantedPrivileges.add(AccessLevel.View);
                break;
            case AccessLevel.Operate:
                grantedPrivileges.add(AccessLevel.View);
                break;
            case AccessLevel.Manage:
                grantedPrivileges.add(AccessLevel.Operate);
                grantedPrivileges.add(AccessLevel.View);
                break;
            case AccessLevel.Administer:
                grantedPrivileges.add(AccessLevel.Manage);
                grantedPrivileges.add(AccessLevel.Operate);
                grantedPrivileges.add(AccessLevel.ProxyView);
                grantedPrivileges.add(AccessLevel.View);
                break;
        }
    }

    /**
     * Determines the granted privileges for the given session, endpoint, and cluster ID and returns them.
     */
    #getGrantedPrivileges(
        context: AccessControlContext.Session,
        endpoint: AclEndpointContext,
        clusterId: ClusterId,
    ): AccessLevel[] {
        const endpointId = endpoint.id;
        const subjectDesc = this.#getIsdFromMessage(context);

        // Granted privileges set is initially empty
        const grantedPrivileges = new Set<AccessLevel>();

        // PASE commissioning channel implicitly grants administer privilege to commissioner
        if (subjectDesc.authMode === AccessControl.AccessControlEntryAuthMode.Pase && subjectDesc.isCommissioning) {
            this.#addGrantedPrivilege(grantedPrivileges, AccessLevel.Administer);
        }

        for (const aclEntry of this.#aclList) {
            if (grantedPrivileges.has(AccessLevel.Administer)) {
                // End checking if highest privilege is granted
                break;
            }

            // Fabric index must match, there are no valid entries with FabricIndex == 0
            // other than the implicit PASE entry, which we will not see explicitly in the
            // access control list
            if (aclEntry.fabricIndex === FabricIndex.NO_FABRIC || aclEntry.fabricIndex !== subjectDesc.fabricIndex) {
                continue;
            }

            // Auth mode must match
            if (aclEntry.authMode !== subjectDesc.authMode) {
                continue;
            }

            // Subject must match, or be "wildcard"
            if (aclEntry.subjects === null || aclEntry.subjects.length === 0) {
                // Precondition: only CASE and Group auth can have empty subjects
                if (
                    aclEntry.authMode !== AccessControl.AccessControlEntryAuthMode.Case &&
                    aclEntry.authMode !== AccessControl.AccessControlEntryAuthMode.Group
                ) {
                    throw new MatterFlowError("ACL error: only CASE and Group auth can have empty subjects");
                }
                // ... Empty is wildcard, no match required
            } else {
                // Non-empty requires a match
                let matchedSubject = false;
                subjectLoop: for (const aclSubject of aclEntry.subjects) {
                    for (const isdSubject of subjectDesc.subjects) {
                        if (this.#subjectMatches(aclSubject, isdSubject)) {
                            matchedSubject = true;
                            break subjectLoop;
                        }
                    }
                }
                if (!matchedSubject) {
                    continue;
                }
            }

            // Target must match, or be "wildcard"
            if (aclEntry.targets === null || aclEntry.targets.length === 0) {
                // Empty is wildcard, no match required
            } else {
                // Non-empty requires a match
                let matchedTarget = false;
                for (const {
                    cluster: targetClusterId,
                    endpoint: targetEndpointId,
                    deviceType: targetDeviceType,
                } of aclEntry.targets) {
                    // Precondition: target cannot be empty
                    if (targetClusterId === null && targetEndpointId === null && targetDeviceType === null) {
                        throw new MatterFlowError("ACL error: target cannot be empty");
                    }
                    // Precondition: target cannot specify both endpoint and device type
                    if (targetEndpointId !== null && targetDeviceType !== null) {
                        throw new MatterFlowError("ACL error: target cannot specify both endpoint and device type");
                    }
                    // Cluster must match, or be wildcard
                    if (targetClusterId !== null && targetClusterId !== clusterId) {
                        continue;
                    }
                    // Endpoint must match, or be wildcard
                    if (targetEndpointId !== null && targetEndpointId !== endpointId) {
                        continue;
                    }
                    // Endpoint may be specified indirectly via device type
                    if (targetDeviceType !== null && !endpoint.deviceTypes.includes(targetDeviceType)) {
                        continue;
                    }
                    matchedTarget = true;
                    break;
                }
                if (!matchedTarget) {
                    continue;
                }
            }

            // Extensions processing must not fail
            if (!this.#extensionEntryAccessCheck(this.#aclList, aclEntry, subjectDesc, endpoint, clusterId)) {
                continue;
            }

            // All checks have passed, add privilege to granted privilege set
            this.#addGrantedPrivilege(grantedPrivileges, aclEntry.privilege);
        }
        // Should never grant Administer privilege to a Group.
        if (
            subjectDesc.authMode === AccessControl.AccessControlEntryAuthMode.Group &&
            grantedPrivileges.has(AccessLevel.Administer)
        ) {
            throw new MatterFlowError("ACL error: should never grant Administer privilege to a Group");
        }

        return [...grantedPrivileges];
    }

    /**
     * Determines the Incoming Subject Descriptor (ISD) from the given session.
     */
    #getIsdFromMessage(session: AccessControlContext.Session) {
        const fabricIndex = session.fabric;
        const isd: IncomingSubjectDescriptor = {
            isCommissioning: false,
            authMode: AuthModeNone.None,
            subjects: new Array<SubjectId>(),
            fabricIndex: FabricIndex.NO_FABRIC,
        };

        const { subject } = session;
        if (subject === undefined) {
            throw new MatterFlowError("ACL error: ACL checks require an authorized subject");
        }
        if (subject.id === NodeId.UNSPECIFIED_NODE_ID) {
            // Pase Session
            isd.authMode = AccessControl.AccessControlEntryAuthMode.Pase;
            isd.isCommissioning = true; // Or how "commissioning channel" is defined?
            isd.subjects.push(NodeId.UNSPECIFIED_NODE_ID); // Default Commissioning Passcode ID
            if (fabricIndex !== undefined && fabricIndex !== FabricIndex.NO_FABRIC) {
                isd.fabricIndex = fabricIndex;
            }
        } else if (Subject.isGroup(subject)) {
            if (fabricIndex === undefined || fabricIndex === FabricIndex.NO_FABRIC) {
                throw new MatterFlowError("ACL error: fabric needs to be associated for group sessions");
            }
            if (subject.hasValidMapping) {
                isd.authMode = AccessControl.AccessControlEntryAuthMode.Group;
                isd.subjects.push(subject.id);
                isd.fabricIndex = fabricIndex;
            }
        } else if (Subject.isNode(subject)) {
            // CASE session
            if (fabricIndex === undefined || fabricIndex === FabricIndex.NO_FABRIC) {
                throw new MatterFlowError("ACL error: Case session must be associated with a fabric");
            }
            isd.authMode = AccessControl.AccessControlEntryAuthMode.Case;
            isd.subjects.push(subject.id);
            if (subject.catSubjects !== undefined) {
                isd.subjects.push(...subject.catSubjects);
            }
            isd.fabricIndex = fabricIndex;
        }

        return isd;
    }
}
