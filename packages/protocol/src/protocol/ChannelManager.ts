/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AsyncObservable, Bytes, Channel, Environment, Environmental, Logger } from "#general";
import { PeerAddress, PeerAddressMap } from "#peer/PeerAddress.js";
import { MessageChannel } from "#protocol/MessageChannel.js";
import { NodeSession } from "#session/NodeSession.js";
import { Session } from "#session/Session.js";
import { SessionClosedError } from "./errors.js";

const logger = Logger.get("ChannelManager");

export class ChannelManager {
    readonly #channels = new PeerAddressMap<MessageChannel[]>();
    readonly #paseChannels = new Map<Session, MessageChannel>();
    #caseSessionsPerFabricAndNode: number;
    #added = AsyncObservable<[address: PeerAddress, channel: MessageChannel]>();

    // TODO evaluate with controller the effects of limiting the entries just for FabricIndex and not also NodeId
    constructor(caseSessionsPerFabricAndNode = 3) {
        this.#caseSessionsPerFabricAndNode = caseSessionsPerFabricAndNode;
    }

    static [Environmental.create](env: Environment) {
        const instance = new ChannelManager();
        env.set(ChannelManager, instance);
        return instance;
    }

    get added() {
        return this.#added;
    }

    set caseSessionsPerFabricAndNode(count: number) {
        this.#caseSessionsPerFabricAndNode = count;
    }

    #findLeastActiveChannel(channels: MessageChannel[]) {
        let oldest = channels[0];
        for (const channel of channels) {
            if (channel.session.timestamp < oldest.session.timestamp) {
                oldest = channel;
            }
        }
        return oldest;
    }

    async setChannel(address: PeerAddress, channel: MessageChannel) {
        channel.onClose = async () => this.removeChannel(address, channel.session);
        const currentChannels = this.#channels.get(address) ?? [];
        currentChannels.push(channel);
        this.#channels.set(address, currentChannels);
        await this.#added.emit(address, channel);
        if (currentChannels.length > this.#caseSessionsPerFabricAndNode) {
            const oldestChannel = this.#findLeastActiveChannel(currentChannels);

            const { session: oldSession } = oldestChannel;
            // Should always be the case
            if (channel.session.id !== oldSession.id) {
                await oldSession.destroy(false, false);
            }
            logger.info(`Close oldest channel for fabric ${PeerAddress(address)} (from session ${oldSession.id})`);
            await oldestChannel.close();
        }
    }

    hasChannel(address: PeerAddress) {
        return !!this.#channels
            .get(address)
            ?.filter(channel => !channel.closed && !channel.session.closingAfterExchangeFinished).length;
    }

    getChannel(address: PeerAddress, session?: Session) {
        let results = this.#channels.get(address) ?? [];
        if (session !== undefined) {
            results = results.filter(channel => channel.session.id === session.id);
        }
        results = results.filter(channel => !channel.closed && !channel.session.closingAfterExchangeFinished);
        if (results.length === 0)
            throw new SessionClosedError(
                `Can't find a channel to ${PeerAddress(address)}${session !== undefined ? ` session ${session.id}` : ""}`,
            );
        return results[results.length - 1]; // Return the latest added channel (or the one belonging to the session requested)
    }

    /**
     * Returns the last established session for a Fabric and Node
     */
    getChannelForSession(session: Session) {
        if (NodeSession.is(session) && !session.isPase) {
            const fabric = session.fabric;
            const nodeId = session.peerNodeId;
            if (fabric === undefined) {
                return this.#paseChannels.get(session);
            }
            return this.getChannel(fabric.addressOf(nodeId), session);
        }
        return this.#paseChannels.get(session);
    }

    async removeAllNodeChannels(address: PeerAddress) {
        const channelsToRemove = this.#channels.get(address) ?? [];
        for (const channel of channelsToRemove) {
            await channel.close();
        }
    }

    async removeChannel(address: PeerAddress, session: Session) {
        const fabricChannels = this.#channels.get(address) ?? [];
        const channelEntryIndex = fabricChannels.findIndex(
            ({ session: entrySession }) => entrySession.id === session.id,
        );
        if (channelEntryIndex === -1) {
            // Seems already removed
            return;
        }
        const channelEntry = fabricChannels.splice(channelEntryIndex, 1)[0];
        if (channelEntry === undefined) {
            return;
        }
        await channelEntry.close();
        this.#channels.set(address, fabricChannels);
    }

    private getOrCreateAsPaseChannel(byteArrayChannel: Channel<Bytes>, session: Session) {
        const msgChannel = new MessageChannel(
            byteArrayChannel,
            session,
            async () => void this.#paseChannels.delete(session),
        );
        this.#paseChannels.set(session, msgChannel);
        if (session.isSecure) {
            // For Insecure sessions we usually reuse channels, so do not close them
            session.destroyed.on(() => msgChannel.close());
        }
        return msgChannel;
    }

    async getOrCreateChannel(byteArrayChannel: Channel<Bytes>, session: Session) {
        if (!NodeSession.is(session)) {
            return this.getOrCreateAsPaseChannel(byteArrayChannel, session);
        }
        const fabric = session.fabric;
        const nodeId = session.peerNodeId;
        if (fabric === undefined) {
            return this.getOrCreateAsPaseChannel(byteArrayChannel, session);
        }

        // Try to get
        const address = fabric.addressOf(nodeId);
        try {
            return this.getChannel(address, session);
        } catch (e) {
            SessionClosedError.accept(e);
        }

        // Need to create
        const msgChannel = new MessageChannel(byteArrayChannel, session, async () =>
            this.removeChannel(address, session),
        );
        await this.setChannel(address, msgChannel);
        session.destroyed.on(() => msgChannel.close());
        return msgChannel;
    }

    async close() {
        for (const channel of this.#paseChannels.values()) {
            await channel.close();
        }
        this.#paseChannels.clear();
        for (const channels of this.#channels.values()) {
            for (const channel of channels) {
                await channel.close();
            }
        }
        this.#channels.clear();
    }
}
