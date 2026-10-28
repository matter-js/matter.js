/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ClosedError,
    describeList,
    Diagnostic,
    DnsMessageType,
    DnsMessageTypeFlag,
    DnsRecord,
    Lifetime,
    Logger,
    MaybePromise,
    MdnsSocket,
    Millis,
    Mutex,
    NetworkInterfaceDetails,
    ObserverGroup,
    Time,
    Timer,
} from "@matter/general";
import { InterfaceResponder } from "./InterfaceResponder.js";

const logger = Logger.get("MdnsServer");

const RESPONDER_NAMES_OWNER = "mdns-responder";

/**
 * The mDNS responder: publishes the records of registered services, answers queries for them and says goodbye when
 * a service is withdrawn.  Each network interface has its own {@link InterfaceResponder}, which sends one packet at a
 * time.
 */
export class MdnsServer {
    #lifetime: Lifetime;
    #observers = new ObserverGroup();
    readonly #registrations = new Map<
        string,
        { registration: MdnsServer.Registration; generator: MdnsServer.RecordGenerator }
    >();
    #generation = 0;
    readonly #responders = new Map<string, InterfaceResponder>();
    readonly #owner: InterfaceResponder.Owner;
    readonly #hostnameChoice = new Mutex(this);
    #closing?: Promise<void>;
    #pendingAnnouncement?: PendingAnnouncement;
    #hostname?: string;
    readonly #truncatedQueryCache = new Map<string, { message: MdnsSocket.Message; timer: Timer }>();

    readonly #socket: MdnsSocket;

    constructor(socket: MdnsSocket, lifetime = Lifetime.process) {
        this.#socket = socket;
        this.#lifetime = lifetime.join("mdns server");
        const server = this;
        this.#owner = {
            socket,
            registrations: this.#registrations,
            get generation() {
                return server.#generation;
            },
            hostnameFor: details => this.#hostname ?? hostnameForMac(details.mac),
            viewChanged: () => this.#updateNames(),
        };
        this.#observers.on(this.#socket.receipt, this.#handleMessage.bind(this));
    }

    toString() {
        return "mDNS server";
    }

    get network() {
        return this.#socket.network;
    }

    get supportsIpv4() {
        return this.#socket.supportsIpv4;
    }

    async #handleMessage(incomingMessage: MdnsSocket.Message) {
        using _processing = this.#lifetime.join("processing message");

        if (this.#registrations.size === 0) {
            return;
        }

        const message = this.#prepareMessage(incomingMessage);
        if (message === undefined) {
            return;
        }

        let responder;
        try {
            responder = await this.#withCurrentDetails(message.sourceIntf);
        } catch (error) {
            this.#detailsUnavailable(`Cannot answer a query on interface ${message.sourceIntf}`, error);
            return;
        }
        await responder.answer(message);
    }

    /**
     * Register the records that {@link generator} produces for {@link service}, replacing the registration under that
     * name.  The server answers queries for them from now on, but announces nothing until {@link broadcast}.  The
     * registration is in place before the first await; resolves once the host name is chosen again.
     *
     * Use the returned handle to call the generator again or to withdraw the service.  A replaced registration's
     * handle does nothing.  Once {@link close} started, also while this runs, the handle is inert and nothing stays
     * registered.  If {@link generator} throws while an interface has details, the registration is removed again and
     * the error is rethrown; without details the generator first runs at the next answer or announcement.
     */
    async register(service: string, generator: MdnsServer.RecordGenerator): Promise<MdnsServer.Registration> {
        const registration: MdnsServer.Registration = {
            service,
            refresh: () => this.#refresh(registration),
            withdraw: () => this.#withdraw(registration),
            [Symbol.asyncDispose]: () => registration.withdraw(),
        };
        this.#registrations.set(service, { registration, generator });
        this.#registrationsChanged();
        try {
            await this.#updateHost();
        } catch (error) {
            this.#unregister(registration);
            throw error;
        }
        if (this.#closing !== undefined) {
            logger.debug(`Not registering ${service}, ${this} is closed`);
            this.#unregister(registration);
        }
        return registration;
    }

    async #refresh(registration: MdnsServer.Registration) {
        if (!this.#isRegistered(registration)) {
            return;
        }
        this.#registrationsChanged();
        await this.#updateHost();
    }

    async #withdraw(registration: MdnsServer.Registration) {
        const { service } = registration;
        using _withdrawing = this.#lifetime.join("withdrawing", Diagnostic.strong(service));
        if (!this.#unregister(registration)) {
            return;
        }
        await Promise.all(
            this.#currentResponders().map(responder =>
                responder
                    .publish([])
                    .catch(error => this.#logPublishFailure(`Goodbye for ${service}`, responder, error)),
            ),
        );
    }

    /** Remove {@link registration} if it is the current one for its service; returns whether it was. */
    #unregister(registration: MdnsServer.Registration) {
        if (!this.#isRegistered(registration)) {
            return false;
        }
        this.#registrations.delete(registration.service);
        this.#registrationsChanged();
        this.#updateNames();
        return true;
    }

    #logPublishFailure(what: string, responder: InterfaceResponder, error: unknown) {
        if (this.#lifetime.isClosing || !responder.isListed) {
            logger.debug(`${what} not sent on interface ${responder.name}`, error);
        } else {
            logger.warn(`${what} not sent on interface ${responder.name}`, error);
        }
    }

    /** A failed details read is logged by the responder, see {@link InterfaceResponder.readDetails}. */
    #detailsUnavailable(what: string, error: unknown) {
        if (error instanceof ClosedError) {
            logger.debug(`${what}, ${this} is closed`);
        }
    }

    #isRegistered(registration: MdnsServer.Registration) {
        return this.#registrations.get(registration.service)?.registration === registration;
    }

    /**
     * Announce the named services, or all registered services if none are named, on every multicast interface.
     * Requests made before the event loop turns are sent together, in one message per interface, split into
     * datagrams by size, that also says goodbye to records that left; so advertisements that announce in the same
     * turn share one announcement with each shared record once.  An announcement is never held by the one-second rule
     * of RFC 6762 §6.
     *
     * Logs and does not throw on failure.
     */
    async broadcast(...services: string[]) {
        using _broadcasting = this.#lifetime.join("broadcasting", Diagnostic.strong(describeList("and", ...services)));
        await this.#announce(services.length ? services : "all");
    }

    /**
     * Join the pending announcement, or start one that goes out in the next macrotask.  A macrotask, not a timer:
     * advertisements that start together register and broadcast within one event-loop turn, because the interface
     * lookups behind registration are synchronous on Node.js, and a longer window would delay every announcement.
     */
    #announce(services: string[] | "all") {
        const pending = (this.#pendingAnnouncement ??= this.#startAnnouncement());
        if (services === "all") {
            pending.all = true;
        } else {
            for (const service of services) {
                pending.services.add(service);
            }
        }
        return pending.done;
    }

    #startAnnouncement(): PendingAnnouncement {
        const request = { services: new Set<string>(), all: false };
        return Object.assign(request, { done: Time.macrotask.then(() => this.#sendAnnouncement(request)) });
    }

    async #sendAnnouncement(request: AnnouncementRequest) {
        if (this.#pendingAnnouncement === request) {
            this.#pendingAnnouncement = undefined;
        }
        await this.#publishOnListedInterfaces(request.all ? "all" : [...request.services]);
    }

    async #publishOnListedInterfaces(services: string[] | "all") {
        try {
            await Promise.all(
                (await this.#listInterfaces()).map(async ({ name }) => {
                    const responder = this.#interfaceFor(name);
                    try {
                        await this.#withCurrentDetails(name);
                    } catch (error) {
                        this.#detailsUnavailable(`Announcement not sent on interface ${name}`, error);
                        return;
                    }
                    try {
                        await responder.publish(services);
                    } catch (error) {
                        this.#logPublishFailure("Announcement", responder, error);
                    }
                }),
            );
        } catch (error) {
            if (this.#lifetime.isClosing) {
                logger.debug("Error announcing MDNS messages while closing", error);
            } else {
                logger.warn("Error announcing MDNS messages", error);
            }
        }
    }

    #registrationsChanged() {
        this.#generation++;
    }

    /** Read the interface details, choose the host name again and update the socket names. */
    async #updateHost() {
        await this.#hostnameChoice.produce(() => this.#chooseHostname());
        this.#updateNames();
    }

    /**
     * Tell the socket the names of the records the current views publish, so it keeps queries for them before
     * decoding.  Runs on every registration change and every rebuild of a view.  While no interface has details yet,
     * the socket keeps the previous names; after the last withdrawal it keeps none, and once close started this does
     * nothing, as close removed them.
     */
    #updateNames() {
        if (this.#closing !== undefined) {
            return;
        }
        const names = new Set<string>();
        for (const responder of this.#responders.values()) {
            for (const name of responder.names()) {
                names.add(name);
            }
        }
        if (!names.size && this.#registrations.size) {
            return;
        }
        if (names.size) {
            this.#socket.registerRelevantNames(RESPONDER_NAMES_OWNER, names);
        } else {
            this.#socket.unregisterRelevantNames(RESPONDER_NAMES_OWNER);
        }
    }

    #interfaceFor(name: string) {
        if (this.#closing !== undefined) {
            throw new ClosedError(`${this} is closed, cannot use interface ${name}`);
        }
        let responder = this.#responders.get(name);
        if (responder === undefined) {
            responder = new InterfaceResponder(name, this.#owner);
            this.#responders.set(name, responder);
        }
        return responder;
    }

    /** The responder of interface {@link name} with details read within their lifetime; reads them first if not. */
    #withCurrentDetails(name: string): MaybePromise<InterfaceResponder> {
        const responder = this.#interfaceFor(name);
        if (!responder.needsDetailsRead) {
            return responder;
        }
        return MaybePromise.then(responder.readDetails(), () => responder);
    }

    /** The responders, after dropping those whose state expired. */
    #currentResponders() {
        for (const responder of this.#responders.values()) {
            if (responder.prune()) {
                this.#responders.delete(responder.name);
            }
        }
        return [...this.#responders.values()];
    }

    /** List the multicast interfaces and note on each responder whether its interface is listed. */
    async #listInterfaces() {
        const listed = await this.#getMulticastInterfacesForAnnounce();
        const names = new Set(listed.map(({ name }) => name));
        for (const responder of this.#currentResponders()) {
            responder.isListed = names.has(responder.name);
        }
        return listed;
    }

    /**
     * Stop answering and announcing.  The goodbyes of a withdrawal that waits for its interface still go out.  A
     * service withdrawn after this started gets no goodbye, and neither do the records a refresh removed while the
     * {@link broadcast} that would carry their goodbye still waits for its event-loop turn.  Settles once the sends in
     * flight settled; may be called again.
     */
    close() {
        this.#closing ??= this.#close();
        return this.#closing;
    }

    async #close() {
        using _closing = this.#lifetime.closing();
        this.#observers.close();
        this.#socket.unregisterRelevantNames(RESPONDER_NAMES_OWNER);
        for (const { timer } of this.#truncatedQueryCache.values()) {
            timer.stop();
        }
        this.#truncatedQueryCache.clear();
        await Promise.all([...this.#responders.values()].map(responder => responder.close()));
    }

    /**
     * Chooses the target host name of every interface: the current one while an interface still carries its MAC,
     * otherwise the first interface with addresses and a non-zero MAC.
     *
     * A querier that hears us on several interfaces must see one host per instance, so the name may not follow the
     * interface; the Matter specification permits one host name across interfaces (Core, "Host Name Construction").
     */
    async #chooseHostname() {
        try {
            const candidates = new Array<string>();
            for (const { name } of await this.#listInterfaces()) {
                const responder = this.#interfaceFor(name);
                try {
                    await responder.readDetails();
                } catch {
                    // The responder logged the failed read; the interface offers no host name
                    continue;
                }
                const { details } = responder;
                if (details?.ipV4.length || details?.ipV6.length) {
                    if (/[1-9a-f]/i.test(details.mac)) {
                        candidates.push(hostnameForMac(details.mac));
                    }
                }
            }
            if (this.#hostname === undefined || !candidates.includes(this.#hostname)) {
                this.#hostname = candidates[0];
            }
        } catch (error) {
            if (error instanceof ClosedError) {
                logger.debug("mDNS host name not chosen, the server closed", error);
            } else {
                logger.warn("Cannot list network interfaces to choose the mDNS host name", error);
            }
        }
    }

    #getMulticastInterfacesForAnnounce() {
        const { netInterface } = this.#socket;
        return netInterface === undefined ? this.network.getNetInterfaces() : [{ name: netInterface }];
    }

    async #processTruncatedQuery(key: string) {
        const { message, timer } = this.#truncatedQueryCache.get(key) ?? {};
        this.#truncatedQueryCache.delete(key);
        timer?.stop();
        if (message) {
            if (message.queries.length === 0) {
                // Should not happen but ignore if it does
                return;
            }
            message.messageType &= ~DnsMessageTypeFlag.TC; // Clear TC flag
            await this.#handleMessage(message);
        }
    }

    /**
     * Delays processing of truncated messages to allow combining multiple parts or combines them if possible
     */
    #prepareMessage(newMessage: MdnsSocket.Message): MdnsSocket.Message | undefined {
        const { messageType, transactionId, sourceIntf, sourceIp } = newMessage;

        if (!DnsMessageType.isQuery(messageType)) {
            // We are only interested in queries
            return;
        }

        const key = `${transactionId}-${sourceIntf}-${sourceIp}`;
        const { message: existingMessage, timer } = this.#truncatedQueryCache.get(key) ?? {};
        this.#truncatedQueryCache.delete(key);
        timer?.stop();

        const message = existingMessage
            ? {
                  ...existingMessage,
                  queries: [...existingMessage.queries, ...newMessage.queries],
                  answers: [...existingMessage.answers, ...newMessage.answers],
                  additionalRecords: [...existingMessage.additionalRecords, ...newMessage.additionalRecords],
                  messageType: newMessage.messageType, // Keep TC flag as is from the latest message
              }
            : newMessage;

        // Message was not truncated, or we have now received all details, process it
        if ((messageType & DnsMessageTypeFlag.TC) === 0) {
            if (message.queries.length === 0) {
                // Should not happen but ignore if it does
                return;
            }
            return message;
        }

        // We have stored a new or updated truncated message - store and wait for next part
        // Delay should be max 400-500ms as per RFC 6762 section 7.2
        this.#truncatedQueryCache.set(key, {
            message,
            timer: Time.getTimer(`Truncated MDNS message ${key}`, Millis(400 + Math.floor(Math.random() * 100)), () =>
                this.#processTruncatedQuery(key),
            ).start(),
        });
    }
}

export namespace MdnsServer {
    /**
     * Produces the records of one service on one interface.  Called again for every change of the registrations, the
     * interface details or the host name; the returned records are never changed by the server.  Every call returns
     * new record objects, and a record returned once is never changed afterwards: the server keeps it to say goodbye
     * with the data it announced.
     */
    export interface RecordGenerator {
        (intf: string, addrs: NetworkInterfaceDetails, hostname: string): DnsRecord[];
    }

    /**
     * A service registered with {@link MdnsServer.register}.  Each method does nothing once the service was withdrawn
     * or registered again under the same name.
     */
    export interface Registration extends AsyncDisposable {
        readonly service: string;

        /**
         * Call the generator again.  Answers use the new records at once; the next {@link MdnsServer.broadcast}
         * announces them and, in the same packet, says goodbye to every record that left, a replaced one included.
         * The goodbye of a record whose name, type and class still has records carries no cache-flush bit, so it
         * removes only the old record.  The next withdrawal sends the same goodbyes.  Sends nothing itself.  Settles
         * once the host name is chosen again.
         *
         * RFC 6762 §8.4 says a host SHOULD omit the goodbye for a replaced unique record and rely on the cache-flush
         * bit of the new one.  The goodbye is sent anyway, because the new record may go out in another packet, more
         * than a second later, or without the bit.
         *
         * @see {@link https://www.rfc-editor.org/rfc/rfc6762#section-8.4} RFC 6762 §8.4
         */
        refresh(): Promise<void>;

        /**
         * Stop answering for the service and send a goodbye.
         *
         * On each interface, the goodbye names a record only while the records the remaining registrations publish
         * there are known, and only if those no longer contain it; an interface without valid details sends none.  So
         * the host's A/AAAA records and the `_services._dns-sd._udp.local` pointers that services of one type share
         * stay while another service publishes them.  The registration is removed before the first await; settles once
         * the goodbyes are sent.  Logs and does not throw on failure.  A goodbye that did not leave on every address
         * family of an interface is sent again, with or without a later publication, until it leaves or peers drop the
         * records at the end of their TTL.
         *
         * @see {@link https://www.rfc-editor.org/rfc/rfc6762#section-10.1} RFC 6762 §10.1
         */
        withdraw(): Promise<void>;
    }
}

interface AnnouncementRequest {
    services: Set<string>;
    all: boolean;
}

interface PendingAnnouncement extends AnnouncementRequest {
    done: Promise<void>;
}

function hostnameForMac(mac: string) {
    return `${mac.replace(/:/g, "").toUpperCase()}0000.local`;
}
