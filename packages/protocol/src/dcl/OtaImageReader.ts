/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Crypto, DataReader, Endian, HashAlgorithm, InternalError, Logger, MatterError } from "#general";
import { OtaImageHeader, TlvOtaImageHeader } from "./OtaImageHeader.js";

const logger = Logger.get("OtaImageReader");

export class OtaImageError extends MatterError {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
    }
}

/**
 * Reader for OTA image files in Matter/DCL format.
 * Supports reading header information, validating payload digest, and extracting payload data.
 */
export class OtaImageReader {
    #crypto?: Crypto;
    #streamReader: ReadableStreamDefaultReader<Bytes>;
    #expectedTotalSize?: bigint;
    #totalSize?: bigint;
    #headerSize?: number;
    #headerData?: OtaImageHeader;
    #fullFileChecksum?: string;
    #fullFileChecksumType: HashAlgorithm = HashAlgorithm.SHA256;

    /** Read only the OTA image header from the stream and returns the  parsed header data. */
    static async header(streamReader: ReadableStreamDefaultReader<Bytes>) {
        const reader = new OtaImageReader(streamReader);
        await reader.#processHeader(false);
        if (reader.#headerData === undefined) {
            throw new InternalError("OTA header not read");
        }
        return reader.#headerData;
    }

    /** Read and validate the full OTA image file from the stream and returns the header data on success. */
    static async file(
        streamReader: ReadableStreamDefaultReader<Bytes>,
        crypto: Crypto,
        expectedTotalSize?: number | bigint,
        options?: {
            /** Calculate full file checksum to validate the full checksum against DCL information (default: true) */
            calculateFullChecksum?: boolean;
            /** Expected checksum type for the full checksum (default: HashAlgorithm.SHA256) */
            checksumType?: HashAlgorithm;
            /** Expected full file checksum to validate against, usually provided by the DCL */
            expectedChecksum?: string;
        },
    ) {
        const reader = new OtaImageReader(streamReader, crypto, expectedTotalSize);
        if (options?.checksumType !== undefined) {
            reader.#fullFileChecksumType = options.checksumType;
        }
        const { headerBytes, remainingData } = await reader.#processHeader(options?.calculateFullChecksum ?? true);
        if (reader.#headerData === undefined) {
            throw new InternalError("OTA header not read");
        }
        await reader.#processPayloadDigest(remainingData, headerBytes, options?.calculateFullChecksum ?? true);

        // Validate checksum if provided
        if (options?.expectedChecksum && reader.#fullFileChecksum !== options.expectedChecksum) {
            throw new OtaImageError(
                `OTA full file checksum mismatch: expected "${options.expectedChecksum}", got "${reader.#fullFileChecksum}"`,
            );
        }

        return reader.#headerData;
    }

    /**
     * Read and validate OTA file, extracting payload to a writable stream.
     * Returns the header information after successful validation and extraction.
     */
    static async extractPayload(
        streamReader: ReadableStreamDefaultReader<Bytes>,
        payloadWriter: WritableStreamDefaultWriter<Bytes>,
        crypto: Crypto,
        expectedTotalSize?: number | bigint,
    ) {
        const reader = new OtaImageReader(streamReader, crypto, expectedTotalSize);
        const { remainingData } = await reader.#processHeader(false);
        if (reader.#headerData === undefined) {
            throw new InternalError("OTA header not read");
        }
        await reader.#extractAndValidatePayload(remainingData, payloadWriter);
        return reader.#headerData;
    }

    constructor(
        streamReader: ReadableStreamDefaultReader<Bytes>,
        crypto?: Crypto,
        expectedTotalSize?: number | bigint,
    ) {
        this.#streamReader = streamReader;
        this.#crypto = crypto;
        this.#expectedTotalSize = expectedTotalSize ? BigInt(expectedTotalSize) : undefined;
    }

    /** Process and read the OTA image header from the stream. */
    async #processHeader(collectHeaderBytes: boolean = false) {
        if (this.#headerData !== undefined) {
            throw new InternalError("OTA header already read.");
        }

        let headerReader: DataReader<Endian.Little> | undefined = undefined;
        const allHeaderBytes: Bytes[] = [];

        while (true) {
            const { value, done } = await this.#streamReader.read();
            if (value === undefined || done) {
                // We are done and have no more data to read which should never happen when we want to read the header
                throw new OtaImageError("OTA file ended unexpectedly");
            }

            if (collectHeaderBytes) {
                allHeaderBytes.push(value);
            }

            // We still need to get the header, so initialize or append to data reader
            if (headerReader !== undefined) {
                headerReader = new DataReader(Bytes.concat(headerReader.remainingBytes, value), Endian.Little);
            } else {
                headerReader = new DataReader(value, Endian.Little);
            }

            // If we have enough data to read the header length details, do so
            if (this.#headerSize === undefined && headerReader.remainingBytesCount >= 16) {
                const fileIdentifier = headerReader.readUInt32();
                if (fileIdentifier !== 0x1beef11e) {
                    throw new OtaImageError("Invalid OTA file identifier");
                }
                this.#totalSize = headerReader.readUInt64();
                if (this.#expectedTotalSize !== undefined && this.#totalSize !== this.#expectedTotalSize) {
                    throw new OtaImageError(
                        `OTA file size mismatch: expected ${this.#expectedTotalSize}, got ${this.#totalSize}`,
                    );
                }
                this.#headerSize = headerReader.readUInt32();
            }

            // If we have enough data to read the full header, do so
            if (
                this.#headerData === undefined &&
                this.#headerSize !== undefined &&
                headerReader.remainingBytesCount >= this.#headerSize
            ) {
                const data = headerReader.readByteArray(this.#headerSize);
                logger.debug(`OTA Header read, size=${this.#headerSize} bytes`, data);
                this.#headerData = TlvOtaImageHeader.decode(data);
                const remainingBytes = headerReader.remainingBytes;

                // Calculate actual header bytes (everything except remaining payload data)
                let headerBytes: Bytes | undefined = undefined;
                if (collectHeaderBytes && allHeaderBytes.length > 0) {
                    const totalHeaderAndRemaining = Bytes.of(Bytes.concat(...allHeaderBytes));
                    const headerOnlyLength = totalHeaderAndRemaining.byteLength - remainingBytes.byteLength;
                    headerBytes = totalHeaderAndRemaining.subarray(0, headerOnlyLength);
                }

                return { headerBytes, remainingData: remainingBytes };
            }
        }
    }

    /** Process and validate the OTA image payload digest from the stream. */
    async #processPayloadDigest(
        initialPayloadData?: Bytes,
        headerBytes?: Bytes,
        calculateFullChecksum: boolean = false,
    ) {
        if (this.#headerData === undefined) {
            throw new InternalError("OTA header not read");
        }
        if (this.#crypto === undefined) {
            throw new InternalError("No crypto implementation provided");
        }

        const { imageDigestType, imageDigest, payloadSize } = this.#headerData;

        let readPayloadSize = 0n;
        const streamReader = this.#streamReader;

        const payloadIterator = async function* (headerBytes?: Bytes) {
            if (headerBytes !== undefined) {
                // First yield the header
                yield headerBytes;
            }

            if (initialPayloadData !== undefined) {
                readPayloadSize += BigInt(initialPayloadData.byteLength);
                yield initialPayloadData;
            }
            while (true) {
                const { value, done } = await streamReader.read();
                if (value === undefined || done) {
                    break;
                }
                readPayloadSize += BigInt(value.byteLength);
                yield value;
            }
        };

        if (calculateFullChecksum && headerBytes !== undefined) {
            // When downloading: compute full file checksum (header + payload) to verify download integrity.
            // The internal payload digest will be verified later during usage and should be included by checking the
            // outer checksum.
            const fullChecksum = await this.#crypto.computeHash(
                this.#fullFileChecksumType,
                payloadIterator(headerBytes),
            );
            this.#fullFileChecksum = Bytes.toBase64(Bytes.of(fullChecksum));

            // Verify payload size
            if (readPayloadSize !== BigInt(payloadSize)) {
                throw new OtaImageError(`OTA payload size mismatch: expected ${payloadSize}, got ${readPayloadSize}`);
            }
        } else {
            // Else verify the internal payload digest to ensure payload integrity.
            const hashBytes = await this.#crypto.computeHash(imageDigestType as HashAlgorithm, payloadIterator());

            if (readPayloadSize !== BigInt(payloadSize)) {
                throw new OtaImageError(`OTA payload size mismatch: expected ${payloadSize}, got ${readPayloadSize}`);
            }

            if (!Bytes.areEqual(hashBytes, imageDigest)) {
                throw new OtaImageError(
                    `OTA file digest mismatch "${Bytes.toHex(hashBytes)}" vs. "${Bytes.toHex(imageDigest)}"`,
                );
            }
        }
    }

    /** Extract the OTA image payload to a writable stream while validating its digest. */
    async #extractAndValidatePayload(
        initialPayloadData: Bytes | undefined,
        payloadWriter: WritableStreamDefaultWriter<Bytes>,
    ) {
        if (this.#headerData === undefined) {
            throw new InternalError("OTA header not read");
        }
        if (this.#crypto === undefined) {
            throw new InternalError("No crypto implementation provided");
        }

        const { imageDigestType, imageDigest, payloadSize } = this.#headerData;
        if (imageDigestType !== 1) {
            throw new InternalError(`Unsupported image digest type ${imageDigestType}`);
        }

        let readPayloadSize = 0n;

        const streamReader = this.#streamReader;
        const iterator = async function* () {
            if (initialPayloadData !== undefined) {
                readPayloadSize += BigInt(initialPayloadData.byteLength);
                await payloadWriter.write(initialPayloadData);
                yield initialPayloadData;
            }
            while (true) {
                const { value, done } = await streamReader.read();
                if (value === undefined || done) {
                    break;
                }
                readPayloadSize += BigInt(value.byteLength);
                await payloadWriter.write(value);
                yield value;
            }
        };

        const hashBytes = await this.#crypto.computeHash(imageDigestType as HashAlgorithm, iterator());

        if (readPayloadSize !== BigInt(payloadSize)) {
            throw new OtaImageError(`OTA payload size mismatch: expected ${payloadSize}, got ${readPayloadSize}`);
        }

        if (!Bytes.areEqual(hashBytes, imageDigest)) {
            throw new OtaImageError(
                `OTA file digest mismatch "${Bytes.toHex(hashBytes)}" vs. "${Bytes.toHex(imageDigest)}"`,
            );
        }

        await payloadWriter.close();
    }
}
