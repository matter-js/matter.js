/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ActionContext } from "#behavior/context/ActionContext.js";
import { AccessControl as AccessControlTypes } from "#clusters/access-control";
import { Bytes, deepCopy, InternalError, Logger, MaybePromise } from "#general";
import { NodeLifecycle } from "#node/NodeLifecycle.js";
import {
    AccessControl,
    AclEndpointContext,
    AclEntry,
    AclList,
    Fabric,
    FabricManager,
    hasLocalActor,
    hasRemoteActor,
    IncomingSubjectDescriptor,
    MessageExchange,
    NodeSession,
    SecureSession,
} from "#protocol";
import {
    CaseAuthenticatedTag,
    ClusterId,
    DeviceTypeId,
    EndpointNumber,
    FabricIndex,
    GroupId,
    NodeId,
    StatusCode,
    StatusResponseError,
    SubjectId,
    TlvTaggedList,
    TlvType,
} from "#types";
import { AccessControlBehavior } from "./AccessControlBehavior.js";

const logger = Logger.get("AccessControlServer");

/**
 * This is the default server implementation of AccessControlBehavior.
 *
 * When custom extensions are used, the `extensionEntryValidator` and `extensionEntryAccessCheck` methods can be
 * overridden to implement custom validation and access checks for the extension entries.
 */
export class AccessControlServer extends AccessControlBehavior.with("Extension") {
    declare internal: AccessControlServer.Internal;

    override initialize(): MaybePromise {
        this.reactTo(this.events.acl$Changing, this.#validateAccessControlListChanges); // Enhanced Validation
        this.reactTo(this.events.acl$Changed, this.#handleAccessControlListChange); // Event handling for changes
        if (
            this.state.extension !== undefined &&
            this.events.extension$Changing !== undefined &&
            this.events.extension$Changed !== undefined
        ) {
            this.reactTo(this.events.extension$Changing, this.#validateAccessControlExtensionChanges); // Enhanced Validation
            this.reactTo(this.events.extension$Changed, this.#handleAccessControlExtensionChange); // Event handling for changes
        }

        const lifecycle = this.endpoint.lifecycle as NodeLifecycle;
        this.reactTo(lifecycle.online, this.#online);
    }

    #online() {
        const aclsForFabric = this.#mapFabricAcls();

        // Initialize the ACL managers for each fabric
        const fabrics = this.env.get(FabricManager);
        for (const fabric of fabrics) {
            const fabricAcls = aclsForFabric.get(fabric.fabricIndex) ?? [];

            if (!fabricAcls.length) {
                // Handle Backward compatibility to Matter.js before 0.9.1 and add the missing ACL entry if no entry was set
                // so far by the controller
                const fallbackAcl: AccessControlTypes.AccessControlEntry = {
                    privilege: AccessControlTypes.AccessControlEntryPrivilege.Administer,
                    authMode: AccessControlTypes.AccessControlEntryAuthMode.Case,
                    subjects: [fabric.rootNodeId],
                    targets: null, // entire node
                    fabricIndex: fabric.fabricIndex,
                };
                this.state.acl.push(fallbackAcl);
                fabricAcls.push(fallbackAcl);
            }
            fabric.accessControl.aclList = fabricAcls;
            fabric.accessControl.extensionEntryAccessCheck = this.extensionEntryAccessCheck.bind(this);
        }

        // TODO handle delete fabric more generically later to remove fabric scoped data
        this.reactTo(fabrics.events.updated, this.#updateFabricAcls);
        this.reactTo(fabrics.events.added, this.#updateFabricAcls);

        this.reactTo(this.events.interactionBegin, this.#handleInteractionBegin);
        this.reactTo(this.events.interactionEnd, this.#handleInteractionEnd);

        this.reactTo(this.events.acl$Changed, this.#updateAccessControlList);

        this.internal.initialized = true;
    }

    addDefaultCaseAcl(fabric: Fabric, subjects: SubjectId[]) {
        const entry = {
            fabricIndex: fabric.fabricIndex,
            privilege: AccessControlTypes.AccessControlEntryPrivilege.Administer,
            authMode: AccessControlTypes.AccessControlEntryAuthMode.Case,
            subjects: subjects as NodeId[],
            targets: null, // entire node
        };
        this.state.acl.push(entry);
        this.#updateFabricAcls(fabric);
        // The update of the ACL is not validated because it has no assigned sess/fabric (and even then would use
        //  the wrong one), so we trigger the event ourself.
        this.events.accessControlEntryChanged?.emit(
            {
                changeType: AccessControlTypes.ChangeType.Added,
                adminNodeId: null, // When we add it, it is always from a PASE session
                adminPasscodeId: 0, // When we add it, it is always from a PASE session
                latestValue: entry,
                fabricIndex: fabric.fabricIndex,
            },
            this.context,
        );
    }

    #validateAccessControlListChanges(
        value: AccessControlTypes.AccessControlEntry[],
        _oldValue: AccessControlTypes.AccessControlEntry[],
    ) {
        const { context } = this;

        if (!hasRemoteActor(context)) {
            return;
        }

        const relevantFabricIndex = context.session.associatedFabric.fabricIndex;

        if (relevantFabricIndex === undefined) {
            return;
        }
        if (context !== undefined && context.exchange !== undefined) {
            const delayedChangeExchange = this.internal.aclUpdateDelayed.get(relevantFabricIndex);
            if (delayedChangeExchange !== undefined && delayedChangeExchange !== context.exchange) {
                // We are in a delayed ACL update with another exchange, so we do not process this one with Busy error
                // This is formally not in specification, but chip also does this that way
                logger.warn(
                    "Decline parallel ACL changes from multiple exchanges",
                    context.exchange.id,
                    "vs.",
                    delayedChangeExchange.id,
                );
                throw new StatusResponseError("Parallel ACL change from multiple exchanges", StatusCode.Busy);
            }
        }

        const fabricAcls = value.filter(entry => entry.fabricIndex === relevantFabricIndex);
        if (fabricAcls.length > this.state.accessControlEntriesPerFabric) {
            throw new StatusResponseError("AccessControlEntriesPerFabric exceeded", StatusCode.ResourceExhausted);
        }

        for (const entry of fabricAcls) {
            // We need to convert empty arrays to null because expected by chip tests
            if (entry.subjects !== null && entry.subjects.length === 0) {
                entry.subjects = null;
            }
            if (entry.targets !== null && entry.targets.length === 0) {
                entry.targets = null;
            }
            const { privilege, subjects, targets, authMode } = entry;
            if (subjects !== null && subjects.length > this.state.subjectsPerAccessControlEntry) {
                throw new StatusResponseError("SubjectsPerAccessControlEntry exceeded", StatusCode.ResourceExhausted);
            }

            if (targets !== null && targets.length > this.state.targetsPerAccessControlEntry) {
                throw new StatusResponseError("TargetsPerAccessControlEntry exceeded", StatusCode.ResourceExhausted);
            }

            if (authMode === AccessControlTypes.AccessControlEntryAuthMode.Pase) {
                throw new StatusResponseError("AuthMode for ACL must not be PASE", StatusCode.ConstraintError);
            } else if (authMode === AccessControlTypes.AccessControlEntryAuthMode.Case) {
                if (subjects !== null) {
                    for (const subject of subjects) {
                        if (NodeId.isCaseAuthenticatedTag(subject)) {
                            const cat = NodeId.extractAsCaseAuthenticatedTag(subject);
                            if (CaseAuthenticatedTag.getVersion(cat) === 0) {
                                throw new StatusResponseError(
                                    "CaseAuthenticatedTag version 0 is not allowed",
                                    StatusCode.ConstraintError,
                                );
                            }
                        } else if (!NodeId.isOperationalNodeId(subject)) {
                            throw new StatusResponseError(
                                "Subject must be a valid OperationalNodeId or CaseAuthenticatedTag",
                                StatusCode.ConstraintError,
                            );
                        }
                    }
                }
            } else if (authMode === AccessControlTypes.AccessControlEntryAuthMode.Group) {
                if (privilege === AccessControlTypes.AccessControlEntryPrivilege.Administer) {
                    throw new StatusResponseError(
                        "Group ACLs must not have Administer privilege",
                        StatusCode.ConstraintError,
                    );
                }

                if (subjects !== null) {
                    for (const subject of subjects) {
                        if (GroupId(Number(subject)) === GroupId.NO_GROUP_ID) {
                            throw new StatusResponseError(
                                "Subject must be a valid GroupId for Group ACLs",
                                StatusCode.ConstraintError,
                            );
                        }
                    }
                }
                // TODO For Group authentication, the Group ID identifies the required group, as defined in the Group Key Management Cluster.
            }

            if (targets !== null) {
                for (const target of targets) {
                    const { cluster, endpoint, deviceType } = target;
                    if (deviceType !== null && endpoint !== null) {
                        throw new StatusResponseError(
                            "DeviceType and Endpoint are mutually exclusive",
                            StatusCode.ConstraintError,
                        );
                    }
                    if (cluster === null && endpoint === null && deviceType === null) {
                        throw new StatusResponseError("At least one field must be present", StatusCode.ConstraintError);
                    }
                    if (cluster !== null && !ClusterId.isValid(cluster)) {
                        throw new StatusResponseError("Cluster must be a valid ClusterId", StatusCode.ConstraintError);
                    }
                    if (endpoint !== null && !EndpointNumber.isValid(endpoint)) {
                        throw new StatusResponseError(
                            "Endpoint must be a valid OperationalNodeId",
                            StatusCode.ConstraintError,
                        );
                    }
                    if (deviceType !== null && !DeviceTypeId.isValid(deviceType)) {
                        throw new StatusResponseError(
                            "DeviceType must be a valid DeviceType",
                            StatusCode.ConstraintError,
                        );
                    }
                }
            }
        }
    }

    /**
     * Determine and return the adminPassCodeId and adminNodeId from the node that initiated the ACL change.
     * it is either the root node of the fabric or 0 if the session is undefined or a PASE session.
     */
    #adminDataFromSession(session: SecureSession | undefined) {
        if (session === undefined || (NodeSession.is(session) && session.isPase)) {
            return { adminPasscodeId: 0, adminNodeId: null };
        }
        const adminNodeId = session?.associatedFabric.rootNodeId;
        if (adminNodeId === undefined) {
            throw new InternalError("Admin Node ID is undefined, should never happen");
        }
        return { adminPasscodeId: null, adminNodeId };
    }

    #handleAccessControlListChange(
        value: AccessControlTypes.AccessControlEntry[],
        oldValue: AccessControlTypes.AccessControlEntry[],
    ) {
        if (!this.internal.initialized) {
            return; // Too early to send events
        }

        const session = hasRemoteActor(this.context) ? this.context.session : undefined;

        // TODO: This might be not really correct for local ACL changes because there the session fabric could be
        //  different which would lead to missing events
        const relevantFabricIndex = session?.associatedFabric.fabricIndex;

        if (relevantFabricIndex === undefined || this.events.accessControlEntryChanged === undefined) {
            return;
        }
        const { adminPasscodeId, adminNodeId } = this.#adminDataFromSession(session);
        const fabricAcls = value.filter(entry => entry.fabricIndex === relevantFabricIndex);
        const oldFabricAcls = oldValue.filter(entry => entry.fabricIndex === relevantFabricIndex);

        let i = 0;
        for (; i < fabricAcls.length; i++) {
            const changeType =
                oldFabricAcls[i] === undefined
                    ? AccessControlTypes.ChangeType.Added
                    : fabricAcls[i] === undefined
                      ? AccessControlTypes.ChangeType.Removed
                      : AccessControlTypes.ChangeType.Changed;
            this.events.accessControlEntryChanged.emit(
                {
                    changeType,
                    adminNodeId,
                    adminPasscodeId,
                    latestValue:
                        (changeType === AccessControlTypes.ChangeType.Removed ? oldFabricAcls[i] : fabricAcls[i]) ??
                        null,
                    fabricIndex: relevantFabricIndex,
                },
                this.context,
            );
        }
        if (oldFabricAcls.length > i) {
            for (let j = oldFabricAcls.length - 1; j >= i; j--) {
                this.events.accessControlEntryChanged.emit(
                    {
                        changeType: AccessControlTypes.ChangeType.Removed,
                        adminNodeId,
                        adminPasscodeId,
                        latestValue: oldValue[j],
                        fabricIndex: relevantFabricIndex,
                    },
                    this.context,
                );
            }
        }
    }

    #validateAccessControlExtensionChanges(value: AccessControlTypes.AccessControlExtension[]) {
        if (!hasRemoteActor(this.context)) {
            return;
        }

        const relevantFabricIndex = this.context.session.associatedFabric.fabricIndex;

        const fabricExtensions = value.filter(entry => entry.fabricIndex === relevantFabricIndex);

        if (fabricExtensions.length === 0) {
            return;
        }
        if (fabricExtensions.length > 1) {
            throw new StatusResponseError("Extension list must contain a single entry", StatusCode.ConstraintError);
        }

        // we have exactly one entry
        this.extensionEntryValidator(fabricExtensions[0]);
    }

    #handleAccessControlExtensionChange(
        value: AccessControlTypes.AccessControlExtension[],
        oldValue: AccessControlTypes.AccessControlExtension[],
    ) {
        if (!this.internal.initialized) {
            return; // Too early to send events
        }

        const session = hasRemoteActor(this.context) ? this.context.session : undefined;

        // TODO: This might be not really correct for local ACL changes because there the session fabric could be
        //  different which would lead to missing events of the relevant entries
        const relevantFabricIndex = session?.associatedFabric.fabricIndex;

        if (relevantFabricIndex === undefined || this.events.accessControlExtensionChanged === undefined) {
            return;
        }
        const { adminPasscodeId, adminNodeId } = this.#adminDataFromSession(session);

        const fabricExtensions = value.filter(entry => entry.fabricIndex === relevantFabricIndex);
        const oldFabricExtensions = oldValue.filter(entry => entry.fabricIndex === relevantFabricIndex);

        const changeType =
            fabricExtensions.length > oldFabricExtensions.length
                ? AccessControlTypes.ChangeType.Added
                : fabricExtensions.length < oldFabricExtensions.length
                  ? AccessControlTypes.ChangeType.Removed
                  : AccessControlTypes.ChangeType.Changed;

        this.events.accessControlExtensionChanged.emit(
            {
                changeType,
                adminNodeId,
                adminPasscodeId,
                latestValue:
                    (changeType === AccessControlTypes.ChangeType.Removed
                        ? oldFabricExtensions[0]
                        : fabricExtensions[0]) ?? null,
                fabricIndex: relevantFabricIndex,
            },
            this.context,
        );
    }

    /**
     * This method allows to implement the validation of manufacturer specific ACL extensions when an extension entry is
     * added or changed. The default implementation checks whether the extension is a valid TLV and possible to decode.
     *
     * In case of an Error throws StatusResponseError.
     *
     * Override this method in your own behavior to implement custom validation.
     */
    protected extensionEntryValidator(extension: AccessControlTypes.AccessControlExtension) {
        const { data } = extension;
        const extensionBytes = Bytes.of(data);
        if (
            extensionBytes.length < 2 ||
            extensionBytes[0] !== TlvType.List ||
            extensionBytes[extensionBytes.length - 1] !== TlvType.EndOfContainer
        ) {
            // Easier to check that way that it is an Listen without any tags in general
            throw new StatusResponseError("Extension must be a valid TLV", StatusCode.ConstraintError);
        }
        try {
            TlvTaggedList({} /* No fields, sufficient for validation */, true).decode(data);
        } catch (error) {
            logger.debug(`Extension TLV decoding failed:`, error);
            throw new StatusResponseError("Extension must be a valid TLV", StatusCode.ConstraintError);
        }
    }

    /**
     * This method allows to implement the validation of manufacturer specific ACL extensions when access control is
     * checked to decide if access is allowed or not.
     * The default implementation always returns true. Override this method in your own behavior to implement custom
     * validation.
     */
    protected extensionEntryAccessCheck(
        _aclList: AclList,
        _aclEntry: AclEntry,
        _subjectDesc: IncomingSubjectDescriptor,
        _endpoint: AclEndpointContext,
        _clusterId: ClusterId,
    ) {
        return true;
    }

    /** A fabric was added or updated, so we need to initialize the ACL for this fabric */
    #updateFabricAcls(fabric: Fabric) {
        const fabricIndex = fabric.fabricIndex;
        fabric.accessControl.aclList = deepCopy(this.state.acl).filter(entry => entry.fabricIndex === fabricIndex);
    }

    /**
     * When beginning an interaction for an online session, we register the potential ACL change for the associated
     * fabric index. If ACL data are really changed later, the exchange gets added then.
     */
    #handleInteractionBegin(session?: AccessControl.Session) {
        if (hasRemoteActor(session)) {
            this.#prepareAclUpdateFor(session.fabric);
        }
    }

    /**
     * When an interaction is finished, we check if there was a delayed ACL update for the associated fabric and apply
     * it to the manager. For this we check if we have an exchange stored because otherwise the interaction was in fact
     * not changing the ACL.
     */
    #handleInteractionEnd(session?: AccessControl.Session) {
        if (hasRemoteActor(session)) {
            if (this.internal.aclUpdateDelayed.get(session.fabric) !== undefined) {
                this.#applyDelayedAclUpdateFor(session.fabric);
            }
        }
    }

    /** The ACL list was changed, so we need to determine if and when to apply the update to the ACL manager */
    #updateAccessControlList(
        acl: AccessControlTypes.AccessControlEntry[],
        _oldAcl: AccessControlTypes.AccessControlEntry[],
        context?: ActionContext,
    ) {
        if (hasLocalActor(context)) {
            // local or offline ACL change, so we update all fabrics because we do not know better
            this.#updateAllFabricsAcls();
        } else {
            const fabric = context.session?.associatedFabric;
            if (fabric === undefined || fabric.fabricIndex === undefined || context.exchange === undefined) {
                throw new InternalError("We require a fabric bound online session to write ACL changes");
            }
            this.#handleFabricAclUpdate(fabric, acl, context.exchange);
        }
    }

    /**
     * Handles the ACL update for a specific fabric. If an exchange is present, we delay the update until the
     * interaction is finished.
     */
    #handleFabricAclUpdate(fabric: Fabric, acl: AccessControlTypes.AccessControlEntry[], exchange: MessageExchange) {
        const fabricIndex = fabric.fabricIndex;
        if (this.internal.aclUpdateDelayed.has(fabricIndex)) {
            // We have registered an interaction for this fabric, so we delay the update
            logger.debug(
                "ACL attribute updated, but interaction still in progress, delaying update of ACL manager for FabricIndex",
                fabricIndex,
            );
            this.#delayAclUpdateFor(fabricIndex, exchange, acl);
        } else {
            // No interaction registered, so we apply directly because local/offline change
            logger.debug("ACL attribute updated, applying update to ACL manager", fabricIndex);

            fabric.accessControl.aclList = deepCopy(acl).filter(entry => entry.fabricIndex === fabricIndex);
        }
    }

    #mapFabricAcls() {
        const acl = deepCopy(this.state.acl);
        const aclsForFabric = new Map<FabricIndex, AccessControlTypes.AccessControlEntry[]>();
        // Collect ACLs for each fabric
        for (const entry of acl) {
            const { fabricIndex } = entry;
            const acls = aclsForFabric.get(fabricIndex) ?? [];
            acls.push(entry);
            aclsForFabric.set(fabricIndex, acls);
        }
        return aclsForFabric;
    }

    /** Update all fabrics with the current ACL list */
    #updateAllFabricsAcls() {
        const aclsForFabric = this.#mapFabricAcls();

        const fabrics = this.env.get(FabricManager);
        for (const fabric of fabrics) {
            // Update all Fabrics and set the ACL list for each fabric, empty ACLs when none are present
            fabric.accessControl.aclList = aclsForFabric.get(fabric.fabricIndex) ?? [];
        }
    }

    /**
     * Register a potential change of ACL for a specific fabric index. if changes happened is checked when interaction
     * ends.
     */
    #prepareAclUpdateFor(fabricIndex: FabricIndex) {
        if (!this.internal.aclUpdateDelayed.has(fabricIndex)) {
            logger.info("Register ACL update to be delayed for fabricIndex", fabricIndex);
            this.internal.aclUpdateDelayed.set(fabricIndex, undefined);
        }
    }

    /**
     * Register a concrete change of ACL for a specific fabric index. The exchange allows to also limit ACL changes to
     * that exchange until interaction is finished.
     */
    #delayAclUpdateFor(
        fabricIndex: FabricIndex,
        exchange: MessageExchange,
        acl: AccessControlTypes.AccessControlEntry[],
    ) {
        if (!this.internal.aclUpdateDelayed.has(fabricIndex)) {
            logger.info("Register ACL update to be delayed for fabricIndex", fabricIndex);
        }
        this.internal.aclUpdateDelayed.set(fabricIndex, exchange);
        this.internal.delayedAclData.set(
            fabricIndex,
            deepCopy(acl).filter(entry => entry.fabricIndex === fabricIndex),
        );
    }

    /** Applies the delayed ACL update for a specific fabric index, if existing */
    #applyDelayedAclUpdateFor(fabricIndex: FabricIndex) {
        const updateDelayed = !!this.internal.aclUpdateDelayed.get(fabricIndex);
        const delayedData = this.internal.delayedAclData.get(fabricIndex);

        this.internal.delayedAclData.delete(fabricIndex);
        this.internal.aclUpdateDelayed.delete(fabricIndex);
        if (updateDelayed && delayedData !== undefined) {
            this.env.get(FabricManager).for(fabricIndex).accessControl.aclList = delayedData;
        }
    }
}

export namespace AccessControlServer {
    export class Internal {
        /** Is the cluster logic initialized? Used to block events before full initialization. */
        initialized = false;

        /**
         * When an online and potentially chunked ACL writing happens, we will delay the update and store the exchange
         * used for the writing. With this we also verify that concurrent writes are blocked and will not mix the data.
         */
        aclUpdateDelayed = new Map<FabricIndex, MessageExchange | undefined>();

        /** Latest delayed data of acl attribute */
        delayedAclData = new Map<FabricIndex, AccessControlTypes.AccessControlEntry[]>();
    }

    export declare const ExtensionInterface: {
        extensionEntryValidator: (extension: AccessControlTypes.AccessControlExtension) => void;
        extensionEntryAccessCheck: (
            aclList: AclList,
            aclEntry: AclEntry,
            subjectDesc: IncomingSubjectDescriptor,
            endpoint: AclEndpointContext,
            clusterId: ClusterId,
        ) => boolean;
    };
}
