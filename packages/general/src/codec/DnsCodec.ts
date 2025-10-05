/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic } from "#log/Diagnostic.js";
import { Logger } from "#log/Logger.js";
import { Duration } from "#time/Duration.js";
import { Seconds } from "#time/TimeUnit.js";
import { InternalError, NotImplementedError, UnexpectedDataError } from "../MatterError.js";
import { Bytes, Endian } from "../util/Bytes.js";
import { DataReader } from "../util/DataReader.js";
import { DataWriter } from "../util/DataWriter.js";
import { ipv4BytesToString, ipv4ToBytes, ipv6BytesToString, ipv6ToBytes, isIPv4, isIPv6 } from "../util/Ip.js";

const logger = Logger.get("DnsCodec");

export const DEFAULT_MDNS_TTL = Seconds(120);

/**
 * The maximum MDNS message size to usually fit into one UDP network MTU packet. Data are split into multiple messages
 * when needed.
 */
export const MAX_MDNS_MESSAGE_SIZE = 1232; // 1280bytes (IPv6 packet size) - 8bytes (UDP header) - 40bytes (IPv6 IP header, IPv4 is only 20bytes)

export const PtrRecord = (
    name: string,
    ptr: string,
    ttl = DEFAULT_MDNS_TTL,
    flushCache = false,
): DnsRecord<string> => ({
    name,
    value: ptr,
    ttl,
    recordType: DnsRecordType.PTR,
    recordClass: DnsRecordClass.IN,
    flushCache,
});
export const ARecord = (name: string, ip: string, ttl = DEFAULT_MDNS_TTL, flushCache = false): DnsRecord<string> => ({
    name,
    value: ip,
    ttl,
    recordType: DnsRecordType.A,
    recordClass: DnsRecordClass.IN,
    flushCache,
});
export const AAAARecord = (
    name: string,
    ip: string,
    ttl = DEFAULT_MDNS_TTL,
    flushCache = false,
): DnsRecord<string> => ({
    name,
    value: ip,
    ttl,
    recordType: DnsRecordType.AAAA,
    recordClass: DnsRecordClass.IN,
    flushCache,
});
export const TxtRecord = (
    name: string,
    entries: string[],
    ttl = DEFAULT_MDNS_TTL,
    flushCache = false,
): DnsRecord<string[]> => ({
    name,
    value: entries,
    ttl,
    recordType: DnsRecordType.TXT,
    recordClass: DnsRecordClass.IN,
    flushCache,
});
export const SrvRecord = (
    name: string,
    srv: SrvRecordValue,
    ttl = DEFAULT_MDNS_TTL,
    flushCache = false,
): DnsRecord<SrvRecordValue> => ({
    name,
    value: srv,
    ttl,
    recordType: DnsRecordType.SRV,
    recordClass: DnsRecordClass.IN,
    flushCache,
});

export type SrvRecordValue = {
    priority: number;
    weight: number;
    port: number;
    target: string;
};

export type DnsQuery = {
    name: string;
    recordType: DnsRecordType;
    recordClass: DnsRecordClass;
    uniCastResponse?: boolean;
};

export type DnsRecord<T = unknown> = {
    name: string;
    recordType: DnsRecordType;
    recordClass: DnsRecordClass;
    flushCache?: boolean;
    ttl: Duration;
    value: T;
};

export type DnsMessage = {
    transactionId: number;
    messageType: DnsMessageType;
    queries: DnsQuery[];
    answers: DnsRecord<any>[];
    authorities: DnsRecord<any>[];
    additionalRecords: DnsRecord<any>[];
};

export type DnsMessagePartiallyPreEncoded = Omit<DnsMessage, "answers" | "additionalRecords"> & {
    answers: (DnsRecord<any> | Bytes)[];
    additionalRecords: (DnsRecord<any> | Bytes)[];
};

/** Bit flags to use to determine separate flags in the DnsMessageType field */
export enum DnsMessageTypeFlag {
    /** Indicates if the message is a query (0) or a reply (1). */
    QR = 0x8000,

    /** The type can be QUERY (standard query, 0), IQUERY (inverse query, 1), or STATUS (server status request, 2). */
    OPCODE = 0x7800,

    /** Authoritative Answer, in a response, indicates if the DNS server is authoritative for the queried hostname. */
    AA = 0x0400,

    /** TrunCation, indicates that this message was truncated due to excessive length. */
    TC = 0x0200,

    /** Recursion Desired, indicates if the client means a recursive query. */
    RD = 0x0100,

    /** Recursion Available, in a response, indicates if the replying DNS server supports recursion. */
    RA = 0x0080,

    /** Authentic Data, in a response, indicates if the replying DNS server verified the data. */
    AD = 0x0020,

    /** Checking Disabled, in a query, indicates that non-verified data is acceptable in a response. */
    CD = 0x0010,

    /** Response code, can be NOERROR (0), FORMERR (1, Format error), SERVFAIL (2), NXDOMAIN (3, Nonexistent domain), etc. */
    RCODE = 0x000f,
}

/** Convenient Message types we use when sending mDNS messages */
export enum DnsMessageType {
    Query = 0, // No bit set
    Response = DnsMessageTypeFlag.QR | DnsMessageTypeFlag.AA, // Authoritative Answer 0x8400
}

export namespace DnsMessageType {
    export function isQuery(type: number) {
        return (type & DnsMessageTypeFlag.QR) === 0;
    }

    export function isResponse(type: number) {
        return (type & DnsMessageTypeFlag.QR) !== 0;
    }
}

export enum DnsRecordType {
    A = 0x01,
    PTR = 0x0c,
    TXT = 0x10,
    AAAA = 0x1c,
    SRV = 0x21,
    NSEC = 0x2f,
    ANY = 0xff,
}

export enum DnsRecordClass {
    IN = 0x01,
    ANY = 0xff,
}

export class DnsCodec {
    static decode(message: Bytes): DnsMessage | undefined {
        try {
            const reader = new DataReader(message);
            const transactionId = reader.readUInt16();
            const messageType = reader.readUInt16();
            const queriesCount = reader.readUInt16();
            const answersCount = reader.readUInt16();
            const authoritiesCount = reader.readUInt16();
            const additionalRecordsCount = reader.readUInt16();
            const queries = new Array<DnsQuery>();
            for (let i = 0; i < queriesCount; i++) {
                queries.push(this.decodeQuery(reader, message));
            }
            const answers = new Array<DnsRecord<any>>();
            for (let i = 0; i < answersCount; i++) {
                answers.push(this.decodeRecord(reader, message));
            }
            const authorities = new Array<DnsRecord<any>>();
            for (let i = 0; i < authoritiesCount; i++) {
                authorities.push(this.decodeRecord(reader, message));
            }
            const additionalRecords = new Array<DnsRecord<any>>();
            for (let i = 0; i < additionalRecordsCount; i++) {
                additionalRecords.push(this.decodeRecord(reader, message));
            }
            return { transactionId, messageType, queries, answers, authorities, additionalRecords };
        } catch (error) {
            return undefined;
        }
    }

    static decodeQuery(reader: DataReader<Endian.Big>, message: Bytes): DnsQuery {
        const name = this.decodeQName(reader, message);
        const recordType = reader.readUInt16();
        const classInt = reader.readUInt16();
        const uniCastResponse = (classInt & 0x8000) !== 0;
        const recordClass = classInt & 0x7fff;
        return { name, recordType, recordClass, uniCastResponse };
    }

    static decodeRecord(reader: DataReader<Endian.Big>, message: Bytes): DnsRecord<any> {
        const name = this.decodeQName(reader, message);
        const recordType = reader.readUInt16();
        const classInt = reader.readUInt16();
        const flushCache = (classInt & 0x8000) !== 0;
        const recordClass = classInt & 0x7fff;
        const ttl = Seconds(reader.readUInt32());
        const valueLength = reader.readUInt16();
        const valueBytes = reader.readByteArray(valueLength);
        const value = this.decodeRecordValue(valueBytes, recordType, message);
        return { name, recordType, recordClass, ttl, value, flushCache };
    }

    static decodeQName(reader: DataReader<Endian.Big>, message: Bytes, visited = new Set<number>()): string {
        if (visited.has(reader.offset)) {
            throw new UnexpectedDataError(`QNAME pointer loop detected. Index ${reader.offset} visited twice.`);
        }
        visited.add(reader.offset);

        const messageReader = new DataReader(message);
        const qNameItems = new Array<string>();
        while (true) {
            const itemLength = reader.readUInt8();
            if (itemLength === 0) break;
            if ((itemLength & 0xc0) !== 0) {
                if (reader.remainingBytesCount < 1) {
                    throw new UnexpectedDataError("QNAME pointer exceeds remaining bytes.");
                }
                // Compressed Qname
                const indexInMessage = reader.readUInt8() | ((itemLength & 0x3f) << 8);
                if (indexInMessage >= messageReader.length) {
                    throw new UnexpectedDataError("Invalid compressed QNAME pointer pointing to out of bounds index.");
                }
                messageReader.offset = indexInMessage;
                qNameItems.push(this.decodeQName(messageReader, message, visited));
                break;
            } else if (reader.remainingBytesCount < itemLength + 1) {
                //  There needs to be a string end 0x00 at the end, so + 1
                throw new UnexpectedDataError(`QNAME item length ${itemLength} exceeds remaining bytes.`);
            }
            qNameItems.push(reader.readUtf8String(itemLength));
        }
        return qNameItems.join(".");
    }

    private static decodeRecordValue(valueBytes: Bytes, recordType: DnsRecordType, message: Bytes) {
        switch (recordType) {
            case DnsRecordType.PTR:
                return this.decodeQName(new DataReader(valueBytes), message);
            case DnsRecordType.SRV:
                return this.decodeSrvRecord(valueBytes, message);
            case DnsRecordType.TXT:
                return this.decodeTxtRecord(valueBytes);
            case DnsRecordType.AAAA:
                return this.decodeAaaaRecord(valueBytes);
            case DnsRecordType.A:
                return this.decodeARecord(valueBytes);
            default:
                // Unknown type, don't decode
                return valueBytes;
        }
    }

    static decodeSrvRecord(valueBytes: Bytes, message: Bytes): SrvRecordValue {
        const reader = new DataReader(valueBytes);
        const priority = reader.readUInt16();
        const weight = reader.readUInt16();
        const port = reader.readUInt16();
        const target = this.decodeQName(reader, message);
        return { priority, weight, port, target };
    }

    static decodeTxtRecord(valueBytes: Bytes): string[] {
        const reader = new DataReader(valueBytes);
        const result = new Array<string>();
        let bytesRead = 0;
        while (bytesRead < valueBytes.byteLength) {
            const length = reader.readUInt8();
            result.push(reader.readUtf8String(length));
            bytesRead += length + 1;
        }
        return result;
    }

    static decodeAaaaRecord(valueBytes: Bytes): string {
        const reader = new DataReader(valueBytes);
        return ipv6BytesToString(reader.readByteArray(16));
    }

    static decodeARecord(valueBytes: Bytes): string {
        const reader = new DataReader(valueBytes);
        return ipv4BytesToString(reader.readByteArray(4));
    }

    static encode({
        messageType,
        transactionId = 0,
        queries = [],
        answers = [],
        authorities = [],
        additionalRecords = [],
    }: Partial<DnsMessagePartiallyPreEncoded>): Bytes {
        if (messageType === undefined) throw new InternalError("Message type must be specified!");
        if (queries.length > 0 && !DnsMessageType.isQuery(messageType))
            throw new InternalError("Queries can only be included in query messages!");
        if (authorities.length > 0) throw new NotImplementedError("Authority answers are not supported yet!");

        const writer = new DataWriter();
        writer.writeUInt16(transactionId);
        writer.writeUInt16(messageType);
        writer.writeUInt16(queries.length);
        writer.writeUInt16(answers.length);
        writer.writeUInt16(authorities.length);
        writer.writeUInt16(additionalRecords.length);
        queries.forEach(({ name, recordClass, recordType, uniCastResponse = false }) => {
            writer.writeByteArray(this.encodeQName(name));
            writer.writeUInt16(recordType);
            writer.writeUInt16(recordClass | (uniCastResponse ? 0x8000 : 0));
        });
        [...answers, ...authorities, ...additionalRecords].forEach(record => {
            if (Bytes.isBytes(record)) {
                writer.writeByteArray(record);
            } else {
                writer.writeByteArray(this.encodeRecord(record));
            }
        });
        return writer.toByteArray();
    }

    static encodeRecord(record: DnsRecord<any>): Bytes {
        const { name, recordType, recordClass, ttl, value, flushCache = false } = record;

        if (recordType === undefined || value === undefined) {
            logger.warn("Skipping record encoding due to missing type or value.", Diagnostic.dict(record));
            return new Uint8Array(0);
        }

        const writer = new DataWriter();
        writer.writeByteArray(this.encodeQName(name));
        writer.writeUInt16(recordType);
        writer.writeUInt16(recordClass | (flushCache ? 0x8000 : 0));
        writer.writeUInt32(Seconds.of(ttl));
        const encodedValue = this.encodeRecordValue(value, recordType);
        writer.writeUInt16(encodedValue.byteLength);
        writer.writeByteArray(encodedValue);
        return writer.toByteArray();
    }

    private static encodeRecordValue(value: any, recordType: DnsRecordType): Bytes {
        switch (recordType) {
            case DnsRecordType.PTR:
                return this.encodeQName(value as string);
            case DnsRecordType.SRV:
                return this.encodeSrvRecord(value as SrvRecordValue);
            case DnsRecordType.TXT:
                return this.encodeTxtRecord(value as string[]);
            case DnsRecordType.AAAA:
                return this.encodeAaaaRecord(value as string);
            case DnsRecordType.A:
                return this.encodeARecord(value as string);
            default:
                if (Bytes.isBytes(value)) return value;
                throw new UnexpectedDataError(`Unsupported record type ${recordType}`);
        }
    }

    static encodeARecord(ip: string) {
        if (!isIPv4(ip)) throw new UnexpectedDataError(`Invalid A Record value: ${ip}`);
        return ipv4ToBytes(ip);
    }

    static encodeAaaaRecord(ip: string) {
        if (!isIPv6(ip)) throw new UnexpectedDataError(`Invalid AAAA Record value: ${ip}`);
        return ipv6ToBytes(ip);
    }

    static encodeTxtRecord(entries: string[]) {
        const writer = new DataWriter();
        entries.forEach(entry => {
            const entryData = Bytes.fromString(entry);
            writer.writeUInt8(entryData.byteLength);
            writer.writeByteArray(entryData);
        });
        return writer.toByteArray();
    }

    static encodeSrvRecord({ priority, weight, port, target }: SrvRecordValue) {
        const writer = new DataWriter();
        writer.writeUInt16(priority);
        writer.writeUInt16(weight);
        writer.writeUInt16(port);
        writer.writeByteArray(this.encodeQName(target));
        return writer.toByteArray();
    }

    static encodeQName(qname: string) {
        const writer = new DataWriter();
        if (qname !== undefined && qname.length > 0) {
            // TODO: Implement compression
            qname.split(".").forEach(label => {
                const labelData = Bytes.fromString(label);
                writer.writeUInt8(labelData.byteLength);
                writer.writeByteArray(labelData);
            });
        }
        writer.writeUInt8(0);
        return writer.toByteArray();
    }
}
