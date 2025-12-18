/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasicInformationBehavior } from "#behaviors/basic-information";
import { DescriptorServer } from "#behaviors/descriptor";
import { OtaSoftwareUpdateProviderClient } from "#behaviors/ota-software-update-provider";
import { OtaSoftwareUpdateProvider } from "#clusters/ota-software-update-provider";
import { OtaSoftwareUpdateRequestor } from "#clusters/ota-software-update-requestor";
import { Endpoint } from "#endpoint/Endpoint.js";
import {
    AsyncObservable,
    Bytes,
    CancelablePromise,
    Crypto,
    Diagnostic,
    Duration,
    Hours,
    ImplementationError,
    InternalError,
    Logger,
    MatterError,
    MaybePromise,
    Millis,
    Minutes,
    Seconds,
    Time,
    Timer,
} from "#general";
import { FieldElement } from "#model";
import { ClientNodeInteraction } from "#node/client/ClientNodeInteraction.js";
import type { ClientNode } from "#node/ClientNode.js";
import { Node } from "#node/Node.js";
import type { ServerNode } from "#node/ServerNode.js";
import {
    BdxClient,
    BdxError,
    FileDesignator,
    Flow,
    OtaImageError,
    OtaImageHeader,
    OtaImageReader,
    PeerAddress,
    PersistedFileDesignator,
    RetransmissionLimitReachedError,
} from "#protocol";
import { ServerNodeStore } from "#storage/server/ServerNodeStore.js";
import { FabricIndex, NodeId, StatusResponse } from "#types";
import { OtaSoftwareUpdateRequestorBehavior } from "./OtaSoftwareUpdateRequestorBehavior.js";

const logger = Logger.get("OtaSoftwareUpdateRequestorServer");

const OTA_BDX_MAX_BLOCK_SIZE_TCP = 8_192; // 8192 is the max defined by the spec, we use that for TCP channels
const OTA_BDX_MAX_BLOCK_SIZE_NON_TCP = 1_024; // 1024 is the max defined by the spec, we use that for non-TCP channels

const MAX_BUSY_RETRIES = 3; // After 3 BUSY responses in a row, we try another provider

export interface ProviderLocation extends OtaSoftwareUpdateRequestor.ProviderLocation {}

export interface ActiveProviderLocation {
    location: ProviderLocation;
    previousQueryTimestamp: number | null;
    metadataForNode?: Bytes;
}

export interface UpdateInProgressDetails {
    newSoftwareVersion: number;
    location?: ProviderLocation;
    updateToken?: Bytes;
}

enum ScheduleReason {
    NewQuery,
    NoUpdateAvailable,
    Busy,
    Announced,
    Commissioned,
}

class OtaDownloadError extends MatterError {
    bytesTransferred: number = 0;
    totalBytesLength?: number;

    constructor(
        public readonly code: number,
        message: string,
    ) {
        super(`OTA Download Error ${code}: ${message}`);
    }
}

const schema = OtaSoftwareUpdateRequestorBehavior.schema.extend(
    {},
    FieldElement(
        { name: "activeOtaProviders", type: "list", quality: "N", conformance: "M" },
        FieldElement(
            { name: "entry", type: "struct" },
            FieldElement({ name: "location", type: "ProviderLocation", conformance: "M" }),
            FieldElement({ name: "previousQueryTimestamp", type: "uint64", quality: "X", conformance: "M" }),
            FieldElement({ name: "metadataForNode", type: "octstr", conformance: "O" }),
        ),
    ),
    FieldElement(
        { name: "updateInProgressDetails", type: "struct", quality: "NX", conformance: "M" },
        FieldElement({ name: "location", type: "ProviderLocation", conformance: "O" }),
        FieldElement({ name: "newSoftwareVersion", type: "uint32" }),
    ),
);

/**
 * This is the default server implementation of {@link OtaSoftwareUpdateRequestorBehavior}.
 *
 * To use OTA updates for matter.js based devices, you need to implement "applying the update" yourself!
 * The default implementation provides anything needed to check for updates and transfer new updates, according to the
 * Matter specification, but applying the update is too specific to your use case and the environment where the device
 * is used.
 *
 * The following custom state attributes are available to configure the behavior of the cluster:
 * * {@link updateQueryInterval}: Interval to check for updates, default: 24h as defined in Matter specification
 *
 * * {@link transferProtocolsSupported}: List of Transfer protocols that are announced as supported. By default, we only
 *     export BDX; we also support HTTPS (but basically no one else)
 *
 * * {@link canConsent}: Can the node request consent from the user for the update itself? Default is set to true, and the
 *     controller needs to take care to get the necessary consent when calling {@link requestUserConsent}.
 *
 * * {@link downloadLocation}: Option to provide a custom storage location (also backed by an own Storage solution) to store
 *     the received update file in.  If not provided, a default location is used.
 *
 *
 * For this the following extension points exist that need to be implemented:
 * * {@link requestUserConsent}: This method is needed to be implemented when you set {@link canConsent} to true and needs to
 *     implement user consent gathering.
 *
 * * {@link applyUpdate}: The method is called with the new SoftwareVersion and the PersistedFileDescriptor where a downloaded
 *     update is placed and needs to trigger the update process including shutdown and restart of the node and also
 *     sending "bootReason" event after the update!
 *
 * * {@link validateUpdateFile}: This method in default implementation reads the received OTA file and validates header and
 *     checksums and basic details. Override this method and use this.downloadLocation for access if any custom
 *     validations are needed
 */
export class OtaSoftwareUpdateRequestorServer extends OtaSoftwareUpdateRequestorBehavior {
    declare protected internal: OtaSoftwareUpdateRequestorServer.Internal;
    declare state: OtaSoftwareUpdateRequestorServer.State;
    declare events: OtaSoftwareUpdateRequestorServer.Events;

    // Enhance the Schema to store the flag that we expect an upgrade to happen
    static override readonly schema = schema;

    override async initialize() {
        // When starting up, and we have an unknown state (which is default), we set it to idle
        if (this.state.updateState === OtaSoftwareUpdateRequestor.UpdateState.Unknown) {
            this.state.updateState = OtaSoftwareUpdateRequestor.UpdateState.Idle;
            this.state.updateStateProgress = null;
        }

        // Make sure to add the needed device type for this endpoint
        (await this.agent.load(DescriptorServer)).addDeviceTypes("OtaRequestor");

        // Start and Stop the active queries based on the updatePossible flag
        this.reactTo(this.events.updatePossible$Changed, this.#enableOrDisableUpdates);

        // Validate and handle changes to the defaultOtaProviders list
        this.reactTo(this.events.defaultOtaProviders$Changing, this.#assertDefaultOtaProviders);
        this.reactTo(this.events.defaultOtaProviders$Changed, this.#handleUpdatedDefaultOtaProviders);

        const node = Node.forEndpoint(this.endpoint);
        this.reactTo(node.lifecycle.online, this.#online);
        this.reactTo(node.lifecycle.goingOffline, this.#goingOffline);

        // After commissioningComplete we should do an update query 30s later if anything was configured
        this.reactTo(node.lifecycle.commissioned, this.#scheduleInitialQuery);
    }

    get downloadLocation(): PersistedFileDesignator {
        if (this.internal.downloadLocation === undefined) {
            // Initialize storage for downloading the update files if not already provided
            if (this.state.downloadLocation === undefined) {
                const nodeStore = this.env.get(ServerNodeStore);
                const { productId, vendorId } = this.#basicInformationState();
                this.internal.downloadLocation = new PersistedFileDesignator(
                    `ota-${vendorId}-${productId}`,
                    nodeStore.bdxStore,
                );
            } else {
                this.internal.downloadLocation = this.state.downloadLocation;
            }
        }
        return this.internal.downloadLocation;
    }

    /** When we come back online after an update, we notify that the update was applied */
    async #online() {
        // If we have no active providers, but default ones, we add the default one for our fabric (if any)
        // This makes sure that we retry removed defaltProviders at least once after a restart
        if (this.state.activeOtaProviders.length === 0 && this.state.defaultOtaProviders.length > 0) {
            for (const provider of this.state.defaultOtaProviders) {
                await this.#addActiveOtaProvider(provider);
            }
            logger.debug(`No active OTA providers, adding ${this.state.activeOtaProviders.length} default providers`);
        }

        // Register an initial update query if we have at least one provider
        // We choose 120s to make sure that also after a restart we respect to not query more often than 120s as per spec
        if (this.state.activeOtaProviders.length > 0) {
            this.#scheduleUpdateQuery(
                this.state.updateInProgressDetails === null
                    ? Seconds(Math.floor(Math.random() * 599) + 120)
                    : undefined,
            ); // when we did not get just started after an update check for updates with a random delay of 2-12mins
        }

        // If we have an update in progress, check if the update was applied
        if (this.state.updateInProgressDetails !== null) {
            await this.#handlePreviousUpdateOnStart(this.state.updateInProgressDetails);
            this.state.updateInProgressDetails = null;
        }
    }

    #goingOffline() {
        this.internal.updateQueryTimer?.stop();
    }

    #scheduleInitialQuery() {
        this.#scheduleUpdateQuery(Seconds(30), ScheduleReason.Commissioned);
    }

    async #handlePreviousUpdateOnStart({ newSoftwareVersion, location, updateToken }: UpdateInProgressDetails) {
        const { productId, softwareVersion } = this.#basicInformationState();

        if (newSoftwareVersion !== softwareVersion) {
            logger.warn(
                `The device restarted while an update was in progress, but new softwareVersion is not as expected (${newSoftwareVersion} != ${softwareVersion}).`,
            );
            this.events.stateTransition.emit(
                {
                    previousState: OtaSoftwareUpdateRequestor.UpdateState.Applying,
                    newState: OtaSoftwareUpdateRequestor.UpdateState.Idle,
                    reason: OtaSoftwareUpdateRequestor.ChangeReason.Failure,
                    targetSoftwareVersion: null,
                },
                this.context,
            );

            this.#scheduleUpdateQuery(
                Seconds(Math.floor(Math.random() * 599) + 120),
                ScheduleReason.Busy, // Handle failed update like a busy provider to retry
                location,
            ); // check again on the last location a bit earlier
            return;
        }

        this.#emitVersionAppliedEvent(productId, softwareVersion);

        this.events.stateTransition.emit(
            {
                previousState: OtaSoftwareUpdateRequestor.UpdateState.Applying,
                newState: OtaSoftwareUpdateRequestor.UpdateState.Idle,
                reason: OtaSoftwareUpdateRequestor.ChangeReason.Success,
                targetSoftwareVersion: null,
            },
            this.context,
        );

        if (location === undefined || updateToken === undefined) {
            // No information from where the update came, so do not notify
            return;
        }

        try {
            const ep = await this.#connectOtaProviderFor(location);

            await ep
                .commandsOf(OtaSoftwareUpdateProviderClient)
                .notifyUpdateApplied({ softwareVersion: newSoftwareVersion, updateToken });
            logger.info(
                `Notified OTA Provider`,
                Diagnostic.dict(location),
                `that update to version ${newSoftwareVersion} was applied`,
            );
        } catch (error) {
            MatterError.accept(error);
            // Just log errors because the call is not mandatory
            logger.info(`Could not call notifyUpdateApplied on`, Diagnostic.dict(location), error);
        }
    }

    /** Enables or disables the update queries based on the new value of updatePossible */
    #enableOrDisableUpdates(newValue: boolean) {
        if (newValue) {
            if (
                !this.internal.updateQueryTimer?.isRunning ||
                this.state.updateState === OtaSoftwareUpdateRequestor.UpdateState.Idle
            ) {
                const seconds = Seconds(Math.floor(Math.random() * 599) + 60); // random delay 1..11min
                logger.info(`Enabling OTA update queries because updatePossible was set to true, next try in`, seconds);
                this.#scheduleUpdateQuery(seconds);
            }
        } else {
            logger.info("Disabling OTA update queries because updatePossible was set to false.");
            this.internal.updateQueryTimer?.stop();
            this.internal.updateQueryTimer = undefined;
        }
    }

    /** Validate changes to defaultOtaProviders, ensure only one entry per FabricIndex */
    #assertDefaultOtaProviders(newValues: ProviderLocation[]) {
        const seen = new Set<FabricIndex>();
        for (const { fabricIndex } of newValues) {
            if (seen.has(fabricIndex)) {
                throw new StatusResponse.ConstraintErrorError(
                    `Only one defaultOtaProviders entry per FabricIndex ${fabricIndex} is allowed.`,
                );
            }
            seen.add(fabricIndex);
        }
    }

    /** Handle changes to defaultOtaProviders list, ensure we add a changed entry to the list of active providers */
    #handleUpdatedDefaultOtaProviders(newValues: ProviderLocation[]) {
        const updatedProvider = newValues.find(({ fabricIndex }) => fabricIndex === this.context.fabric);
        if (updatedProvider !== undefined) {
            logger.info(
                `Fabric ${this.context.fabric} default OTA provider changed to`,
                Diagnostic.dict(updatedProvider),
            );
            this.#addActiveOtaProvider(updatedProvider).catch(error =>
                logger.info("Adding default OTA provider failed", error),
            );
        }

        // If we had no active providers before, we schedule an update query
        if (this.internal.updateQueryTimer === undefined && this.state.activeOtaProviders.length > 0) {
            this.#scheduleUpdateQuery(Seconds(Math.floor(Math.random() * 599) + 60), ScheduleReason.Announced); // random delay 1..11min
        }
    }

    /**
     * Default implementation for the announceOtaProvider command.
     * A Node announced itself as OTA Update Provider, so schedule an update check with it.
     * Depending on the announcementReason, we schedule the update query earlier with this provider or wait for the
     * next regular check.
     */
    override async announceOtaProvider({
        providerNodeId,
        vendorId,
        announcementReason,
        metadataForNode,
        endpoint,
    }: OtaSoftwareUpdateRequestor.AnnounceOtaProviderRequest) {
        // Require an associated Fabric
        const fabricIndex = this.context.fabric;
        if (!fabricIndex) {
            throw new StatusResponse.UnsupportedAccessError(
                "announceOtaProvider not allowed without an accessing fabric.",
            );
        }

        const provider: ProviderLocation = { fabricIndex, providerNodeId, endpoint };

        // Remember this provider as active to use it potentially with precedence
        await this.#addActiveOtaProvider(provider, metadataForNode);

        logger.info(
            `${announcementReason === OtaSoftwareUpdateRequestor.AnnouncementReason.UrgentUpdateAvailable ? "Urgent " : ""}OTA Provider announcement received:`,
            Diagnostic.dict({
                announcementReason: OtaSoftwareUpdateRequestor.AnnouncementReason[announcementReason],
                ...provider,
                vendorId,
            }),
        );

        const peerAddress = PeerAddress({ nodeId: providerNodeId, fabricIndex });
        await (Node.forEndpoint(this.endpoint) as ServerNode).peers.forAddress(peerAddress); // Initialize the client node and store address

        if (announcementReason !== OtaSoftwareUpdateRequestor.AnnouncementReason.SimpleAnnouncement) {
            // If Urgent or UpdateAvailable, we schedule an update query earlier as we would have done before
            const delay = Seconds(Math.floor(Math.random() * 599) + 1); // random delay 1..600s as per spec
            logger.info(`Scheduling urgent update query in`, delay);
            this.#scheduleUpdateQuery(delay, ScheduleReason.Announced, provider);
        } else {
            // Make sure we initialize the query timer if none was existing
            this.#scheduleUpdateQuery();
        }
    }

    /** Adds or updates an active OTA provider entry for a fabric index */
    async #addActiveOtaProvider(provider: ProviderLocation, metadataForNode?: Bytes) {
        const { fabricIndex, providerNodeId } = provider;
        const activeProviderIndex = this.state.activeOtaProviders.findIndex(
            p => p.location.fabricIndex === fabricIndex && p.location.providerNodeId === providerNodeId,
        );
        const activeProviderEntry: ActiveProviderLocation = {
            location: provider,
            previousQueryTimestamp: null, // We set to null to try this provider first next time
            metadataForNode,
        };
        if (activeProviderIndex === -1) {
            this.state.activeOtaProviders.push(activeProviderEntry);
            //this.state.activeOtaProviders = [...this.state.activeOtaProviders, activeProviderEntry];
        } else {
            this.state.activeOtaProviders[activeProviderIndex] = activeProviderEntry;
        }

        const peerAddress = PeerAddress({ nodeId: providerNodeId, fabricIndex });
        await (Node.forEndpoint(this.endpoint) as ServerNode).peers.forAddress(peerAddress); // Initialize client node and store address
    }

    /** Removes an OTA provider from the active and default list */
    #removeOtaProvider(provider: ProviderLocation) {
        const { fabricIndex, providerNodeId } = provider;
        const activeProviderIndex = this.state.activeOtaProviders.findIndex(
            p => p.location.fabricIndex === fabricIndex && p.location.providerNodeId === providerNodeId,
        );
        if (activeProviderIndex !== -1) {
            this.state.activeOtaProviders.splice(activeProviderIndex, 1);
        }

        const defaultProviderIndex = this.state.defaultOtaProviders.findIndex(
            p => p.fabricIndex === fabricIndex && p.providerNodeId === providerNodeId,
        );
        if (defaultProviderIndex !== -1) {
            this.state.defaultOtaProviders.splice(defaultProviderIndex, 1);
        }
    }

    /**  Marks an OTA provider as active but with no update available (timestamp 0) */
    #markActiveOtaProviderNoUpdate(provider: ProviderLocation) {
        const { fabricIndex, providerNodeId } = provider;
        const activeProviderIndex = this.state.activeOtaProviders.findIndex(
            p => p.location.fabricIndex === fabricIndex && p.location.providerNodeId === providerNodeId,
        );
        if (activeProviderIndex !== -1) {
            this.state.activeOtaProviders[activeProviderIndex].previousQueryTimestamp = Time.nowMs;
        } else {
            this.state.activeOtaProviders.push({
                location: provider,
                previousQueryTimestamp: Time.nowMs,
            });
        }
    }

    /**
     * Schedule an update query after the given delay (or latest as defined as update interval if no delay is provided)
     * and optionally for a specific provider (otherwise the most recently seen active provider or the default provider
     * is used).
     */
    #scheduleUpdateQuery(delay?: Duration, reason = ScheduleReason.NewQuery, provider?: ProviderLocation) {
        if (provider !== undefined) {
            this.internal.selectedProviderLocation = provider;
            if (reason === ScheduleReason.Busy) {
                this.internal.providerRetryCount++;
            }
        } else {
            this.internal.providerRetryCount = 0;
        }

        if (this.internal.updateQueryTimer) {
            if (delay === undefined && this.internal.updateQueryTimer.isRunning) {
                // already scheduled, so lets keep that one
                return;
            }
            this.internal.updateQueryTimer.stop();
            this.internal.updateQueryTimer = undefined;
        }

        if (!this.state.updatePossible || !this.state.activeOtaProviders.length) {
            return;
        }

        if (delay === undefined && this.state.updateState !== OtaSoftwareUpdateRequestor.UpdateState.Idle) {
            logger.info(
                `Cannot schedule update query, current state is ${OtaSoftwareUpdateRequestor.UpdateState[this.state.updateState]}`,
            );
            return;
        }

        if (delay === undefined) {
            delay = this.state.updateQueryInterval;
        }

        logger.info(`Scheduling OTA update query in ${delay} (reason "${ScheduleReason[reason]}")`);
        this.internal.updateQueryTimer = Time.getTimer(
            "OTA Request",
            delay,
            this.callback(this.#performUpdateQuery),
        ).start();
    }

    /** Choose the next OTA provider to use for an update */
    #chooseUpdateProvider(): ProviderLocation | undefined {
        // If we have a selected provider, use that one once
        if (this.internal.selectedProviderLocation !== undefined) {
            const selected = this.internal.selectedProviderLocation;
            logger.debug(`Choosing pre-selected provider`, Diagnostic.dict(selected));
            this.internal.selectedProviderLocation = undefined;
            return selected;
        }

        // We use the most recently seen active provider first, else we fall back to the default providers
        if (this.state.activeOtaProviders.length > 0) {
            const sorted = this.state.activeOtaProviders.sort(
                // Sort by oldest timestamp to try all over time
                (a, b) => (a.previousQueryTimestamp ?? 0) - (b.previousQueryTimestamp ?? 0),
            );
            const location = sorted[0].location;
            logger.debug(
                `Choosing active provider`,
                PeerAddress({ nodeId: location.providerNodeId, fabricIndex: location.fabricIndex }),
                `ep${location.endpoint}`,
            );
            return location;
        }

        return;
    }

    /** Helper to connect to an OTA provider, initialize an OTA Provider Cluster Client, and return this endpoint */
    async #connectOtaProviderFor(location: ProviderLocation) {
        const { providerNodeId, fabricIndex, endpoint } = location;

        const peerAddress = PeerAddress({ nodeId: providerNodeId, fabricIndex });

        logger.debug(`Establish connection for OTA to ${peerAddress}`);

        const node = await (Node.forEndpoint(this.endpoint) as ServerNode).peers.forAddress(peerAddress);
        const ep = node.endpoints.require(endpoint);
        ep.behaviors.require(OtaSoftwareUpdateProviderClient);

        return ep;
    }

    /** Perform an actual update query */
    async #performUpdateQuery() {
        const downloadLocation = this.downloadLocation;
        if (await downloadLocation.exists()) {
            let otaHeader: OtaImageHeader | undefined;
            try {
                otaHeader = await this.validateUpdateFile();
            } catch (error) {
                logger.error(`OTA update file is invalid:`, error);

                await downloadLocation.delete();
                otaHeader = undefined; // Should be the case anyway, but let's make sure
            }

            if (otaHeader !== undefined) {
                // We already have a file, and a version is newer than the current, apply it
                const { softwareVersion } = otaHeader;
                logger.info(`OTA update file is already downloaded and valid, applying version ${softwareVersion}.`);
                await this.#triggerApplyUpdate(softwareVersion, downloadLocation);
                return;
            }
        }

        // Reset progress and update state for querying
        this.state.updateStateProgress = null;

        const provider = this.#chooseUpdateProvider();
        if (provider === undefined) {
            logger.info("No OTA Provider configured, cannot query for updates.");
            this.internal.updateQueryTimer?.stop();
            this.internal.updateQueryTimer = undefined;
            return;
        }

        this.#updateState(
            OtaSoftwareUpdateRequestor.UpdateState.Querying,
            OtaSoftwareUpdateRequestor.ChangeReason.Success,
        );

        try {
            // Connect to the provider and query for updates
            await this.#queryOtaProvider(await this.#connectOtaProviderFor(provider), provider);
        } catch (error) {
            if (error instanceof RetransmissionLimitReachedError) {
                logger.debug(`Failed to connect to`, Diagnostic.dict(provider), error);
            } else {
                logger.warn(`OTA Provider communication failed to`, Diagnostic.dict(provider), error);
            }
            // Handle same as Update unavailable
            this.#markActiveOtaProviderNoUpdate(provider);
        }

        this.#resetStateToIdle();
    }

    /** Query the given OTA provider for an update and handle all non-UpdateAvailable results and error cases */
    async #updateAvailableFromProvider(
        query: OtaSoftwareUpdateProvider.QueryImageRequest,
        ep: Endpoint,
        providerLocation: ProviderLocation,
    ) {
        // Send the QueryImage command to the provider
        const queryResponse = await ep.commandsOf(OtaSoftwareUpdateProviderClient).queryImage(query);

        const {
            status,
            delayedActionTime = 0,
            imageUri,
            softwareVersion,
            softwareVersionString,
            updateToken,
            userConsentNeeded,
        } = queryResponse;

        switch (status) {
            case OtaSoftwareUpdateProvider.Status.Busy:
            case OtaSoftwareUpdateProvider.Status.NotAvailable:
                // If we already had 3 BUSY responses, we treat it as not available and try another provider
                if (
                    status === OtaSoftwareUpdateProvider.Status.Busy &&
                    this.internal.providerRetryCount <= MAX_BUSY_RETRIES
                ) {
                    // For Busy we schedule a new query after the defined time (or min 120s) for the same provider
                    // because the provider seems to be in progress to provide an update
                    this.#updateState(
                        OtaSoftwareUpdateRequestor.UpdateState.DelayedOnQuery,
                        OtaSoftwareUpdateRequestor.ChangeReason.DelayByProvider,
                    );
                    this.#scheduleUpdateQuery(
                        Seconds(Math.max(delayedActionTime, 120)),
                        ScheduleReason.Busy,
                        providerLocation,
                    );
                    return;
                }
                this.#markActiveOtaProviderNoUpdate(providerLocation);
                this.#resetStateToIdle();
                return;
            case OtaSoftwareUpdateProvider.Status.DownloadProtocolNotSupported:
                logger.info(
                    `Removing OTA Provider because no supported download protocol was accepted`,
                    Diagnostic.dict(providerLocation),
                );
                this.#removeOtaProvider(providerLocation); // No need to query this one again
                this.#resetStateToIdle();
                return;
        }

        if (
            imageUri === undefined ||
            softwareVersion === undefined ||
            softwareVersionString === undefined ||
            updateToken === undefined
        ) {
            logger.info(`Invalid OTA Provider response: mandatory fields missing. Ignoring update.`);
            this.#markActiveOtaProviderNoUpdate(providerLocation); // Use others next time
            this.#resetStateToIdle(OtaSoftwareUpdateRequestor.ChangeReason.Failure);
            return;
        }

        if (imageUri.startsWith("bdx://")) {
            const { providerNodeId } = providerLocation;
            const { sourceNodeId } = FileDesignator.fromBdxUri(imageUri);
            if (sourceNodeId !== providerNodeId) {
                logger.info(
                    `Invalid OTA Provider response: BDX URI source node ID ${NodeId.strOf(
                        sourceNodeId,
                    )} does not match provider node ID ${NodeId.strOf(providerNodeId)}. Ignoring update.`,
                );
                this.#markActiveOtaProviderNoUpdate(providerLocation); // Use others next time
                this.#resetStateToIdle(OtaSoftwareUpdateRequestor.ChangeReason.Failure);
                return;
            }
        }

        const { softwareVersion: currentSoftwareVersion } = query;
        if (softwareVersion <= currentSoftwareVersion) {
            logger.info(
                `Ignoring OTA Provider response: softwareVersion ${softwareVersion} not newer than current ${currentSoftwareVersion}`,
            );
            this.#markActiveOtaProviderNoUpdate(providerLocation);
            this.#resetStateToIdle();
            return;
        }

        if (userConsentNeeded) {
            if (!this.state.canConsent) {
                // Ignore update because we can not do a consent, should normally never happen
                logger.info(`OTA update requires user consent, but we cannot consent, ignoring update.`);
                this.#markActiveOtaProviderNoUpdate(providerLocation);
                this.#resetStateToIdle();
                return;
            }

            if (this.#basicInformationState().localConfigDisabled) {
                logger.info("OTA update requires user consent, but local config is disabled. Update cancelled.");
                this.#resetStateToIdle(OtaSoftwareUpdateRequestor.ChangeReason.Failure);
                return;
            }
        }

        return {
            imageUri,
            softwareVersion,
            softwareVersionString,
            updateToken,
            userConsentNeeded,
            delayedActionTime,
        };
    }

    /**
     * Sends the ApplyUpdate command to the provider and handles the result, including any delays or retries
     */
    async #validateApplyUpdate(
        applyRequest: OtaSoftwareUpdateProvider.ApplyUpdateRequest,
        ep: Endpoint,
        fileDesignator: PersistedFileDesignator,
    ): Promise<boolean> {
        this.state.updateStateProgress = null;
        this.#updateState(
            OtaSoftwareUpdateRequestor.UpdateState.Applying,
            OtaSoftwareUpdateRequestor.ChangeReason.Success,
            applyRequest.newVersion,
        );

        let action: OtaSoftwareUpdateProvider.ApplyUpdateAction;
        let applyDelayedActionTime: number;
        try {
            // Ask the provider if we are allowed to proceed with the update
            ({ action, delayedActionTime: applyDelayedActionTime } = await ep
                .commandsOf(OtaSoftwareUpdateProviderClient)
                .applyUpdateRequest(applyRequest));
        } catch (error) {
            logger.info(`OTA Provider applyUpdateRequest failed:`, error);
            this.#resetStateToIdle(OtaSoftwareUpdateRequestor.ChangeReason.Failure);
            return false;
        }

        if (action === OtaSoftwareUpdateProvider.ApplyUpdateAction.Discontinue) {
            // Provider told us to cancel the update progress
            try {
                await fileDesignator.delete();
            } catch (error) {
                logger.warn(`OTA update file delete failed:`, error);
            }
            this.#resetStateToIdle();
            return false;
        } else if (action === OtaSoftwareUpdateProvider.ApplyUpdateAction.AwaitNextAction) {
            // Provider told us to ask again later
            this.#updateState(
                OtaSoftwareUpdateRequestor.UpdateState.DelayedOnApply,
                OtaSoftwareUpdateRequestor.ChangeReason.DelayByProvider,
            );
            this.internal.updateDelayPromise = Time.sleep(
                "OTAUpdateApply-AwaitNextAction",
                Millis(Math.min(Math.max(Seconds(applyDelayedActionTime), Minutes(2)), Hours(24))),
            );
            await this.internal.updateDelayPromise;
            this.internal.updateDelayPromise = undefined;

            return await this.#validateApplyUpdate(applyRequest, ep, fileDesignator);
        } else if (action !== OtaSoftwareUpdateProvider.ApplyUpdateAction.Proceed) {
            logger.error(`Invalid OTA Provider applyUpdateRequest response: unknown Action ${action}`);
            this.#resetStateToIdle(OtaSoftwareUpdateRequestor.ChangeReason.Failure);
            return false;
        }

        // Ok we can continue, but after a slight delay
        if (applyDelayedActionTime > 0) {
            this.#updateState(
                OtaSoftwareUpdateRequestor.UpdateState.DelayedOnApply,
                OtaSoftwareUpdateRequestor.ChangeReason.DelayByProvider,
            );

            this.internal.updateDelayPromise = Time.sleep(
                "OTAUpdateApply-DelayedByProvider",
                Millis(Math.min(Seconds(applyDelayedActionTime), Hours(24))),
            );
            await this.internal.updateDelayPromise;
            this.internal.updateDelayPromise = undefined;
        }

        return true;
    }

    /** Query the given OTA provider for an update and handle the result */
    async #queryOtaProvider(ep: Endpoint, providerLocation: ProviderLocation): Promise<void> {
        const { vendorId, productId, softwareVersion, hardwareVersion, location, localConfigDisabled } =
            this.#basicInformationState();

        // Sends the queryImage command to a provider to get information on available updates and validates response
        const updateDetails = await this.#updateAvailableFromProvider(
            {
                vendorId,
                productId,
                softwareVersion,
                protocolsSupported: this.state.transferProtocolsSupported,
                hardwareVersion,
                location,
                requestorCanConsent: this.state.canConsent && !localConfigDisabled ? true : undefined,
            },
            ep,
            providerLocation,
        );
        if (updateDetails === undefined) {
            // No update available
            return;
        }

        const {
            imageUri,
            softwareVersion: newSoftwareVersion,
            softwareVersionString: newSoftwareVersionString,
            updateToken,
            userConsentNeeded,
            delayedActionTime,
        } = updateDetails;

        const now = Time.nowMs;

        // Are we responsible to get User consent for the update? (mainly because we told the UpdateProvider that we
        // can request consent from the user ourselves
        if (userConsentNeeded) {
            this.#updateState(
                OtaSoftwareUpdateRequestor.UpdateState.DelayedOnUserConsent,
                OtaSoftwareUpdateRequestor.ChangeReason.Success,
            );

            try {
                if (!(await this.requestUserConsent(newSoftwareVersion, newSoftwareVersionString))) {
                    // Consent denied
                    this.#markActiveOtaProviderNoUpdate(providerLocation);
                    this.#resetStateToIdle();
                    return;
                }
            } catch (error) {
                logger.warn(`Failed to request user consent:`, error);
                this.#markActiveOtaProviderNoUpdate(providerLocation);
                this.#resetStateToIdle(OtaSoftwareUpdateRequestor.ChangeReason.Failure);
            }
        }

        // The update provider requested a delay before continuing
        if (delayedActionTime > 0) {
            const delayS = now - Time.nowMs + Seconds(delayedActionTime);
            // Check how long we still need to wait; maybe consent took longer than the requested delay
            if (delayS > 0) {
                this.#updateState(
                    OtaSoftwareUpdateRequestor.UpdateState.DelayedOnQuery,
                    OtaSoftwareUpdateRequestor.ChangeReason.DelayByProvider,
                );
                logger.info(`Waiting for ${delayS}s before applying update`);
                this.internal.updateDelayPromise = Time.sleep(
                    "OTAUpdateQuery-DelayedByProvider",
                    Millis(Math.min(delayS, Hours(24))),
                );
                await this.internal.updateDelayPromise;
                this.internal.updateDelayPromise = undefined;
            }
        }

        // Download the File, also checks if we already have it
        let fileDesignator: PersistedFileDesignator;
        try {
            fileDesignator = await this.#handleDownload(ep, imageUri, newSoftwareVersion);
        } catch (error) {
            MatterError.accept(error);
            logger.info(`OTA download failed:`, error);
            if (error instanceof OtaDownloadError) {
                this.#emitDownloadErrorEvent(newSoftwareVersion, error.bytesTransferred, error.code);
            }
            this.#resetStateToIdle(OtaSoftwareUpdateRequestor.ChangeReason.Failure);
            try {
                await this.downloadLocation.delete();
            } catch (error) {
                MatterError.accept(error);
                logger.warn(`OTA download failed and deleting partial file also failed:`, error);
            }
            return;
        }

        // Inform the provider that we are ready to apply the update
        if (
            !(await this.#validateApplyUpdate(
                {
                    updateToken,
                    newVersion: newSoftwareVersion,
                },
                ep,
                fileDesignator,
            ))
        ) {
            // Not allowed to proceed with the update, so stop here
            return;
        }

        await this.#triggerApplyUpdate(newSoftwareVersion, fileDesignator, providerLocation, updateToken);
    }

    async #handleBdxDownload(endpoint: Endpoint, fileDesignator: FileDesignator) {
        const node = Node.forEndpoint(endpoint) as ClientNode;
        let downloadTryCount = 0;
        while (true) {
            this.state.updateStateProgress = 0;

            // We try up to 3 times to download the file
            try {
                const { context, slot } = await (node.interaction as ClientNodeInteraction).initBdx();
                const { messenger } = context;

                // Set up the OTA client, timeouts are already BDX defaults
                const bdx = BdxClient.asReceiver(messenger, {
                    transferFileDesignator: fileDesignator, // We need to use the original designator here for transfer
                    fileDesignator: this.downloadLocation, // But we store in a different location
                    preferredDriverModes: [Flow.DriverMode.ReceiverDrive],
                    maxBlockSize:
                        messenger.channel.type === "tcp" ? OTA_BDX_MAX_BLOCK_SIZE_TCP : OTA_BDX_MAX_BLOCK_SIZE_NON_TCP,
                });

                // We report progress 0..99%, 100% we only report when finished
                bdx.progressInfo.on(this.callback(this.#updateProgress, { lock: true }));
                bdx.progressFinished.on(bytesTransferred =>
                    logger.info(`OTA download finished after ${bytesTransferred} bytes`),
                );

                // Wait for BDX transfer to complete
                await bdx.processTransfer();

                slot?.close();
                await context[Symbol.asyncDispose]();
                break;
            } catch (error) {
                logger.info(`OTA BDX download attempt ${downloadTryCount + 1} failed:`, error);
                if (++downloadTryCount >= 3) {
                    const code = error instanceof BdxError ? error.code : undefined;
                    const bdxError = new OtaDownloadError(
                        code ?? OtaSoftwareUpdateRequestor.UpdateState.Unknown,
                        `OTA BDX download failed after ${downloadTryCount} attempts: ${
                            error instanceof Error ? error.message : "Unknown error"
                        }`,
                    );
                    bdxError.cause = error;
                    throw bdxError;
                }
            }
        }
    }

    async #handleHttpsDownload(uri: string) {
        const res = await fetch(uri);
        if (!res.ok || res.body === null) {
            throw new OtaDownloadError(res.status, `HTTP Download error: ${res.statusText}`);
        }
        const fetchStream = res.body;
        const contentLength = res.headers.get("content-length");
        let totalBytes = contentLength ? parseInt(contentLength) : undefined;
        if (totalBytes === undefined || !Number.isFinite(totalBytes) || totalBytes <= 0) {
            totalBytes = undefined;
        }

        this.state.updateStateProgress = 0;

        let bytesReceived = 0;
        try {
            const progressStream = new ReadableStream<Bytes>({
                start: controller => {
                    const reader = fetchStream.getReader();

                    const read = () => {
                        reader
                            .read()
                            .then(({ done, value }) => {
                                if (done) {
                                    controller.close();
                                    return;
                                }
                                bytesReceived += value?.length ?? 0;
                                this.#updateProgress(bytesReceived, totalBytes);
                                controller.enqueue(value);
                                read();
                            })
                            .catch(error => {
                                controller.error(error);
                            });
                    };
                    read();
                },
            });

            await this.downloadLocation.writeFromStream(progressStream);

            logger.info(`OTA download finished after ${bytesReceived} bytes`);
        } catch (error) {
            const httpError = new OtaDownloadError(
                res.status,
                error instanceof Error ? error.message : "Unknown error",
            );
            httpError.cause = error;
            httpError.bytesTransferred = bytesReceived;
            httpError.totalBytesLength = totalBytes;
            throw httpError;
        }
    }

    #updateProgress(bytesDownloaded: number, totalBytes?: number) {
        if (totalBytes !== undefined) {
            this.state.updateStateProgress = Math.floor((bytesDownloaded / totalBytes) * 99);
        } else {
            this.state.updateStateProgress = Math.floor(99 * (1 - Math.exp(-bytesDownloaded / 1_000_000))); // Approximation to show progress
        }
    }

    async #handleDownload(
        endpoint: Endpoint,
        uri: string,
        newSoftwareVersion: number,
    ): Promise<PersistedFileDesignator> {
        if (uri.startsWith("bdx://")) {
            if (
                !this.state.transferProtocolsSupported.includes(
                    OtaSoftwareUpdateProvider.DownloadProtocol.BdxSynchronous,
                )
            ) {
                throw new InternalError("BDX Synchronous not supported"); // Should never happen
            }

            this.#updateState(
                OtaSoftwareUpdateRequestor.UpdateState.Downloading,
                OtaSoftwareUpdateRequestor.ChangeReason.Success,
                newSoftwareVersion,
            );

            const { fileDesignator: transferFd } = FileDesignator.fromBdxUri(uri);
            await this.#handleBdxDownload(endpoint, transferFd);
        } else if (uri.startsWith("https://")) {
            if (!this.state.transferProtocolsSupported.includes(OtaSoftwareUpdateProvider.DownloadProtocol.Https)) {
                throw new ImplementationError("HTTPS not supported");
            }
            this.#updateState(
                OtaSoftwareUpdateRequestor.UpdateState.Downloading,
                OtaSoftwareUpdateRequestor.ChangeReason.Success,
                newSoftwareVersion,
            );

            await this.#handleHttpsDownload(uri);
        } else {
            throw new InternalError(`Unsupported download URI: ${uri}`);
        }

        await this.validateUpdateFile(newSoftwareVersion);

        // Done and also verified, we are done
        this.state.updateStateProgress = 100;

        return this.downloadLocation;
    }

    /**
     * Validate the update file
     * The default implementation does basic validations based on the matter OTA file format and expected software
     * version.
     * The method SHALL be overridden to add additional checks like validating the signature of the file.
     * throws an error if the file is invalid
     */
    protected async validateUpdateFile(newSoftwareVersion?: number) {
        let totalSize: number | undefined;
        try {
            const blob = await this.downloadLocation.openBlob();
            totalSize = blob.size;

            const crypto = this.env.get(Crypto);
            const header = await OtaImageReader.file(blob.stream().getReader(), crypto);
            const { softwareVersion: otaFileSoftwareVersion } = header;

            if (newSoftwareVersion === undefined) {
                const { softwareVersion: currentSoftwareVersion } = this.#basicInformationState();
                if (otaFileSoftwareVersion <= currentSoftwareVersion) {
                    throw new OtaImageError(
                        `OTA file software version ${otaFileSoftwareVersion} not newer than current ${currentSoftwareVersion}`,
                    );
                }
            } else if (otaFileSoftwareVersion !== newSoftwareVersion) {
                throw new OtaImageError(
                    `OTA file software version ${otaFileSoftwareVersion} does not match expected ${newSoftwareVersion}`,
                );
            }
            return header;
        } catch (error) {
            const otaDownloadError = new OtaDownloadError(
                OtaSoftwareUpdateRequestor.UpdateState.Unknown,
                `Downloaded OTA file is invalid: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
            otaDownloadError.cause = error;
            if (totalSize !== undefined) {
                otaDownloadError.bytesTransferred = totalSize;
            }
            throw otaDownloadError;
        }
    }

    /**
     * Update the state and emit the stateTransition event if the state changed.
     * If the new state is Idle the next update query is scheduled.
     */
    #updateState(
        newState: OtaSoftwareUpdateRequestor.UpdateState,
        reason: OtaSoftwareUpdateRequestor.ChangeReason,
        targetSoftwareVersion?: number,
    ) {
        const previousState = this.state.updateState;
        if (
            newState !== OtaSoftwareUpdateRequestor.UpdateState.Downloading &&
            newState !== OtaSoftwareUpdateRequestor.UpdateState.Applying &&
            newState !== OtaSoftwareUpdateRequestor.UpdateState.RollingBack
        ) {
            // targetSoftwareVersion shall only be sent in these states
            targetSoftwareVersion = undefined;
        } else if (targetSoftwareVersion === undefined) {
            throw new InternalError("targetSoftwareVersion must be provided for state " + newState);
        }
        if (newState !== previousState) {
            this.events.stateTransition.emit(
                {
                    previousState,
                    newState,
                    reason,
                    targetSoftwareVersion: targetSoftwareVersion ?? null,
                },
                this.context,
            );
            this.state.updateState = newState;
        }

        if (
            newState === OtaSoftwareUpdateRequestor.UpdateState.Idle ||
            newState === OtaSoftwareUpdateRequestor.UpdateState.Unknown
        ) {
            // We schedule the next update query
            this.#scheduleUpdateQuery();
            this.state.updateStateProgress = null;
        } else if (this.state.updateStateProgress !== null) {
            // We reset the state progress to 0 if it was not null before
            this.state.updateStateProgress = 0;
        }
    }

    #resetStateToIdle(reason = OtaSoftwareUpdateRequestor.ChangeReason.Success) {
        this.#updateState(OtaSoftwareUpdateRequestor.UpdateState.Idle, reason);
    }

    #emitVersionAppliedEvent(productId: number, softwareVersion: number) {
        this.events.versionApplied.emit({ softwareVersion, productId }, this.context);
    }

    #basicInformationState() {
        const rootEndpoint = Node.forEndpoint(this.endpoint) as ServerNode;
        if (!rootEndpoint.behaviors.has(BasicInformationBehavior)) {
            throw new InternalError("BasicInformationBehavior missing"); // Should never happen
        }
        return rootEndpoint.stateOf(BasicInformationBehavior);
    }

    #emitDownloadErrorEvent(softwareVersion: number, bytesDownloaded: number, platformCode?: number) {
        this.events.downloadError.emit(
            {
                softwareVersion,
                bytesDownloaded,
                progressPercent: this.state.updateStateProgress,
                platformCode: platformCode ?? null,
            },
            this.context,
        );
    }

    #triggerApplyUpdate(
        newSoftwareVersion: number,
        fileDesignator: PersistedFileDesignator,
        location?: ProviderLocation,
        updateToken?: Bytes,
    ) {
        this.state.updateInProgressDetails = {
            newSoftwareVersion,
            location,
            updateToken,
        };

        this.#updateState(
            OtaSoftwareUpdateRequestor.UpdateState.Applying,
            OtaSoftwareUpdateRequestor.ChangeReason.Success,
            newSoftwareVersion,
        );

        return this.applyUpdate(newSoftwareVersion, fileDesignator);
    }

    protected applyUpdate(_newSoftwareVersion: number, _fileDesignator: PersistedFileDesignator): MaybePromise<void> {
        throw new ImplementationError("To apply the update the applyUpdate() method must be implemented.");
    }

    protected requestUserConsent(
        _newSoftwareVersion: number,
        _newSoftwareVersionString: string,
    ): MaybePromise<boolean> {
        throw new ImplementationError(
            "Seems 'canConsent' is set, but requestUserConsent() not implemented. Declining update",
        );
    }

    override async [Symbol.asyncDispose]() {
        this.internal.updateQueryTimer?.stop();
        this.internal.updateDelayPromise?.cancel(new MatterError("Update Requestion cluster shuts down"));
        await super[Symbol.asyncDispose]?.();
    }
}

export namespace OtaSoftwareUpdateRequestorServer {
    export class State extends OtaSoftwareUpdateRequestorBehavior.State {
        /**
         * The list of OTA providers that were recently active (by announcement or by being used).
         * The error counter is increased when a provider could not be reached or returned an unexpected error.
         * After 3 errors the provider is removed from this list and also from the defaultProviders list.
         * This value is persisted.
         */
        activeOtaProviders: ActiveProviderLocation[] = [];

        /**
         * Details of an upgrade in progress that is checked on restart if the upgrade was successful.
         * This value is persisted.
         */
        updateInProgressDetails: UpdateInProgressDetails | null = null;

        /** How often to query for updates. Default is 24 hours ("daily") as proposed by spec. */
        updateQueryInterval = Hours(24);

        /**
         * The transfer protocols supported by this requestor. Default is BDX Synchronous.
         * If it was verified that the node really have access to the public internet, HTTPS can be added as protocol
         * as well.
         */
        transferProtocolsSupported = [OtaSoftwareUpdateProvider.DownloadProtocol.BdxSynchronous];

        /**
         * If true the requestor is able to get user consent for an update. This requires the implementation of the
         * requestUserConsent() extension interface method.
         * If false the OTA provider will only provide updates that do not require user consent or where user consent
         * was already given.
         * Default is false.
         */
        canConsent = false;

        /**
         * Optional custom persisted location as PersistedFileDescriptor to store the downloaded update files.
         * If not provided, the default storage context for "bdx" of the node is used with a filename like
         * "ota-{vendorId}-{productId}.update".
         * This can be used to store the files in a different persistent storage if needed.
         */
        downloadLocation?: PersistedFileDesignator;
    }

    export class Events extends OtaSoftwareUpdateRequestorBehavior.Events {
        /** Emitted when a new software update file was downloaded and should now be applied. */
        updateReadyToApply = AsyncObservable();
    }

    export class Internal {
        /** Timer for the next update query */
        updateQueryTimer: Timer | undefined;

        /**
         * The preferred provider to use for the next update query.
         * Mainly used for the Busy case to reuse the same provider for the next try.
         */
        selectedProviderLocation?: ProviderLocation;

        /** How often we already retried to connect to the current provider */
        providerRetryCount = 0;

        /**
         * Stores the time of a current update delay to allow cancelling it
         */
        updateDelayPromise: CancelablePromise | undefined;

        /**
         * Persisted location as PersistedFileDescriptor to store the downloaded update files.
         * It is initialized from the state or with an internal default on startup.
         */
        downloadLocation!: PersistedFileDesignator;
    }

    export declare const ExtensionInterface: {
        requestUserConsent(newSoftwareVersion: number, newSoftwareVersionString: string): MaybePromise<boolean>;
        applyUpdate(newSoftwareVersion: number, fileDesignator: PersistedFileDesignator): MaybePromise<void>;
        validateUpdateFile(newSoftwareVersion?: number): MaybePromise<OtaImageHeader>;
    };
}
