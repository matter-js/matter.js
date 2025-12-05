/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NodeActivity } from "#behavior/context/NodeActivity.js";
import { RemoteActorContext } from "#behavior/context/server/RemoteActorContext.js";
import {
    AsyncObservable,
    Diagnostic,
    Duration,
    hex,
    Hours,
    InternalError,
    Lifetime,
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
import type { DirtyState, MessageExchange, NodeSession, SubscriptionId } from "#protocol";
import {
    AttributeReadResponse,
    AttributeSubscriptionResponse,
    EventReadResponse,
    InteractionServerMessenger,
    NumberedOccurrence,
    PeerAddress,
    Read,
    ReadResult,
    SessionClosedError,
    Subscription,
} from "#protocol";
import {
    AttributeId,
    ClusterId,
    EndpointNumber,
    EventNumber,
    INTERACTION_PROTOCOL_ID,
    StatusCode,
    StatusResponseError,
    SubscribeRequest,
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
    // TODO - remove this.  Subscriptions are associated with a peer, not a session
    session: NodeSession;
    node: ServerNode;
    initiateExchange(address: PeerAddress, protocolId: number): MessageExchange;
}

/**
 * Implements the server side of a single subscription.
 */
export class ServerSubscription implements Subscription {
    #lifetime?: Lifetime;
    readonly #context: ServerSubscriptionContext;

    #id: SubscriptionId;
    #isClosed = false;
    #isCanceledByPeer = false;
    #request: Omit<SubscribeRequest, "interactionModelRevision" | "keepSubscriptions">;
    #cancelled = AsyncObservable<[subscription: Subscription]>();
    #maxInterval?: Duration;

    #lastUpdateTime = Timestamp.zero;
    #updateTimer: Timer;
    readonly #sendDelayTimer: Timer;
    #outstandingAttributeUpdates?: DirtyState.ForNode;
    #outstandingEventsMinNumber?: EventNumber;
    readonly #changeHandlers = new ObserverGroup();

    #sendUpdatesActivated = false;
    #seededClusterDetails? = new Map<string, number>();
    #latestSeededEventNumber? = EventNumber(0);
    readonly #sendInterval: Duration;
    readonly #peerAddress: PeerAddress;

    #sendNextUpdateImmediately = false;
    #sendUpdateErrorCounter = 0;
    #currentUpdatePromise?: Promise<void>;

    constructor(options: {
        id: number;
        context: ServerSubscriptionContext;
        request: Omit<SubscribeRequest, "interactionModelRevision" | "keepSubscriptions">;
        subscriptionOptions: ServerSubscriptionConfig;
        useAsMaxInterval?: Duration;
        useAsSendInterval?: Duration;
    }) {
        const { id, context, request, subscriptionOptions, useAsMaxInterval, useAsSendInterval } = options;

        this.#id = id;
        this.#request = request;

        this.#context = context;

        this.#peerAddress = this.session.peerAddress;

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

        // These start later as needed
        this.#sendDelayTimer = Time.getTimer(`Subscription ${this.idStr} delay`, Millis(50), () =>
            this.#triggerSendUpdate(),
        );
        this.#updateTimer = Time.getTimer(`Subscription ${this.idStr} update`, this.#sendInterval, () =>
            this.#prepareDataUpdate(),
        );
    }

    get subscriptionId() {
        return this.#id;
    }

    get idStr() {
        return hex.fixed(this.#id, 8);
    }

    get session() {
        return this.#context.session;
    }

    get isCanceledByPeer() {
        return this.#isCanceledByPeer;
    }

    get request() {
        return this.#request;
    }

    get cancelled() {
        return this.#cancelled;
    }

    get maxInterval() {
        if (this.#maxInterval === undefined) {
            throw new InternalError("Subscription maxInterval accessed before it was set");
        }
        return this.#maxInterval;
    }

    get sendInterval() {
        return this.#sendInterval;
    }

    get minIntervalFloor() {
        return Seconds(this.request.minIntervalFloorSeconds);
    }

    get maxIntervalCeiling() {
        return Seconds(this.request.maxIntervalCeilingSeconds);
    }

    set maxInterval(value: Duration) {
        if (this.#maxInterval !== undefined) {
            throw new InternalError("Subscription maxInterval set twice");
        }
        this.#maxInterval = value;
    }

    async handlePeerCancel() {
        this.#isCanceledByPeer = true;
        await this.close(true);
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
                            this.minIntervalFloor,
                            Duration.min(subscriptionMaxInterval, this.maxIntervalCeiling),
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
            sendInterval = Duration.max(this.minIntervalFloor, Millis.floor(Millis(maxInterval * 0.8)));
        }
        if (sendInterval < subscriptionMinInterval) {
            // But not faster than once every 2s
            logger.warn(
                `Determined subscription send interval of ${Duration.format(sendInterval)} is too low. Using maxInterval (${Duration.format(maxInterval)}) instead.`,
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
        if (this.#isClosed || !changedAttrs.length) {
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
        if (this.#isClosed) {
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
        return (this.request.eventRequests ?? []).some(
            ({ endpointId: reqEndpointId, clusterId: reqClusterId, eventId: reqEventId, isUrgent }) =>
                isUrgent &&
                (reqEndpointId === undefined || reqEndpointId === endpointId) &&
                (reqClusterId === undefined || reqClusterId === clusterId) &&
                (reqEventId === undefined || reqEventId === eventId),
        );
    }

    activate() {
        this.session.subscriptions.add(this);
        logger.debug(this.session.via, "New subscription", Diagnostic.strong(this.idStr));
        this.#lifetime = this.#context.session.join("subscription", Diagnostic.strong(this.#id));

        // We do not need these data anymore, so we can free some memory
        if (this.request.eventFilters !== undefined) this.request.eventFilters.length = 0;
        if (this.request.dataVersionFilters !== undefined) this.request.dataVersionFilters.length = 0;

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
        if (this.#sendDelayTimer.isRunning || this.#isClosed) {
            // sending data is already scheduled, data updates go in there ... or we close down already
            return;
        }

        if (!this.#sendUpdatesActivated) {
            return;
        }

        this.#updateTimer.stop();
        const now = Time.nowMs;
        const timeSinceLastUpdate = Millis(now - this.#lastUpdateTime);
        if (timeSinceLastUpdate < this.minIntervalFloor) {
            // Respect minimum delay time between updates
            this.#updateTimer = Time.getTimer(
                "Subscription update",
                Millis(this.minIntervalFloor - timeSinceLastUpdate),
                () => this.#prepareDataUpdate(),
            ).start();
            return;
        }

        this.#sendDelayTimer.start();
        this.#updateTimer = Time.getTimer(`Subscription update ${this.idStr}`, this.#sendInterval, () =>
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
     */
    async #sendUpdate(onlyWithData = false) {
        using updating = this.#lifetime?.join("updating");

        while (true) {
            // Get all outstanding updates, make sure the order is correct per endpoint and cluster
            const attributeFilter = this.#outstandingAttributeUpdates;
            this.#outstandingAttributeUpdates = undefined;

            const eventsMinNumber = this.#outstandingEventsMinNumber;
            this.#outstandingEventsMinNumber = undefined;

            if (onlyWithData && attributeFilter === undefined && eventsMinNumber === undefined) {
                break;
            }

            this.#lastUpdateTime = Time.nowMs;

            try {
                using sending = updating?.join("sending");
                if (await this.#sendUpdateMessage(sending, attributeFilter, eventsMinNumber, onlyWithData)) {
                    this.#sendUpdateErrorCounter = 0;
                }
            } catch (error) {
                if (this.#isClosed) {
                    // No need to care about resubmissions when the server is closing
                    // TODO - implement proper abort so we don't need to ignore errors
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
                        `Sending update failed 3 times in a row, canceling subscription ${this.idStr} and let controller subscribe again.`,
                    );
                    this.#sendNextUpdateImmediately = false;
                    if (
                        error instanceof NoResponseTimeoutError ||
                        error instanceof NetworkError ||
                        error instanceof SessionClosedError
                    ) {
                        // Let's consider this subscription as dead and wait for a reconnect.  We handle as if the
                        // controller cancelled
                        using _messaging = updating?.join("canceling");
                        this.#isCanceledByPeer = true;
                        await this.#cancel();
                        break;
                    } else {
                        throw error;
                    }
                }
            }

            if (!this.#sendNextUpdateImmediately) {
                break;
            }

            logger.debug("Sending delayed update immediately after last one was sent");
            this.#sendNextUpdateImmediately = false;
            onlyWithData = true; // In subsequent iterations only send if non-empty
        }
    }

    /**
     * Returns an iterator that yields the data reports and events data for the given read request.
     */
    async *#processAttributesAndEventsReport(context: RemoteActorContext.Options, suppressStatusReports = false) {
        const request = {
            ...this.request,
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
        if (this.request.attributeRequests?.length) {
            this.#changeHandlers.on(
                this.#context.node.protocol.attrsChanged,
                this.#handleClusterStateChanges.bind(this),
            );
        }
        if (this.request.eventRequests?.length) {
            this.#changeHandlers.on(this.#context.node.protocol.eventHandler.added, this.#handleAddedEvents.bind(this));
        }

        await messenger.sendDataReport({
            baseDataReport: {
                suppressResponse: false, // we always need proper response for initial report
                subscriptionId: this.subscriptionId,
                interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
            },
            forFabricFilteredRead: this.request.isFabricFiltered,
            payload: this.#processAttributesAndEventsReport(readContext, suppressStatusReports),
        });
    }

    async #flush() {
        this.#sendDelayTimer.stop();
        if (this.#outstandingAttributeUpdates !== undefined || this.#outstandingEventsMinNumber !== undefined) {
            logger.debug(`Flushing subscription ${this.idStr}${this.#isClosed ? " (for closing)" : ""}`);
            this.#triggerSendUpdate(true);
            if (this.#currentUpdatePromise) {
                using _waiting = this.#lifetime?.join("waiting on flush");
                await this.#currentUpdatePromise;
            }
        }
    }

    /**
     * Closes the subscription and flushes all outstanding data updates if requested.
     */
    async close(flush = false) {
        if (this.#isClosed) {
            return;
        }
        this.#isClosed = true;

        await this.#cancel(flush);

        if (this.#currentUpdatePromise) {
            using _waiting = this.#lifetime?.closing()?.join("waiting on update");
            await this.#currentUpdatePromise;
        }
    }

    async #cancel(flush = false) {
        const closing = this.#lifetime?.closing();

        this.#sendUpdatesActivated = false;

        this.#changeHandlers.close();

        if (flush) {
            using _flushing = closing?.join("flushing");
            await this.#flush();
        }

        this.#updateTimer.stop();
        this.#sendDelayTimer.stop();

        this.session.subscriptions.delete(this);
        logger.debug(this.session.via, "Deleted subscription", hex.fixed(this.subscriptionId, 8));

        this.cancelled.emit(this);
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
            ...this.request,
            interactionModelRevision: Specification.INTERACTION_MODEL_REVISION, // irrelevant here, set to our version
        };

        const session = RemoteActorContext({
            activity: (exchange as NodeActivity.WithActivity)[NodeActivity.activityKey],
            fabricFiltered: request.isFabricFiltered,
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
        lifetime: Lifetime | undefined,
        attributeFilter: DirtyState.ForCluster | undefined,
        eventsMinNumber: EventNumber | undefined,
        onlyWithData: boolean,
    ) {
        const exchange = this.#context.initiateExchange(this.#peerAddress, INTERACTION_PROTOCOL_ID);
        if (exchange === undefined) return false;

        const messenger = new InteractionServerMessenger(exchange);

        try {
            if (attributeFilter === undefined && eventsMinNumber === undefined) {
                using _sending = lifetime?.join("sending keepalive");
                await messenger.sendDataReport({
                    baseDataReport: {
                        suppressResponse: true, // suppressResponse true for empty DataReports
                        subscriptionId: this.subscriptionId,
                        interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
                    },
                    forFabricFilteredRead: this.request.isFabricFiltered,
                    waitForAck: !this.#isClosed, // Do not wait for ack when closed
                });
            } else {
                using _sending = lifetime?.join("sending data");
                // TODO: Add correct handling for reports that would have data but in the end not send any because of
                //  filtered out. Correct handling needs refactoring to create messenger and exchange on the fly
                //  when data are there.
                await messenger.sendDataReport({
                    baseDataReport: {
                        suppressResponse: false, // Non-empty data reports always need to send response
                        subscriptionId: this.subscriptionId,
                        interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
                    },
                    forFabricFilteredRead: this.request.isFabricFiltered,
                    payload: this.#iterateDataUpdate(exchange, attributeFilter, eventsMinNumber),
                    waitForAck: !this.#isClosed, // Do not wait for ack when closed
                    suppressEmptyReport: onlyWithData,
                });
            }
        } catch (error) {
            if (StatusResponseError.is(error, StatusCode.InvalidSubscription, StatusCode.Failure)) {
                logger.info(`Subscription ${this.idStr} cancelled by peer`);
                this.#isCanceledByPeer = true;
            } else {
                StatusResponseError.accept(error);
                logger.info(`Subscription ${this.idStr} update failed:`, error);
            }

            using _canceling = lifetime?.join("canceling");
            await this.#cancel();
        } finally {
            using _closing = lifetime?.join("closing messenger");
            await messenger.close();
        }
        return true;
    }
}
