/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NodeActivity } from "#behavior/context/NodeActivity.js";
import { RemoteActorContext } from "#behavior/context/server/RemoteActorContext.js";
import {
    Duration,
    Hours,
    Logger,
    MatterError,
    Millis,
    Minutes,
    NetworkError,
    NoResponseTimeoutError,
    ObserverGroup,
    Seconds,
    Time,
    Timer,
    Timestamp,
} from "#general";
import { Specification } from "#model";
import type { ServerNode } from "#node/ServerNode.js";
import type { DirtyState, Message, MessageExchange, NodeSession } from "#protocol";
import {
    AttributeReadResponse,
    AttributeSubscriptionResponse,
    EventReadResponse,
    InteractionServerMessenger,
    NoChannelError,
    NumberedOccurrence,
    PeerAddress,
    Read,
    ReadResult,
    Subscription,
    SubscriptionCriteria,
} from "#protocol";
import {
    AttributeId,
    ClusterId,
    EndpointNumber,
    EventNumber,
    INTERACTION_PROTOCOL_ID,
    StatusCode,
    StatusResponseError,
} from "#types";

const logger = Logger.get("ServerSubscription");

// We use 3 minutes as global max interval because with 60 min as defined by spec the timeframe until the controller
// establishes a new subscription after e.g a reboot can be up to 60 min and the controller would assume that the value
// is unchanged. This is too long.
//
// chip-tool is not using the option to choose an appropriate interval and respect the 60 min for that and only uses the
// max sent by the controller which can lead to spamming the network with unneeded packages. So I decided for 3 minutes
// for now as a compromise until we have something better. This value is fine for non-battery devices and might be
// overridden for otherwise.
//
// To officially match the specs the developer needs to set these 60Minutes in the Subscription options!
export const MAX_INTERVAL_PUBLISHER_LIMIT = Hours.one;
export const INTERNAL_INTERVAL_PUBLISHER_LIMIT = Minutes(3);
export const MIN_INTERVAL = Seconds(2);
export const DEFAULT_RANDOMIZATION_WINDOW = Seconds(10);

/**
 * Server options that control subscription handling.
 */
export interface ServerSubscriptionConfig {
    /**
     * Optional maximum subscription interval to use for sending subscription reports. It will be used if not too
     * low and inside the range requested by the connected controller.
     */
    maxInterval: Duration;

    /**
     * Optional minimum subscription interval to use for sending subscription reports. It will be used when other
     * calculated values are smaller than it. Use this to make sure your device hardware can handle the load and to
     * set limits.
     */
    minInterval: Duration;

    /**
     * Optional subscription randomization window to use for sending subscription reports. This specifies a window
     * in seconds from which a random part is added to the calculated maximum interval to make sure that devices
     * that get powered on in parallel not all send at the same timepoint.
     */
    randomizationWindow: Duration;
}

export namespace ServerSubscriptionConfig {
    /**
     * Validate options and set defaults.
     *
     * @returns the resulting options
     */
    export function of(options?: Partial<ServerSubscriptionConfig>) {
        return {
            maxInterval: options?.maxInterval ?? INTERNAL_INTERVAL_PUBLISHER_LIMIT,
            minInterval: Duration.max(options?.minInterval ?? MIN_INTERVAL, MIN_INTERVAL),
            randomizationWindow: options?.randomizationWindow ?? DEFAULT_RANDOMIZATION_WINDOW,
        };
    }
}

/**
 * Interface between {@link ServerSubscription} and the local Matter environment.
 */
export interface ServerSubscriptionContext {
    session: NodeSession;
    node: ServerNode;
    initiateExchange(address: PeerAddress, protocolId: number): MessageExchange;
}

/**
 * Implements the server side of a single subscription.
 */
export class ServerSubscription extends Subscription {
    readonly #context: ServerSubscriptionContext;

    #lastUpdateTime = Timestamp.zero;
    #updateTimer: Timer;
    readonly #sendDelayTimer: Timer = Time.getTimer(`Subscription ${this.id} delay`, Millis(50), () =>
        this.#triggerSendUpdate(),
    );
    #outstandingAttributeUpdates?: DirtyState.ForNode;
    #outstandingEventsMinNumber?: EventNumber;
    readonly #changeHandlers = new ObserverGroup();

    #sendUpdatesActivated = false;
    #seededClusterDetails? = new Map<string, number>();
    #latestSeededEventNumber? = EventNumber(0);
    readonly #sendInterval: Duration;
    readonly #minIntervalFloor: Duration;
    readonly #maxIntervalCeiling: Duration;
    readonly #peerAddress: PeerAddress;

    #sendNextUpdateImmediately = false;
    #sendUpdateErrorCounter = 0;
    #currentUpdatePromise?: Promise<void>;

    constructor(options: {
        id: number;
        context: ServerSubscriptionContext;
        criteria: SubscriptionCriteria;
        minIntervalFloor: Duration;
        maxIntervalCeiling: Duration;
        subscriptionOptions: ServerSubscriptionConfig;
        useAsMaxInterval?: Duration;
        useAsSendInterval?: Duration;
    }) {
        const {
            id,
            context,
            criteria,
            minIntervalFloor,
            maxIntervalCeiling,
            subscriptionOptions,
            useAsMaxInterval,
            useAsSendInterval,
        } = options;

        super(context.session, id, criteria);
        this.#context = context;

        this.#peerAddress = this.session.peerAddress;
        this.#minIntervalFloor = minIntervalFloor;
        this.#maxIntervalCeiling = maxIntervalCeiling;

        let maxInterval: Duration;
        let sendInterval: Duration;
        if (useAsMaxInterval !== undefined && useAsSendInterval !== undefined) {
            maxInterval = useAsMaxInterval;
            sendInterval = useAsSendInterval;
        } else {
            ({ maxInterval, sendInterval } = this.#determineSendingIntervals(
                subscriptionOptions.minInterval,
                subscriptionOptions.maxInterval,
                subscriptionOptions.randomizationWindow,
            ));
        }
        this.maxInterval = maxInterval;
        this.#sendInterval = sendInterval;

        this.#updateTimer = Time.getTimer(`Subscription ${this.id} update`, this.#sendInterval, () =>
            this.#prepareDataUpdate(),
        ); // will be started later
    }

    #determineSendingIntervals(
        subscriptionMinInterval: Duration,
        subscriptionMaxInterval: Duration,
        subscriptionRandomizationWindow: Duration,
    ): { maxInterval: Duration; sendInterval: Duration } {
        // Max Interval is the Max interval that the controller request, unless the configured one from the developer
        // is lower. In that case we use the configured one. But we make sure to not be smaller than the requested
        // controller minimum. But in general never faster than minimum interval configured or 2 seconds
        // (SUBSCRIPTION_MIN_INTERVAL_S). Additionally, we add a randomization window to the max interval to avoid all
        // devices sending at the same time. But we make sure not to exceed the global max interval.
        const maxInterval = Duration.min(
            Millis.floor(
                Millis(
                    Duration.max(
                        subscriptionMinInterval,
                        Duration.max(
                            this.#minIntervalFloor,
                            Duration.min(subscriptionMaxInterval, this.#maxIntervalCeiling),
                        ),
                    ) +
                        subscriptionRandomizationWindow * Math.random(),
                ),
            ),
            MAX_INTERVAL_PUBLISHER_LIMIT,
        );
        let sendInterval = Millis.floor(Millis(maxInterval / 2)); // Ideally we send at half the max interval
        if (sendInterval < Minutes.one) {
            // But if we have no chance of at least one full resubmission process we do like chip-tool.
            // One full resubmission process takes 33-45 seconds. So 60s means we reach at least first 2 retries of a
            // second subscription report after first failed.
            sendInterval = Duration.max(this.#minIntervalFloor, Millis.floor(Millis(maxInterval * 0.8)));
        }
        if (sendInterval < subscriptionMinInterval) {
            // But not faster than once every 2s
            logger.warn(
                `Determined subscription send interval of ${Duration.format(sendInterval)} is too low. Using maxInterval (${maxInterval}) instead.`,
            );
            sendInterval = subscriptionMinInterval;
        }
        return { maxInterval, sendInterval };
    }

    #addOutstandingAttributes(endpointId: EndpointNumber, clusterId: ClusterId, changedAttrs: AttributeId[]) {
        if (!changedAttrs.length) {
            return;
        }
        this.#outstandingAttributeUpdates = this.#outstandingAttributeUpdates ?? {};
        this.#outstandingAttributeUpdates[endpointId] = this.#outstandingAttributeUpdates[endpointId] ?? {};
        this.#outstandingAttributeUpdates[endpointId][clusterId] =
            this.#outstandingAttributeUpdates[endpointId][clusterId] ?? new Set();
        for (const attributeId of changedAttrs) {
            this.#outstandingAttributeUpdates[endpointId][clusterId].add(attributeId);
        }
    }

    #handleClusterStateChanges(
        endpointId: EndpointNumber,
        clusterId: ClusterId,
        changedAttrs: AttributeId[],
        version: number,
    ) {
        if (this.isClosed || !changedAttrs.length) {
            return;
        }

        // Change received while we are seeding this subscription
        if (this.#seededClusterDetails !== undefined) {
            const seededVersion = this.#seededClusterDetails.get(`${endpointId}-${clusterId}`);
            if (seededVersion === undefined || seededVersion === version) {
                // We do not seed this cluster, or we seeded with the same version, so no change or yet to come in seed
                return;
            }
        }

        this.#addOutstandingAttributes(endpointId, clusterId, changedAttrs);

        this.#prepareDataUpdate();
    }

    #handleAddedEvents(occurrence: NumberedOccurrence) {
        if (this.isClosed) {
            return;
        }

        // Remember the minimum event number to send. If an event is received during the seeding process, we store the
        // highest number - this is corrected after seeding.
        if (this.#outstandingEventsMinNumber === undefined || this.#latestSeededEventNumber !== undefined) {
            this.#outstandingEventsMinNumber = occurrence.number;
        }

        if (this.#sendEventUrgently(occurrence)) {
            this.#prepareDataUpdate();
        }
    }

    #sendEventUrgently({ endpointId, clusterId, eventId }: ReadResult.ConcreteEventPath): boolean {
        return (this.criteria.eventRequests ?? []).some(
            ({ endpointId: reqEndpointId, clusterId: reqClusterId, eventId: reqEventId, isUrgent }) =>
                isUrgent &&
                (reqEndpointId === undefined || reqEndpointId === endpointId) &&
                (reqClusterId === undefined || reqClusterId === clusterId) &&
                (reqEventId === undefined || reqEventId === eventId),
        );
    }

    get sendInterval() {
        return this.#sendInterval;
    }

    get minIntervalFloor() {
        return this.#minIntervalFloor;
    }

    get maxIntervalCeiling() {
        return this.#maxIntervalCeiling;
    }

    override activate() {
        super.activate();

        // We do not need these data anymore, so we can free some memory
        if (this.criteria.eventFilters !== undefined) this.criteria.eventFilters.length = 0;
        if (this.criteria.dataVersionFilters !== undefined) this.criteria.dataVersionFilters.length = 0;

        this.#sendUpdatesActivated = true;

        if (this.#outstandingEventsMinNumber !== undefined && this.#latestSeededEventNumber !== undefined) {
            if (this.#latestSeededEventNumber < this.#outstandingEventsMinNumber) {
                this.#outstandingEventsMinNumber = EventNumber(BigInt(this.#latestSeededEventNumber) + BigInt(1));
            } else {
                this.#outstandingEventsMinNumber = undefined; // We already sent out the latest event number
            }
        }
        // Clear temporary data from seeding
        this.#latestSeededEventNumber = undefined;
        this.#seededClusterDetails = undefined;

        if (this.#outstandingAttributeUpdates !== undefined || this.#outstandingEventsMinNumber !== undefined) {
            this.#triggerSendUpdate();
        }
        this.#updateTimer = Time.getTimer("Subscription update", this.#sendInterval, () =>
            this.#prepareDataUpdate(),
        ).start();
    }

    /**
     * Check if data should be sent straight away or delayed because the minimum interval is not reached. Delay real
     * sending by 50ms in any case to make sure to catch all updates.
     */
    #prepareDataUpdate() {
        if (this.#sendDelayTimer.isRunning || this.isClosed) {
            // sending data is already scheduled, data updates go in there ... or we close down already
            return;
        }

        if (!this.#sendUpdatesActivated) {
            return;
        }

        this.#updateTimer.stop();
        const now = Time.nowMs;
        const timeSinceLastUpdate = Millis(now - this.#lastUpdateTime);
        if (timeSinceLastUpdate < this.#minIntervalFloor) {
            // Respect minimum delay time between updates
            this.#updateTimer = Time.getTimer(
                "Subscription update",
                Millis(this.#minIntervalFloor - timeSinceLastUpdate),
                () => this.#prepareDataUpdate(),
            ).start();
            return;
        }

        this.#sendDelayTimer.start();
        this.#updateTimer = Time.getTimer(`Subscription update ${this.id}`, this.#sendInterval, () =>
            this.#prepareDataUpdate(),
        ).start();
    }

    #triggerSendUpdate(onlyWithData: boolean = false) {
        if (this.#currentUpdatePromise !== undefined) {
            logger.debug("Sending update already in progress, delaying update ...");
            this.#sendNextUpdateImmediately = true;
            return;
        }
        this.#currentUpdatePromise = this.#sendUpdate(onlyWithData)
            .catch(error => logger.warn("Sending subscription update failed:", error))
            .finally(() => (this.#currentUpdatePromise = undefined));
    }

    /**
     * Determine all attributes that have changed since the last update and send them out to the subscriber.
     * Important: This method MUST NOT be called directly. Use triggerSendUpdate() instead!
     */
    async #sendUpdate(onlyWithData = false) {
        // Get all outstanding updates, make sure the order is correct per endpoint and cluster
        const attributeFilter = this.#outstandingAttributeUpdates;
        this.#outstandingAttributeUpdates = undefined;

        const eventsMinNumber = this.#outstandingEventsMinNumber;
        this.#outstandingEventsMinNumber = undefined;

        if (onlyWithData && attributeFilter === undefined && eventsMinNumber === undefined) {
            return;
        }

        this.#lastUpdateTime = Time.nowMs;

        try {
            if (await this.#sendUpdateMessage(attributeFilter, eventsMinNumber, onlyWithData)) {
                this.#sendUpdateErrorCounter = 0;
            }
        } catch (error) {
            if (this.isClosed) {
                // No need to care about resubmissions when the server is closing
                return;
            }

            this.#sendUpdateErrorCounter++;
            logger.info(
                `Error sending subscription update message (error count=${this.#sendUpdateErrorCounter}):`,
                (error instanceof MatterError && error.message) || error,
            );
            if (this.#sendUpdateErrorCounter <= 2) {
                // fill the data back in the queue to resend with next try
                if (attributeFilter !== undefined) {
                    for (const [endpointId, clusters] of Object.entries(attributeFilter)) {
                        for (const [clusterId, attributes] of Object.entries(clusters)) {
                            this.#addOutstandingAttributes(
                                EndpointNumber(parseInt(endpointId)),
                                ClusterId(parseInt(clusterId)),
                                Array.from(attributes),
                            );
                        }
                    }
                }
                if (eventsMinNumber !== undefined) {
                    this.#outstandingEventsMinNumber = eventsMinNumber; // newer number are always higher, so we can just set it
                }
            } else {
                logger.info(
                    `Sending update failed 3 times in a row, canceling subscription ${this.id} and let controller subscribe again.`,
                );
                this.#sendNextUpdateImmediately = false;
                if (
                    error instanceof NoResponseTimeoutError ||
                    error instanceof NetworkError ||
                    error instanceof NoChannelError
                ) {
                    // Let's consider this subscription as dead and wait for a reconnect
                    this.isCanceledByPeer = true; // We handle this case like  if the controller canceled the subscription
                    await this.destroy();
                    return;
                } else {
                    throw error;
                }
            }
        }

        if (this.#sendNextUpdateImmediately) {
            logger.debug("Sending delayed update immediately after last one was sent.");
            this.#sendNextUpdateImmediately = false;
            await this.#sendUpdate(true); // Send but only if non-empty
        }
    }

    /**
     * Returns an iterator that yields the data reports and events data for the given read request.
     */
    async *#processAttributesAndEventsReport(context: RemoteActorContext.Options, suppressStatusReports = false) {
        const request = {
            ...this.criteria,
            interactionModelRevision: Specification.INTERACTION_MODEL_REVISION, // irrelevant here, set to our version
        };

        const delayedStatusReports = new Array<ReadResult.Report>();
        let hasValuesInResponse = false;
        let validAttributes = 0;
        let validEvents = 0;

        const session = RemoteActorContext(context).beginReadOnly();

        try {
            if (Read.containsAttribute(request)) {
                const attributeReader = new AttributeReadResponse(this.#context.node.protocol, session);
                for (const chunk of attributeReader.process(request)) {
                    for (const report of chunk) {
                        if (report.kind === "attr-status") {
                            if (suppressStatusReports) {
                                continue;
                            }
                            if (!hasValuesInResponse) {
                                // We need to delay all status reports until we know if we have a valid response
                                delayedStatusReports.push(report);
                                continue;
                            }
                        } else if (!hasValuesInResponse && report.kind === "attr-value") {
                            // First value response, so send out all delayed status reports first
                            for (const delayedReport of delayedStatusReports) {
                                yield InteractionServerMessenger.convertServerInteractionReport(delayedReport);
                            }
                            delayedStatusReports.length = 0;
                            hasValuesInResponse = true;
                        }
                        if (this.#seededClusterDetails !== undefined && report.kind === "attr-value") {
                            const {
                                path: { endpointId, clusterId },
                                version,
                            } = report;
                            this.#seededClusterDetails.set(`${endpointId}-${clusterId}`, version);
                        }
                        yield InteractionServerMessenger.convertServerInteractionReport(report);
                    }
                }
                validAttributes = attributeReader.counts.existent;
            }

            if (Read.containsEvent(request)) {
                const eventReader = new EventReadResponse(this.#context.node.protocol, session);
                for await (const chunk of eventReader.process(request)) {
                    for (const report of chunk) {
                        if (report.kind === "event-status") {
                            if (suppressStatusReports) {
                                continue;
                            }
                            if (!hasValuesInResponse) {
                                // We need to delay all status reports until we know if we have a valid response
                                delayedStatusReports.push(report);
                                continue;
                            }
                        } else if (!hasValuesInResponse && report.kind === "event-value") {
                            // First value response, so send out all delayed status reports first
                            for (const delayedReport of delayedStatusReports) {
                                yield InteractionServerMessenger.convertServerInteractionReport(delayedReport);
                            }
                            delayedStatusReports.length = 0;
                            hasValuesInResponse = true;
                        }
                        if (this.#latestSeededEventNumber !== undefined && report.kind === "event-value") {
                            this.#latestSeededEventNumber = report.number;
                        }
                        yield InteractionServerMessenger.convertServerInteractionReport(report);
                    }
                }
                validEvents = eventReader.counts.existent;
            }

            if (validAttributes === 0 && validEvents === 0) {
                throw new StatusResponseError(
                    "Subscription failed because no attributes or events are matching the query",
                    StatusCode.InvalidAction,
                );
            } else if (!hasValuesInResponse && delayedStatusReports.length) {
                // We have no values in the response but collected status reports, so we need to send them
                for (const delayedReport of delayedStatusReports) {
                    yield InteractionServerMessenger.convertServerInteractionReport(delayedReport);
                }
            }
        } finally {
            session[Symbol.dispose]();
        }
        this.#lastUpdateTime = Time.nowMs;
    }

    async sendInitialReport(
        messenger: InteractionServerMessenger,
        readContext: RemoteActorContext.Options,
        suppressStatusReports?: boolean,
    ) {
        this.#updateTimer.stop();

        // Register change handlers, so that we get changes directly
        if (this.criteria.attributeRequests?.length) {
            this.#changeHandlers.on(
                this.#context.node.protocol.attrsChanged,
                this.#handleClusterStateChanges.bind(this),
            );
        }
        if (this.criteria.eventRequests?.length) {
            this.#changeHandlers.on(this.#context.node.protocol.eventHandler.added, this.#handleAddedEvents.bind(this));
        }

        await messenger.sendDataReport({
            baseDataReport: {
                suppressResponse: false, // we always need proper response for initial report
                subscriptionId: this.id,
                interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
            },
            forFabricFilteredRead: this.criteria.isFabricFiltered,
            payload: this.#processAttributesAndEventsReport(readContext, suppressStatusReports),
        });
    }

    async #flush() {
        this.#sendDelayTimer.stop();
        if (this.#outstandingAttributeUpdates !== undefined || this.#outstandingEventsMinNumber !== undefined) {
            logger.debug(`Flushing subscription ${this.id}${this.isClosed ? " (for closing)" : ""}`);
            this.#triggerSendUpdate(true);
            if (this.#currentUpdatePromise) {
                await this.#currentUpdatePromise;
            }
        }
    }

    protected override async destroy() {
        this.#sendUpdatesActivated = false;

        this.#changeHandlers.close();

        this.#updateTimer.stop();
        this.#sendDelayTimer.stop();
        await super.destroy();
    }

    /**
     * Closes the subscription and flushes all outstanding data updates if requested.
     */
    override async close(graceful = false, cancelledByPeer = false) {
        if (this.isClosed) {
            return;
        }
        if (cancelledByPeer) {
            this.isCanceledByPeer = true;
        }
        await this.destroy();
        if (graceful) {
            await this.#flush();
        }
        if (this.#currentUpdatePromise) {
            await this.#currentUpdatePromise;
        }
    }

    /**
     * Iterates over all attributes and events that have changed since the last update and sends them to
     * the controller.
     * A thrown exception will cancel the sending process immediately.
     */
    async *#iterateDataUpdate(
        exchange: MessageExchange,
        attributeFilter: DirtyState.ForCluster | undefined,
        eventsMinNumber: EventNumber | undefined,
    ) {
        const request = {
            ...this.criteria,
            interactionModelRevision: Specification.INTERACTION_MODEL_REVISION, // irrelevant here, set to our version
        };

        const session = RemoteActorContext({
            activity: (exchange as NodeActivity.WithActivity)[NodeActivity.activityKey],
            fabricFiltered: request.isFabricFiltered,
            message: {} as Message,
            exchange,
            node: this.#context.node,
        }).beginReadOnly();

        try {
            if (attributeFilter !== undefined && Read.containsAttribute(request)) {
                const attributeReader = new AttributeSubscriptionResponse(
                    this.#context.node.protocol,
                    session,
                    attributeFilter,
                );
                for (const chunk of attributeReader.process(request)) {
                    for (const report of chunk) {
                        // No need to filter out status responses because AttributeSubscriptionResponse does that already
                        yield InteractionServerMessenger.convertServerInteractionReport(report);
                    }
                }
            }

            if (eventsMinNumber !== undefined && Read.containsEvent(request)) {
                // Add the new minimum event number to the request
                request.eventFilters = [{ eventMin: eventsMinNumber }];

                const eventReader = new EventReadResponse(this.#context.node.protocol, session);
                for await (const chunk of eventReader.process(request)) {
                    for (const report of chunk) {
                        if (report.kind === "event-status") {
                            continue;
                        }
                        yield InteractionServerMessenger.convertServerInteractionReport(report);
                    }
                }
            }
        } finally {
            session[Symbol.dispose]();
        }
    }

    async #sendUpdateMessage(
        attributeFilter: DirtyState.ForCluster | undefined,
        eventsMinNumber: EventNumber | undefined,
        onlyWithData: boolean,
    ) {
        const exchange = this.#context.initiateExchange(this.#peerAddress, INTERACTION_PROTOCOL_ID);
        if (exchange === undefined) return false;

        const messenger = new InteractionServerMessenger(exchange);

        try {
            if (attributeFilter === undefined && eventsMinNumber === undefined) {
                await messenger.sendDataReport({
                    baseDataReport: {
                        suppressResponse: true, // suppressResponse true for empty DataReports
                        subscriptionId: this.id,
                        interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
                    },
                    forFabricFilteredRead: this.criteria.isFabricFiltered,
                    waitForAck: !this.isClosed, // Do not wait for ack when closed
                });
            } else {
                // TODO: Add correct handling for reports that would have data but in the end not send any because of
                //  filtered out. Correct handling needs refactoring to create messenger and exchange on the fly
                //  when data are there.
                await messenger.sendDataReport({
                    baseDataReport: {
                        suppressResponse: false, // Non-empty data reports always need to send response
                        subscriptionId: this.id,
                        interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
                    },
                    forFabricFilteredRead: this.criteria.isFabricFiltered,
                    payload: this.#iterateDataUpdate(exchange, attributeFilter, eventsMinNumber),
                    waitForAck: !this.isClosed, // Do not wait for ack when closed
                    suppressEmptyReport: onlyWithData,
                });
            }
        } catch (error) {
            if (StatusResponseError.is(error, StatusCode.InvalidSubscription, StatusCode.Failure)) {
                logger.info(`Subscription ${this.id} cancelled by peer.`);
                this.isCanceledByPeer = true;
                await this.close(false);
            } else {
                StatusResponseError.accept(error);
                logger.info(`Subscription ${this.id} update failed:`, error);
                await this.close(false);
            }
        } finally {
            await messenger.close();
        }
        return true;
    }
}
