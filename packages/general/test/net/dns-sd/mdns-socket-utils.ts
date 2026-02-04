/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AAAARecord,
    ARecord,
    DnsCodec,
    DnsMessage,
    DnsMessageType,
    DnsRecord,
    MdnsSocket,
    MockNetwork,
    MockUdpChannel,
    NetworkSimulator,
    PtrRecord,
    SrvRecord,
    TxtRecord,
} from "#index.js";

/** Default test network configuration */
export const DEFAULT_IPV4 = "10.10.10.1";
export const DEFAULT_IPV6 = "abcd::1";
export const DEFAULT_MAC = "00:11:22:33:44:01";
export const PEER_IPV4 = "10.10.10.2";
export const PEER_IPV6 = "abcd::2";
export const PEER_MAC = "00:11:22:33:44:02";

/** Test environment with network simulator and socket */
export interface TestEnv {
    simulator: NetworkSimulator;
    network: MockNetwork;
    socket: MdnsSocket;
    peerNetwork: MockNetwork;
    peerChannel: MockUdpChannel;
}

/** Options for creating a test environment */
export interface TestEnvOptions {
    enableIpv4?: boolean;
    netInterface?: string;
    ips?: string[];
    peerIps?: string[];
}

/** Creates a test environment with MdnsSocket and peer channel for sending/receiving */
export async function createTestEnv(options: TestEnvOptions = {}): Promise<TestEnv> {
    const { enableIpv4 = true, netInterface = "fake0", ips, peerIps } = options;

    const simulator = new NetworkSimulator();

    const networkIps = ips ?? (enableIpv4 ? [DEFAULT_IPV4, DEFAULT_IPV6] : [DEFAULT_IPV6]);
    const network = new MockNetwork(simulator, DEFAULT_MAC, networkIps);

    const peerNetworkIps = peerIps ?? (enableIpv4 ? [PEER_IPV4, PEER_IPV6] : [PEER_IPV6]);
    const peerNetwork = new MockNetwork(simulator, PEER_MAC, peerNetworkIps);

    const socket = await MdnsSocket.create(network, { enableIpv4, netInterface });

    // Create a peer channel to send/receive mDNS messages
    const peerChannel = new MockUdpChannel(peerNetwork, {
        type: enableIpv4 ? "udp4" : "udp6",
        listeningPort: MdnsSocket.BROADCAST_PORT,
        netInterface,
        reuseAddress: true,
    });
    const broadcastAddress = enableIpv4 ? MdnsSocket.BROADCAST_IPV4 : MdnsSocket.BROADCAST_IPV6;
    peerChannel.addMembership(broadcastAddress);

    return { simulator, network, socket, peerNetwork, peerChannel };
}

/** Closes all resources in a test environment */
export async function closeTestEnv(env: TestEnv) {
    await env.socket.close();
    await env.peerChannel.close();
    await env.network.close();
    await env.peerNetwork.close();
}

/** Creates a simple DNS query message */
export function createQuery(name: string, recordType = 12): Partial<DnsMessage> & { messageType: DnsMessageType } {
    return {
        messageType: DnsMessageType.Query,
        queries: [{ name, recordType, recordClass: 1, uniCastResponse: false }],
        answers: [],
        authorities: [],
        additionalRecords: [],
    };
}

/** Creates a DNS response message */
export function createResponse(answers: DnsRecord[]): Partial<DnsMessage> & { messageType: DnsMessageType } {
    return {
        messageType: DnsMessageType.Response,
        queries: [],
        answers,
        authorities: [],
        additionalRecords: [],
    };
}

/** Creates a DNS response with standard Matter service records */
export function createMatterServiceResponse(
    serviceName: string,
    port: number,
    hostname: string,
    ip: string,
): Partial<DnsMessage> & { messageType: DnsMessageType } {
    const isIpv4 = ip.includes(".");
    return {
        messageType: DnsMessageType.Response,
        queries: [],
        answers: [
            PtrRecord("_matter._tcp.local", `${serviceName}._matter._tcp.local`),
            SrvRecord(`${serviceName}._matter._tcp.local`, { priority: 0, weight: 0, port, target: hostname }),
            TxtRecord(`${serviceName}._matter._tcp.local`, ["SII=5000", "SAI=300", "T=1"]),
            isIpv4 ? ARecord(hostname, ip) : AAAARecord(hostname, ip),
        ],
        authorities: [],
        additionalRecords: [],
    };
}

/** Sends a raw DNS message to the mDNS multicast address via peer channel */
export async function sendFromPeer(env: TestEnv, message: DnsMessage, enableIpv4 = true) {
    const encoded = DnsCodec.encode(message);
    const broadcastAddress = enableIpv4 ? MdnsSocket.BROADCAST_IPV4 : MdnsSocket.BROADCAST_IPV6;
    await env.peerChannel.send(broadcastAddress, MdnsSocket.BROADCAST_PORT, encoded);
}

/** Waits for a message to be received on the socket's receipt observable */
export function waitForReceipt(socket: MdnsSocket, timeout = 1000): Promise<MdnsSocket.Message> {
    return new Promise((resolve, reject) => {
        let subscription: Disposable | undefined = undefined;

        const timer = setTimeout(() => {
            subscription?.[Symbol.dispose]();
            reject(new Error("Timeout waiting for message receipt"));
        }, timeout);

        subscription = socket.receipt.use(message => {
            clearTimeout(timer);
            subscription?.[Symbol.dispose]();
            resolve(message);
        });
    });
}

/** Collects messages sent by the socket (via peer channel listener) */
export function collectSentMessages(env: TestEnv): { messages: DnsMessage[]; stop: () => Promise<void> } {
    const messages: DnsMessage[] = [];

    const listener = env.peerChannel.onData((_intf, _addr, _port, data) => {
        const decoded = DnsCodec.decode(data);
        if (decoded) {
            messages.push(decoded);
        }
    });

    return {
        messages,
        stop: () => listener.close(),
    };
}

/** Creates a large DNS response that exceeds the mDNS message size limit */
export function createOversizedResponse(answerCount: number): Partial<DnsMessage> & { messageType: DnsMessageType } {
    const answers: DnsRecord[] = [];
    for (let i = 0; i < answerCount; i++) {
        // Each TXT record with this content is about 100+ bytes encoded
        answers.push(
            TxtRecord(`service${i.toString().padStart(4, "0")}._matter._tcp.local`, [
                `KEY${i}=value${i}${"x".repeat(50)}`,
                `EXTRA${i}=moredata${i}`,
            ]),
        );
    }
    return {
        messageType: DnsMessageType.Response,
        queries: [],
        answers,
        authorities: [],
        additionalRecords: [],
    };
}

/** Creates a complete DNS message with default fields */
export function completeDnsMessage(
    partial: Partial<DnsMessage> & { messageType: DnsMessageType },
): DnsMessage & { messageType: DnsMessageType } {
    return {
        transactionId: 0,
        queries: [],
        answers: [],
        authorities: [],
        additionalRecords: [],
        ...partial,
    };
}
