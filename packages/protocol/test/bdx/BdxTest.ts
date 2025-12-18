import {
    BdxBlockEofMessage,
    BdxBlockQueryMessage,
    BdxBlockQueryWithSkip,
    BdxBlockQueryWithSkipMessage,
    BdxClient,
    BdxError,
    BdxReceiveInitMessage,
    BdxStatusResponseError,
    Flow,
} from "#bdx/index.js";
import { PersistedFileDesignator } from "#bdx/PersistedFileDesignator.js";
import { Bytes, StandardCrypto } from "#general";
import { BdxMessageType, BdxStatusCode, GeneralStatusCode, SecureMessageType } from "#types";
import { bdxTransfer } from "./bdx-helpers.js";

describe("BdxTest", () => {
    const crypto = new StandardCrypto(); // For random data generation

    describe("Successful transfers", () => {
        describe("2048bytes (3 packages)", () => {
            it("Using SendInit as Sender-Driver (no limits)", async () => {
                const data = crypto.randomBytes(2048);

                let fd: PersistedFileDesignator;
                await bdxTransfer({
                    prepare: (clientStorage, _serverStorage, messenger) => {
                        fd = new PersistedFileDesignator("data", clientStorage);
                        clientStorage.context.set("data", data);

                        return {
                            bdxClient: BdxClient.asSender(messenger, { fileDesignator: fd }),
                            expectedInitialMessageType: BdxMessageType.SendInit,
                        };
                    },
                    validate: async (_clientStorage, serverStorage, { clientExchangeData, serverExchangeData }) => {
                        expect(clientExchangeData.length).equals(4);
                        expect(serverExchangeData.length).equals(4);
                        expect(clientExchangeData[0].type).equals(BdxMessageType.SendInit);
                        expect(clientExchangeData[0].data).deep.equals({
                            transferProtocol: {
                                version: 0,
                                senderDrive: true,
                                receiverDrive: true,
                                asynchronousTransfer: false,
                            },
                            maxBlockSize: 966,
                            fileDesignator: fd.bytes,
                            maxLength: 2048,
                            metaData: undefined,
                            startOffset: undefined,
                        });
                        expect(serverExchangeData[0].type).equals(BdxMessageType.SendAccept);
                        expect(serverExchangeData[0].data).deep.equals({
                            transferControl: {
                                version: 0,
                                senderDrive: true,
                                receiverDrive: false,
                                asynchronousTransfer: false,
                            },
                            maxBlockSize: 966,
                            metaData: undefined,
                        });

                        expect(clientExchangeData[1].type).equals(BdxMessageType.Block);
                        expect(clientExchangeData[1].data.blockCounter).equals(0);
                        expect(clientExchangeData[1].data.data.length).equals(966);

                        expect(serverExchangeData[1].type).equals(BdxMessageType.BlockAck);
                        expect(serverExchangeData[1].data.blockCounter).equals(0);

                        expect(clientExchangeData[2].type).equals(BdxMessageType.Block);
                        expect(clientExchangeData[2].data.blockCounter).equals(1);
                        expect(clientExchangeData[2].data.data.length).equals(966);

                        expect(serverExchangeData[2].type).equals(BdxMessageType.BlockAck);
                        expect(serverExchangeData[2].data.blockCounter).equals(1);

                        expect(clientExchangeData[3].type).equals(BdxMessageType.BlockEof);
                        expect(clientExchangeData[3].data.blockCounter).equals(2);
                        expect(clientExchangeData[3].data.data.length).equals(116);

                        expect(serverExchangeData[3].type).equals(BdxMessageType.BlockAckEof);
                        expect(serverExchangeData[3].data.blockCounter).equals(2);

                        const receivedData = await serverStorage.context.get(fd.blobName);
                        expect(receivedData).to.deep.equal(data);
                    },
                });
            });

            it("Using SendInit as Receiver-Driver (by Initiator)", async () => {
                const data = crypto.randomBytes(2048);

                let fd: PersistedFileDesignator;
                await bdxTransfer({
                    prepare: (clientStorage, _serverStorage, messenger) => {
                        fd = new PersistedFileDesignator("data", clientStorage);
                        clientStorage.context.set("data", data);

                        return {
                            bdxClient: BdxClient.asSender(messenger, {
                                fileDesignator: fd,
                                preferredDriverModes: [Flow.DriverMode.ReceiverDrive],
                            }),
                            expectedInitialMessageType: BdxMessageType.SendInit,
                        };
                    },
                    validate: async (_clientStorage, serverStorage, { clientExchangeData, serverExchangeData }) => {
                        expect(clientExchangeData.length).equals(4);
                        expect(serverExchangeData.length).equals(5);

                        expect(clientExchangeData[0].type).equals(BdxMessageType.SendInit);
                        expect(clientExchangeData[0].data).deep.equals({
                            transferProtocol: {
                                version: 0,
                                senderDrive: false,
                                receiverDrive: true,
                                asynchronousTransfer: false,
                            },
                            maxBlockSize: 966,
                            fileDesignator: fd.bytes,
                            maxLength: 2048,
                            metaData: undefined,
                            startOffset: undefined,
                        });

                        expect(serverExchangeData[0].type).equals(BdxMessageType.SendAccept);
                        expect(serverExchangeData[0].data).deep.equals({
                            transferControl: {
                                version: 0,
                                senderDrive: false,
                                receiverDrive: true,
                                asynchronousTransfer: false,
                            },
                            maxBlockSize: 966,
                            metaData: undefined,
                        });

                        expect(serverExchangeData[1].type).equals(BdxMessageType.BlockQuery);
                        expect(serverExchangeData[1].data.blockCounter).equals(0);

                        expect(clientExchangeData[1].type).equals(BdxMessageType.Block);
                        expect(clientExchangeData[1].data.blockCounter).equals(0);
                        expect(clientExchangeData[1].data.data.length).equals(966);

                        expect(serverExchangeData[2].type).equals(BdxMessageType.BlockQuery);
                        expect(serverExchangeData[2].data.blockCounter).equals(1);

                        expect(clientExchangeData[2].type).equals(BdxMessageType.Block);
                        expect(clientExchangeData[2].data.blockCounter).equals(1);
                        expect(clientExchangeData[2].data.data.length).equals(966);

                        expect(serverExchangeData[3].type).equals(BdxMessageType.BlockQuery);
                        expect(serverExchangeData[3].data.blockCounter).equals(2);

                        expect(clientExchangeData[3].type).equals(BdxMessageType.BlockEof);
                        expect(clientExchangeData[3].data.blockCounter).equals(2);
                        expect(clientExchangeData[3].data.data.length).equals(116);

                        expect(serverExchangeData[4].type).equals(BdxMessageType.BlockAckEof);
                        expect(serverExchangeData[4].data.blockCounter).equals(2);

                        const receivedData = await serverStorage.context.get(fd.blobName);
                        expect(receivedData).to.deep.equal(data);
                    },
                });
            });

            it("Using SendInit as Receiver-Driver (by Responder and custom transfer designator)", async () => {
                const data = crypto.randomBytes(2048);

                let fd: PersistedFileDesignator;
                let transferFd: PersistedFileDesignator;
                await bdxTransfer({
                    prepare: (clientStorage, _serverStorage, messenger) => {
                        fd = new PersistedFileDesignator("data2", clientStorage);
                        transferFd = new PersistedFileDesignator("data", clientStorage);
                        clientStorage.context.set("data2", data);

                        return {
                            bdxClient: BdxClient.asSender(messenger, {
                                fileDesignator: fd,
                                transferFileDesignator: transferFd,
                            }),
                            expectedInitialMessageType: BdxMessageType.SendInit,
                            serverLimits: {
                                preferredDriverModes: [Flow.DriverMode.ReceiverDrive],
                            },
                        };
                    },
                    validate: async (_clientStorage, serverStorage, { clientExchangeData, serverExchangeData }) => {
                        expect(clientExchangeData.length).equals(4);
                        expect(serverExchangeData.length).equals(5);

                        expect(clientExchangeData[0].type).equals(BdxMessageType.SendInit);
                        expect(clientExchangeData[0].data).deep.equals({
                            transferProtocol: {
                                version: 0,
                                senderDrive: true,
                                receiverDrive: true,
                                asynchronousTransfer: false,
                            },
                            maxBlockSize: 966,
                            fileDesignator: transferFd.bytes,
                            maxLength: 2048,
                            metaData: undefined,
                            startOffset: undefined,
                        });

                        expect(serverExchangeData[0].type).equals(BdxMessageType.SendAccept);
                        expect(serverExchangeData[0].data).deep.equals({
                            transferControl: {
                                version: 0,
                                senderDrive: false,
                                receiverDrive: true,
                                asynchronousTransfer: false,
                            },
                            maxBlockSize: 966,
                            metaData: undefined,
                        });

                        // No need to test all details again because tested with former test already

                        const receivedData = await serverStorage.context.get(transferFd.blobName);
                        expect(receivedData).to.deep.equal(data);
                    },
                });
            });

            it("Using ReceiveInit as Sender-Driver (no limits and custom transfer File Designator)", async () => {
                const data = crypto.randomBytes(2048);

                let fd: PersistedFileDesignator;
                let transferFd: PersistedFileDesignator;
                await bdxTransfer({
                    prepare: (clientStorage, serverStorage, messenger) => {
                        fd = new PersistedFileDesignator("data", clientStorage);
                        transferFd = new PersistedFileDesignator("data2", clientStorage);
                        serverStorage.context.set("data2", data);

                        return {
                            bdxClient: BdxClient.asReceiver(messenger, {
                                fileDesignator: fd,
                                transferFileDesignator: transferFd,
                            }),
                            expectedInitialMessageType: BdxMessageType.ReceiveInit,
                        };
                    },
                    validate: async (clientStorage, _serverStorage, { clientExchangeData, serverExchangeData }) => {
                        expect(clientExchangeData.length).equals(4);
                        expect(serverExchangeData.length).equals(4);

                        expect(clientExchangeData[0].type).equals(BdxMessageType.ReceiveInit);
                        expect(clientExchangeData[0].data).deep.equals({
                            transferProtocol: {
                                version: 0,
                                senderDrive: true,
                                receiverDrive: true,
                                asynchronousTransfer: false,
                            },
                            maxBlockSize: 966,
                            fileDesignator: transferFd.bytes,
                            maxLength: undefined,
                            metaData: undefined,
                            startOffset: undefined,
                        });

                        expect(serverExchangeData[0].type).equals(BdxMessageType.ReceiveAccept);
                        expect(serverExchangeData[0].data).deep.equals({
                            transferControl: {
                                version: 0,
                                senderDrive: true,
                                receiverDrive: false,
                                asynchronousTransfer: false,
                            },
                            maxBlockSize: 966,
                            metaData: undefined,
                            length: undefined,
                        });

                        expect(serverExchangeData[1].type).equals(BdxMessageType.Block);
                        expect(serverExchangeData[1].data.blockCounter).equals(0);
                        expect(serverExchangeData[1].data.data.length).equals(966);

                        expect(clientExchangeData[1].type).equals(BdxMessageType.BlockAck);
                        expect(clientExchangeData[1].data.blockCounter).equals(0);

                        expect(serverExchangeData[2].type).equals(BdxMessageType.Block);
                        expect(serverExchangeData[2].data.blockCounter).equals(1);
                        expect(serverExchangeData[2].data.data.length).equals(966);

                        expect(clientExchangeData[2].type).equals(BdxMessageType.BlockAck);
                        expect(clientExchangeData[2].data.blockCounter).equals(1);

                        expect(serverExchangeData[3].type).equals(BdxMessageType.BlockEof);
                        expect(serverExchangeData[3].data.blockCounter).equals(2);
                        expect(serverExchangeData[3].data.data.length).equals(116);

                        expect(clientExchangeData[3].type).equals(BdxMessageType.BlockAckEof);
                        expect(clientExchangeData[3].data.blockCounter).equals(2);

                        const receivedData = await clientStorage.context.get(fd.blobName);
                        expect(receivedData).to.deep.equal(data);
                    },
                });
            });

            it("Using ReceiveInit as Receiver-Driver (by Initiator)", async () => {
                const data = crypto.randomBytes(2048);

                let fd: PersistedFileDesignator;
                await bdxTransfer({
                    prepare: (clientStorage, serverStorage, messenger) => {
                        fd = new PersistedFileDesignator("data", clientStorage);
                        serverStorage.context.set("data", data);

                        return {
                            bdxClient: BdxClient.asReceiver(messenger, {
                                fileDesignator: fd,
                                preferredDriverModes: [Flow.DriverMode.ReceiverDrive],
                            }),
                            expectedInitialMessageType: BdxMessageType.ReceiveInit,
                        };
                    },
                    validate: async (clientStorage, _serverStorage, { clientExchangeData, serverExchangeData }) => {
                        expect(clientExchangeData.length).equals(5);
                        expect(serverExchangeData.length).equals(4);

                        expect(clientExchangeData[0].type).equals(BdxMessageType.ReceiveInit);
                        expect(clientExchangeData[0].data).deep.equals({
                            transferProtocol: {
                                version: 0,
                                senderDrive: false,
                                receiverDrive: true,
                                asynchronousTransfer: false,
                            },
                            maxBlockSize: 966,
                            fileDesignator: fd.bytes,
                            maxLength: undefined,
                            metaData: undefined,
                            startOffset: undefined,
                        });

                        expect(serverExchangeData[0].type).equals(BdxMessageType.ReceiveAccept);
                        expect(serverExchangeData[0].data).deep.equals({
                            transferControl: {
                                version: 0,
                                senderDrive: false,
                                receiverDrive: true,
                                asynchronousTransfer: false,
                            },
                            maxBlockSize: 966,
                            metaData: undefined,
                            length: undefined,
                        });

                        expect(clientExchangeData[1].type).equals(BdxMessageType.BlockQuery);
                        expect(clientExchangeData[1].data.blockCounter).equals(0);

                        expect(serverExchangeData[1].type).equals(BdxMessageType.Block);
                        expect(serverExchangeData[1].data.blockCounter).equals(0);
                        expect(serverExchangeData[1].data.data.length).equals(966);

                        expect(clientExchangeData[2].type).equals(BdxMessageType.BlockQuery);
                        expect(clientExchangeData[2].data.blockCounter).equals(1);

                        expect(serverExchangeData[2].type).equals(BdxMessageType.Block);
                        expect(serverExchangeData[2].data.blockCounter).equals(1);
                        expect(serverExchangeData[2].data.data.length).equals(966);

                        expect(clientExchangeData[3].type).equals(BdxMessageType.BlockQuery);
                        expect(clientExchangeData[3].data.blockCounter).equals(2);

                        expect(serverExchangeData[3].type).equals(BdxMessageType.BlockEof);
                        expect(serverExchangeData[3].data.blockCounter).equals(2);
                        expect(serverExchangeData[3].data.data.length).equals(116);

                        expect(clientExchangeData[4].type).equals(BdxMessageType.BlockAckEof);
                        expect(clientExchangeData[4].data.blockCounter).equals(2);

                        const receivedData = await clientStorage.context.get(fd.blobName);
                        expect(receivedData).to.deep.equal(data);
                    },
                });
            });

            it("Using ReceiveInit as Receiver-Driver (by Responder)", async () => {
                const data = crypto.randomBytes(2048);

                let fd: PersistedFileDesignator;
                await bdxTransfer({
                    prepare: (clientStorage, serverStorage, messenger) => {
                        fd = new PersistedFileDesignator("data", clientStorage);
                        serverStorage.context.set("data", data);

                        return {
                            bdxClient: BdxClient.asReceiver(messenger, { fileDesignator: fd }),
                            expectedInitialMessageType: BdxMessageType.ReceiveInit,
                            serverLimits: {
                                preferredDriverModes: [Flow.DriverMode.ReceiverDrive],
                            },
                        };
                    },
                    validate: async (clientStorage, _serverStorage, { clientExchangeData, serverExchangeData }) => {
                        expect(clientExchangeData.length).equals(5);
                        expect(serverExchangeData.length).equals(4);

                        expect(clientExchangeData[0].type).equals(BdxMessageType.ReceiveInit);
                        expect(clientExchangeData[0].data).deep.equals({
                            transferProtocol: {
                                version: 0,
                                senderDrive: true,
                                receiverDrive: true,
                                asynchronousTransfer: false,
                            },
                            maxBlockSize: 966,
                            fileDesignator: fd.bytes,
                            maxLength: undefined,
                            metaData: undefined,
                            startOffset: undefined,
                        });

                        expect(serverExchangeData[0].type).equals(BdxMessageType.ReceiveAccept);
                        expect(serverExchangeData[0].data).deep.equals({
                            transferControl: {
                                version: 0,
                                senderDrive: false,
                                receiverDrive: true,
                                asynchronousTransfer: false,
                            },
                            maxBlockSize: 966,
                            metaData: undefined,
                            length: undefined,
                        });

                        // No need to test details here again

                        const receivedData = await clientStorage.context.get(fd.blobName);
                        expect(receivedData).to.deep.equal(data);
                    },
                });
            });
        });

        describe("1932bytes (exactly 2 packages)", () => {
            it("Using SendInit as Sender-Driver (no limits)", async () => {
                const data = crypto.randomBytes(1932);

                let fd: PersistedFileDesignator;
                await bdxTransfer({
                    prepare: (clientStorage, _serverStorage, messenger) => {
                        fd = new PersistedFileDesignator("data", clientStorage);
                        clientStorage.context.set("data", data);

                        return {
                            bdxClient: BdxClient.asSender(messenger, { fileDesignator: fd }),
                            expectedInitialMessageType: BdxMessageType.SendInit,
                        };
                    },
                    validate: async (_clientStorage, serverStorage, { clientExchangeData, serverExchangeData }) => {
                        expect(clientExchangeData.length).equals(3);
                        expect(serverExchangeData.length).equals(3);
                        expect(clientExchangeData[0].type).equals(BdxMessageType.SendInit);
                        expect(clientExchangeData[0].data).deep.equals({
                            transferProtocol: {
                                version: 0,
                                senderDrive: true,
                                receiverDrive: true,
                                asynchronousTransfer: false,
                            },
                            maxBlockSize: 966,
                            fileDesignator: fd.bytes,
                            maxLength: 1932,
                            metaData: undefined,
                            startOffset: undefined,
                        });
                        expect(serverExchangeData[0].type).equals(BdxMessageType.SendAccept);
                        expect(serverExchangeData[0].data).deep.equals({
                            transferControl: {
                                version: 0,
                                senderDrive: true,
                                receiverDrive: false,
                                asynchronousTransfer: false,
                            },
                            maxBlockSize: 966,
                            metaData: undefined,
                        });
                        expect(clientExchangeData[1].type).equals(BdxMessageType.Block);
                        expect(clientExchangeData[1].data.blockCounter).equals(0);
                        expect(clientExchangeData[1].data.data.length).equals(966);

                        expect(serverExchangeData[1].type).equals(BdxMessageType.BlockAck);
                        expect(serverExchangeData[1].data.blockCounter).equals(0);

                        expect(clientExchangeData[2].type).equals(BdxMessageType.BlockEof);
                        expect(clientExchangeData[2].data.blockCounter).equals(1);
                        expect(clientExchangeData[2].data.data.length).equals(966);

                        expect(serverExchangeData[2].type).equals(BdxMessageType.BlockAckEof);
                        expect(serverExchangeData[2].data.blockCounter).equals(1);

                        const receivedData = await serverStorage.context.get(fd.blobName);
                        expect(receivedData).to.deep.equal(data);
                    },
                });
            });

            it("Using SendInit as Receiver-Driver (by Initiator)", async () => {
                const data = crypto.randomBytes(1932);

                let fd: PersistedFileDesignator;
                await bdxTransfer({
                    prepare: (clientStorage, _serverStorage, messenger) => {
                        fd = new PersistedFileDesignator("data", clientStorage);
                        clientStorage.context.set("data", data);

                        return {
                            bdxClient: BdxClient.asSender(messenger, {
                                fileDesignator: fd,
                                preferredDriverModes: [Flow.DriverMode.ReceiverDrive],
                            }),
                            expectedInitialMessageType: BdxMessageType.SendInit,
                        };
                    },
                    validate: async (_clientStorage, serverStorage, { clientExchangeData, serverExchangeData }) => {
                        expect(clientExchangeData.length).equals(3);
                        expect(serverExchangeData.length).equals(4);

                        expect(clientExchangeData[0].type).equals(BdxMessageType.SendInit);
                        expect(clientExchangeData[0].data).deep.equals({
                            transferProtocol: {
                                version: 0,
                                senderDrive: false,
                                receiverDrive: true,
                                asynchronousTransfer: false,
                            },
                            maxBlockSize: 966,
                            fileDesignator: fd.bytes,
                            maxLength: 1932,
                            metaData: undefined,
                            startOffset: undefined,
                        });

                        expect(serverExchangeData[0].type).equals(BdxMessageType.SendAccept);
                        expect(serverExchangeData[0].data).deep.equals({
                            transferControl: {
                                version: 0,
                                senderDrive: false,
                                receiverDrive: true,
                                asynchronousTransfer: false,
                            },
                            maxBlockSize: 966,
                            metaData: undefined,
                        });

                        expect(serverExchangeData[1].type).equals(BdxMessageType.BlockQuery);
                        expect(serverExchangeData[1].data.blockCounter).equals(0);

                        expect(clientExchangeData[1].type).equals(BdxMessageType.Block);
                        expect(clientExchangeData[1].data.blockCounter).equals(0);
                        expect(clientExchangeData[1].data.data.length).equals(966);

                        expect(serverExchangeData[2].type).equals(BdxMessageType.BlockQuery);
                        expect(serverExchangeData[2].data.blockCounter).equals(1);

                        expect(clientExchangeData[2].type).equals(BdxMessageType.BlockEof);
                        expect(clientExchangeData[2].data.blockCounter).equals(1);
                        expect(clientExchangeData[2].data.data.length).equals(966);

                        expect(serverExchangeData[3].type).equals(BdxMessageType.BlockAckEof);
                        expect(serverExchangeData[3].data.blockCounter).equals(1);

                        const receivedData = await serverStorage.context.get(fd.blobName);
                        expect(receivedData).to.deep.equal(data);
                    },
                });
            });

            it("Using ReceiveInit as Sender-Driver (no limits)", async () => {
                const data = crypto.randomBytes(1932);

                let fd: PersistedFileDesignator;
                await bdxTransfer({
                    prepare: (clientStorage, serverStorage, messenger) => {
                        fd = new PersistedFileDesignator("data", clientStorage);
                        serverStorage.context.set("data", data);

                        return {
                            bdxClient: BdxClient.asReceiver(messenger, { fileDesignator: fd }),
                            expectedInitialMessageType: BdxMessageType.ReceiveInit,
                        };
                    },
                    validate: async (clientStorage, _serverStorage, { clientExchangeData, serverExchangeData }) => {
                        expect(clientExchangeData.length).equals(4);
                        expect(serverExchangeData.length).equals(4);

                        expect(clientExchangeData[0].type).equals(BdxMessageType.ReceiveInit);
                        expect(clientExchangeData[0].data).deep.equals({
                            transferProtocol: {
                                version: 0,
                                senderDrive: true,
                                receiverDrive: true,
                                asynchronousTransfer: false,
                            },
                            maxBlockSize: 966,
                            fileDesignator: fd.bytes,
                            maxLength: undefined,
                            metaData: undefined,
                            startOffset: undefined,
                        });

                        expect(serverExchangeData[0].type).equals(BdxMessageType.ReceiveAccept);
                        expect(serverExchangeData[0].data).deep.equals({
                            transferControl: {
                                version: 0,
                                senderDrive: true,
                                receiverDrive: false,
                                asynchronousTransfer: false,
                            },
                            maxBlockSize: 966,
                            metaData: undefined,
                            length: undefined,
                        });

                        expect(serverExchangeData[1].type).equals(BdxMessageType.Block);
                        expect(serverExchangeData[1].data.blockCounter).equals(0);
                        expect(serverExchangeData[1].data.data.length).equals(966);

                        expect(clientExchangeData[1].type).equals(BdxMessageType.BlockAck);
                        expect(clientExchangeData[1].data.blockCounter).equals(0);

                        expect(serverExchangeData[2].type).equals(BdxMessageType.Block);
                        expect(serverExchangeData[2].data.blockCounter).equals(1);
                        expect(serverExchangeData[2].data.data.length).equals(966);

                        expect(clientExchangeData[2].type).equals(BdxMessageType.BlockAck);
                        expect(clientExchangeData[2].data.blockCounter).equals(1);

                        expect(serverExchangeData[3].type).equals(BdxMessageType.BlockEof);
                        expect(serverExchangeData[3].data.blockCounter).equals(2);
                        expect(serverExchangeData[3].data.data.length).equals(0);

                        expect(clientExchangeData[3].type).equals(BdxMessageType.BlockAckEof);
                        expect(clientExchangeData[3].data.blockCounter).equals(2);

                        const receivedData = await clientStorage.context.get(fd.blobName);
                        expect(receivedData).to.deep.equal(data);
                    },
                });
            });

            it("Using ReceiveInit as Receiver-Driver (by Initiator)", async () => {
                const data = crypto.randomBytes(1932);

                let fd: PersistedFileDesignator;
                await bdxTransfer({
                    prepare: (clientStorage, serverStorage, messenger) => {
                        fd = new PersistedFileDesignator("data", clientStorage);
                        serverStorage.context.set("data", data);

                        return {
                            bdxClient: BdxClient.asReceiver(messenger, {
                                fileDesignator: fd,
                                preferredDriverModes: [Flow.DriverMode.ReceiverDrive],
                            }),
                            expectedInitialMessageType: BdxMessageType.ReceiveInit,
                        };
                    },
                    validate: async (clientStorage, _serverStorage, { clientExchangeData, serverExchangeData }) => {
                        expect(clientExchangeData.length).equals(5);
                        expect(serverExchangeData.length).equals(4);

                        expect(clientExchangeData[0].type).equals(BdxMessageType.ReceiveInit);
                        expect(clientExchangeData[0].data).deep.equals({
                            transferProtocol: {
                                version: 0,
                                senderDrive: false,
                                receiverDrive: true,
                                asynchronousTransfer: false,
                            },
                            maxBlockSize: 966,
                            fileDesignator: fd.bytes,
                            maxLength: undefined,
                            metaData: undefined,
                            startOffset: undefined,
                        });

                        expect(serverExchangeData[0].type).equals(BdxMessageType.ReceiveAccept);
                        expect(serverExchangeData[0].data).deep.equals({
                            transferControl: {
                                version: 0,
                                senderDrive: false,
                                receiverDrive: true,
                                asynchronousTransfer: false,
                            },
                            maxBlockSize: 966,
                            metaData: undefined,
                            length: undefined,
                        });

                        expect(clientExchangeData[1].type).equals(BdxMessageType.BlockQuery);
                        expect(clientExchangeData[1].data.blockCounter).equals(0);

                        expect(serverExchangeData[1].type).equals(BdxMessageType.Block);
                        expect(serverExchangeData[1].data.blockCounter).equals(0);
                        expect(serverExchangeData[1].data.data.length).equals(966);

                        expect(clientExchangeData[2].type).equals(BdxMessageType.BlockQuery);
                        expect(clientExchangeData[2].data.blockCounter).equals(1);

                        expect(serverExchangeData[2].type).equals(BdxMessageType.Block);
                        expect(serverExchangeData[2].data.blockCounter).equals(1);
                        expect(serverExchangeData[2].data.data.length).equals(966);

                        expect(clientExchangeData[3].type).equals(BdxMessageType.BlockQuery);
                        expect(clientExchangeData[3].data.blockCounter).equals(2);

                        expect(serverExchangeData[3].type).equals(BdxMessageType.BlockEof);
                        expect(serverExchangeData[3].data.blockCounter).equals(2);
                        expect(serverExchangeData[3].data.data.length).equals(0);

                        expect(clientExchangeData[4].type).equals(BdxMessageType.BlockAckEof);
                        expect(clientExchangeData[4].data.blockCounter).equals(2);

                        const receivedData = await clientStorage.context.get(fd.blobName);
                        expect(receivedData).to.deep.equal(data);
                    },
                });
            });
        });

        describe("256bytes (1 package)", () => {
            it("Using SendInit as Sender-Driver (no limits)", async () => {
                const data = crypto.randomBytes(256);

                let fd: PersistedFileDesignator;
                await bdxTransfer({
                    prepare: (clientStorage, _serverStorage, messenger) => {
                        fd = new PersistedFileDesignator("data", clientStorage);
                        clientStorage.context.set("data", data);

                        return {
                            bdxClient: BdxClient.asSender(messenger, { fileDesignator: fd }),
                            expectedInitialMessageType: BdxMessageType.SendInit,
                        };
                    },
                    validate: async (_clientStorage, serverStorage, { clientExchangeData, serverExchangeData }) => {
                        expect(clientExchangeData.length).equals(2);
                        expect(serverExchangeData.length).equals(2);
                        expect(clientExchangeData[0].type).equals(BdxMessageType.SendInit);
                        expect(clientExchangeData[0].data).deep.equals({
                            transferProtocol: {
                                version: 0,
                                senderDrive: true,
                                receiverDrive: true,
                                asynchronousTransfer: false,
                            },
                            maxBlockSize: 966,
                            fileDesignator: fd.bytes,
                            maxLength: 256,
                            metaData: undefined,
                            startOffset: undefined,
                        });
                        expect(serverExchangeData[0].type).equals(BdxMessageType.SendAccept);
                        expect(serverExchangeData[0].data).deep.equals({
                            transferControl: {
                                version: 0,
                                senderDrive: true,
                                receiverDrive: false,
                                asynchronousTransfer: false,
                            },
                            maxBlockSize: 966,
                            metaData: undefined,
                        });
                        expect(clientExchangeData[1].type).equals(BdxMessageType.BlockEof);
                        expect(clientExchangeData[1].data.blockCounter).equals(0);
                        expect(clientExchangeData[1].data.data.length).equals(256);

                        expect(serverExchangeData[1].type).equals(BdxMessageType.BlockAckEof);
                        expect(serverExchangeData[1].data.blockCounter).equals(0);

                        const receivedData = await serverStorage.context.get(fd.blobName);
                        expect(receivedData).to.deep.equal(data);
                    },
                });
            });

            it("Using SendInit as Receiver-Driver (by Initiator)", async () => {
                const data = crypto.randomBytes(256);

                let fd: PersistedFileDesignator;
                await bdxTransfer({
                    prepare: (clientStorage, _serverStorage, messenger) => {
                        fd = new PersistedFileDesignator("data", clientStorage);
                        clientStorage.context.set("data", data);

                        return {
                            bdxClient: BdxClient.asSender(messenger, {
                                fileDesignator: fd,
                                preferredDriverModes: [Flow.DriverMode.ReceiverDrive],
                            }),
                            expectedInitialMessageType: BdxMessageType.SendInit,
                        };
                    },
                    validate: async (_clientStorage, serverStorage, { clientExchangeData, serverExchangeData }) => {
                        expect(clientExchangeData.length).equals(2);
                        expect(serverExchangeData.length).equals(3);

                        expect(clientExchangeData[0].type).equals(BdxMessageType.SendInit);
                        expect(clientExchangeData[0].data).deep.equals({
                            transferProtocol: {
                                version: 0,
                                senderDrive: false,
                                receiverDrive: true,
                                asynchronousTransfer: false,
                            },
                            maxBlockSize: 966,
                            fileDesignator: fd.bytes,
                            maxLength: 256,
                            metaData: undefined,
                            startOffset: undefined,
                        });

                        expect(serverExchangeData[0].type).equals(BdxMessageType.SendAccept);
                        expect(serverExchangeData[0].data).deep.equals({
                            transferControl: {
                                version: 0,
                                senderDrive: false,
                                receiverDrive: true,
                                asynchronousTransfer: false,
                            },
                            maxBlockSize: 966,
                            metaData: undefined,
                        });

                        expect(serverExchangeData[1].type).equals(BdxMessageType.BlockQuery);
                        expect(serverExchangeData[1].data.blockCounter).equals(0);

                        expect(clientExchangeData[1].type).equals(BdxMessageType.BlockEof);
                        expect(clientExchangeData[1].data.blockCounter).equals(0);
                        expect(clientExchangeData[1].data.data.length).equals(256);

                        expect(serverExchangeData[2].type).equals(BdxMessageType.BlockAckEof);
                        expect(serverExchangeData[2].data.blockCounter).equals(0);

                        const receivedData = await serverStorage.context.get(fd.blobName);
                        expect(receivedData).to.deep.equal(data);
                    },
                });
            });

            it("Using ReceiveInit as Sender-Driver (no limits)", async () => {
                const data = crypto.randomBytes(256);

                let fd: PersistedFileDesignator;
                await bdxTransfer({
                    prepare: (clientStorage, serverStorage, messenger) => {
                        fd = new PersistedFileDesignator("data", clientStorage);
                        serverStorage.context.set("data", data);

                        return {
                            bdxClient: BdxClient.asReceiver(messenger, { fileDesignator: fd }),
                            expectedInitialMessageType: BdxMessageType.ReceiveInit,
                        };
                    },
                    validate: async (clientStorage, _serverStorage, { clientExchangeData, serverExchangeData }) => {
                        expect(clientExchangeData.length).equals(2);
                        expect(serverExchangeData.length).equals(2);

                        expect(clientExchangeData[0].type).equals(BdxMessageType.ReceiveInit);
                        expect(clientExchangeData[0].data).deep.equals({
                            transferProtocol: {
                                version: 0,
                                senderDrive: true,
                                receiverDrive: true,
                                asynchronousTransfer: false,
                            },
                            maxBlockSize: 966,
                            fileDesignator: fd.bytes,
                            maxLength: undefined,
                            metaData: undefined,
                            startOffset: undefined,
                        });

                        expect(serverExchangeData[0].type).equals(BdxMessageType.ReceiveAccept);
                        expect(serverExchangeData[0].data).deep.equals({
                            transferControl: {
                                version: 0,
                                senderDrive: true,
                                receiverDrive: false,
                                asynchronousTransfer: false,
                            },
                            maxBlockSize: 966,
                            metaData: undefined,
                            length: undefined,
                        });

                        expect(serverExchangeData[1].type).equals(BdxMessageType.BlockEof);
                        expect(serverExchangeData[1].data.blockCounter).equals(0);
                        expect(serverExchangeData[1].data.data.length).equals(256);

                        expect(clientExchangeData[1].type).equals(BdxMessageType.BlockAckEof);
                        expect(clientExchangeData[1].data.blockCounter).equals(0);

                        const receivedData = await clientStorage.context.get(fd.blobName);
                        expect(receivedData).to.deep.equal(data);
                    },
                });
            });

            it("Using ReceiveInit as Receiver-Driver (by Initiator)", async () => {
                const data = crypto.randomBytes(256);

                let fd: PersistedFileDesignator;
                await bdxTransfer({
                    prepare: (clientStorage, serverStorage, messenger) => {
                        fd = new PersistedFileDesignator("data", clientStorage);
                        serverStorage.context.set("data", data);

                        return {
                            bdxClient: BdxClient.asReceiver(messenger, {
                                fileDesignator: fd,
                                preferredDriverModes: [Flow.DriverMode.ReceiverDrive],
                            }),
                            expectedInitialMessageType: BdxMessageType.ReceiveInit,
                        };
                    },
                    validate: async (clientStorage, _serverStorage, { clientExchangeData, serverExchangeData }) => {
                        expect(clientExchangeData.length).equals(3);
                        expect(serverExchangeData.length).equals(2);

                        expect(clientExchangeData[0].type).equals(BdxMessageType.ReceiveInit);
                        expect(clientExchangeData[0].data).deep.equals({
                            transferProtocol: {
                                version: 0,
                                senderDrive: false,
                                receiverDrive: true,
                                asynchronousTransfer: false,
                            },
                            maxBlockSize: 966,
                            fileDesignator: fd.bytes,
                            maxLength: undefined,
                            metaData: undefined,
                            startOffset: undefined,
                        });

                        expect(serverExchangeData[0].type).equals(BdxMessageType.ReceiveAccept);
                        expect(serverExchangeData[0].data).deep.equals({
                            transferControl: {
                                version: 0,
                                senderDrive: false,
                                receiverDrive: true,
                                asynchronousTransfer: false,
                            },
                            maxBlockSize: 966,
                            metaData: undefined,
                            length: undefined,
                        });

                        expect(clientExchangeData[1].type).equals(BdxMessageType.BlockQuery);
                        expect(clientExchangeData[1].data.blockCounter).equals(0);

                        expect(serverExchangeData[1].type).equals(BdxMessageType.BlockEof);
                        expect(serverExchangeData[1].data.blockCounter).equals(0);
                        expect(serverExchangeData[1].data.data.length).equals(256);

                        expect(clientExchangeData[2].type).equals(BdxMessageType.BlockAckEof);
                        expect(clientExchangeData[2].data.blockCounter).equals(0);

                        const receivedData = await clientStorage.context.get(fd.blobName);
                        expect(receivedData).to.deep.equal(data);
                    },
                });
            });
        });

        describe("partial transfers", () => {
            it("Send first 100 bytes as sender drive", async () => {
                const data = crypto.randomBytes(256);

                let fd: PersistedFileDesignator;
                await bdxTransfer({
                    prepare: (clientStorage, _serverStorage, messenger) => {
                        fd = new PersistedFileDesignator("data", clientStorage);
                        clientStorage.context.set("data", data);

                        return {
                            bdxClient: BdxClient.asSender(messenger, { fileDesignator: fd, senderMaxLength: 100 }),
                            expectedInitialMessageType: BdxMessageType.SendInit,
                        };
                    },
                    validate: async (_clientStorage, serverStorage, { clientExchangeData, serverExchangeData }) => {
                        expect(clientExchangeData.length).equals(2);
                        expect(serverExchangeData.length).equals(2);
                        expect(clientExchangeData[0].type).equals(BdxMessageType.SendInit);
                        expect(clientExchangeData[0].data).deep.equals({
                            transferProtocol: {
                                version: 0,
                                senderDrive: true,
                                receiverDrive: true,
                                asynchronousTransfer: false,
                            },
                            maxBlockSize: 966,
                            fileDesignator: fd.bytes,
                            maxLength: 100,
                            metaData: undefined,
                            startOffset: undefined,
                        });
                        expect(clientExchangeData[1].type).equals(BdxMessageType.BlockEof);
                        expect(clientExchangeData[1].data.blockCounter).equals(0);
                        expect(clientExchangeData[1].data.data.length).equals(100);

                        const receivedData = await serverStorage.context.get(fd.blobName);
                        expect(receivedData).to.deep.equal(Bytes.of(data).slice(0, 100));
                    },
                });
            });

            it("Send first 100 bytes as Receiver-Driver", async () => {
                const data = crypto.randomBytes(256);

                let fd: PersistedFileDesignator;
                await bdxTransfer({
                    prepare: (clientStorage, _serverStorage, messenger) => {
                        fd = new PersistedFileDesignator("data", clientStorage);
                        clientStorage.context.set("data", data);

                        return {
                            bdxClient: BdxClient.asSender(messenger, {
                                fileDesignator: fd,
                                preferredDriverModes: [Flow.DriverMode.ReceiverDrive],
                                senderMaxLength: 100,
                            }),
                            expectedInitialMessageType: BdxMessageType.SendInit,
                        };
                    },
                    validate: async (_clientStorage, serverStorage, { clientExchangeData, serverExchangeData }) => {
                        expect(clientExchangeData.length).equals(2);
                        expect(serverExchangeData.length).equals(3);

                        expect(clientExchangeData[0].type).equals(BdxMessageType.SendInit);
                        expect(clientExchangeData[0].data).deep.equals({
                            transferProtocol: {
                                version: 0,
                                senderDrive: false,
                                receiverDrive: true,
                                asynchronousTransfer: false,
                            },
                            maxBlockSize: 966,
                            fileDesignator: fd.bytes,
                            maxLength: 100,
                            metaData: undefined,
                            startOffset: undefined,
                        });

                        expect(serverExchangeData[0].type).equals(BdxMessageType.SendAccept);
                        expect(serverExchangeData[0].data).deep.equals({
                            transferControl: {
                                version: 0,
                                senderDrive: false,
                                receiverDrive: true,
                                asynchronousTransfer: false,
                            },
                            maxBlockSize: 966,
                            metaData: undefined,
                        });

                        expect(serverExchangeData[1].type).equals(BdxMessageType.BlockQuery);
                        expect(serverExchangeData[1].data.blockCounter).equals(0);

                        expect(clientExchangeData[1].type).equals(BdxMessageType.BlockEof);
                        expect(clientExchangeData[1].data.blockCounter).equals(0);
                        expect(clientExchangeData[1].data.data.length).equals(100);

                        expect(serverExchangeData[2].type).equals(BdxMessageType.BlockAckEof);
                        expect(serverExchangeData[2].data.blockCounter).equals(0);

                        const receivedData = await serverStorage.context.get(fd.blobName);
                        expect(receivedData).to.deep.equal(Bytes.of(data).slice(0, 100));
                    },
                });
            });

            it("Send 100 bytes with startOffset 50 as sender drive", async () => {
                const data = crypto.randomBytes(256);

                let fd: PersistedFileDesignator;
                await bdxTransfer({
                    prepare: (clientStorage, _serverStorage, messenger) => {
                        fd = new PersistedFileDesignator("data", clientStorage);
                        clientStorage.context.set("data", data);

                        return {
                            bdxClient: BdxClient.asSender(messenger, {
                                fileDesignator: fd,
                                senderMaxLength: 100,
                                senderStartOffset: 50,
                            }),
                            expectedInitialMessageType: BdxMessageType.SendInit,
                        };
                    },
                    validate: async (_clientStorage, serverStorage, { clientExchangeData, serverExchangeData }) => {
                        expect(clientExchangeData.length).equals(2);
                        expect(serverExchangeData.length).equals(2);
                        expect(clientExchangeData[0].type).equals(BdxMessageType.SendInit);
                        expect(clientExchangeData[0].data).deep.equals({
                            transferProtocol: {
                                version: 0,
                                senderDrive: true,
                                receiverDrive: true,
                                asynchronousTransfer: false,
                            },
                            maxBlockSize: 966,
                            fileDesignator: fd.bytes,
                            maxLength: 100,
                            metaData: undefined,
                            startOffset: 50,
                        });
                        expect(clientExchangeData[1].type).equals(BdxMessageType.BlockEof);
                        expect(clientExchangeData[1].data.blockCounter).equals(0);
                        expect(clientExchangeData[1].data.data.length).equals(100);

                        const receivedData = await serverStorage.context.get(fd.blobName);
                        expect(receivedData).to.deep.equal(Bytes.of(data).slice(50, 150));
                    },
                });
            });

            it("Send first 100 bytes with startOffset 50 as Receiver-Driver", async () => {
                const data = crypto.randomBytes(256);

                let fd: PersistedFileDesignator;
                await bdxTransfer({
                    prepare: (clientStorage, _serverStorage, messenger) => {
                        fd = new PersistedFileDesignator("data", clientStorage);
                        clientStorage.context.set("data", data);

                        return {
                            bdxClient: BdxClient.asSender(messenger, {
                                fileDesignator: fd,
                                preferredDriverModes: [Flow.DriverMode.ReceiverDrive],
                                senderMaxLength: 100,
                                senderStartOffset: 50,
                            }),
                            expectedInitialMessageType: BdxMessageType.SendInit,
                        };
                    },
                    validate: async (_clientStorage, serverStorage, { clientExchangeData, serverExchangeData }) => {
                        expect(clientExchangeData.length).equals(2);
                        expect(serverExchangeData.length).equals(3);

                        expect(clientExchangeData[0].type).equals(BdxMessageType.SendInit);
                        expect(clientExchangeData[0].data).deep.equals({
                            transferProtocol: {
                                version: 0,
                                senderDrive: false,
                                receiverDrive: true,
                                asynchronousTransfer: false,
                            },
                            maxBlockSize: 966,
                            fileDesignator: fd.bytes,
                            maxLength: 100,
                            metaData: undefined,
                            startOffset: 50,
                        });

                        expect(serverExchangeData[0].type).equals(BdxMessageType.SendAccept);
                        expect(serverExchangeData[0].data).deep.equals({
                            transferControl: {
                                version: 0,
                                senderDrive: false,
                                receiverDrive: true,
                                asynchronousTransfer: false,
                            },
                            maxBlockSize: 966,
                            metaData: undefined,
                        });

                        expect(serverExchangeData[1].type).equals(BdxMessageType.BlockQuery);
                        expect(serverExchangeData[1].data.blockCounter).equals(0);

                        expect(clientExchangeData[1].type).equals(BdxMessageType.BlockEof);
                        expect(clientExchangeData[1].data.blockCounter).equals(0);
                        expect(clientExchangeData[1].data.data.length).equals(100);

                        expect(serverExchangeData[2].type).equals(BdxMessageType.BlockAckEof);
                        expect(serverExchangeData[2].data.blockCounter).equals(0);

                        const receivedData = await serverStorage.context.get(fd.blobName);
                        expect(receivedData).to.deep.equal(Bytes.of(data).slice(50, 150));
                    },
                });
            });
        });
    });

    describe("Error cases", () => {
        it("No matching driver modes", async () => {
            const data = crypto.randomBytes(256);

            let fd: PersistedFileDesignator;
            await bdxTransfer({
                prepare: (clientStorage, _serverStorage, messenger) => {
                    fd = new PersistedFileDesignator("data", clientStorage);
                    clientStorage.context.set("data", data);

                    return {
                        bdxClient: BdxClient.asSender(messenger, {
                            fileDesignator: fd,
                            preferredDriverModes: [Flow.DriverMode.SenderDrive],
                        }),
                        expectedInitialMessageType: BdxMessageType.SendInit,
                        serverLimits: {
                            preferredDriverModes: [Flow.DriverMode.ReceiverDrive],
                        },
                    };
                },
                validate: async (_clientStorage, serverStorage, { serverExchangeData, clientError }) => {
                    expect(clientError instanceof BdxStatusResponseError).equals(true);
                    expect(clientError.protocolStatusCode).equals(BdxStatusCode.TransferMethodNotSupported);

                    expect(serverExchangeData[0].type).equals(SecureMessageType.StatusReport);
                    expect(serverExchangeData[0].data.generalStatus).equals(GeneralStatusCode.Failure);
                    expect(serverExchangeData[0].data.protocolStatus).equals(BdxStatusCode.TransferMethodNotSupported);

                    expect(serverStorage.context.has(fd.text)).equals(false);
                },
            });
        });

        it("Unknown FileDesignator", async () => {
            let fd: PersistedFileDesignator;
            await bdxTransfer({
                prepare: (clientStorage, _serverStorage, messenger) => {
                    fd = new PersistedFileDesignator("data", clientStorage);
                    return {
                        bdxClient: BdxClient.asReceiver(messenger, { fileDesignator: fd }),
                        expectedInitialMessageType: BdxMessageType.ReceiveInit,
                    };
                },
                validate: async (_clientStorage, _serverStorage, { serverExchangeData, clientError }) => {
                    expect(clientError instanceof BdxStatusResponseError).equals(true);
                    expect(clientError.protocolStatusCode).equals(BdxStatusCode.FileDesignatorUnknown);

                    expect(serverExchangeData[0].type).equals(SecureMessageType.StatusReport);
                    expect(serverExchangeData[0].data.generalStatus).equals(GeneralStatusCode.Failure);
                    expect(serverExchangeData[0].data.protocolStatus).equals(BdxStatusCode.FileDesignatorUnknown);
                },
            });
        });

        it("Request a file from peer that is larger than the data", async () => {
            const data = crypto.randomBytes(100);

            let fd: PersistedFileDesignator;
            await bdxTransfer({
                prepare: (clientStorage, serverStorage, messenger) => {
                    fd = new PersistedFileDesignator("data", clientStorage);
                    serverStorage.context.set("data", data);

                    return {
                        bdxClient: BdxClient.asReceiver(messenger, { fileDesignator: fd }),
                        expectedInitialMessageType: BdxMessageType.ReceiveInit,
                    };
                },
                clientExchangeManipulator: message => {
                    if (message.payloadHeader.messageType === BdxMessageType.ReceiveInit) {
                        const data = BdxReceiveInitMessage.decode(message.payload);
                        data.maxLength = 300;
                        message.payload = BdxReceiveInitMessage.encode(data);
                    }
                    return message;
                },
                validate: async (clientStorage, _serverStorage, { clientError }) => {
                    expect(clientError instanceof BdxStatusResponseError).equals(true);
                    expect(clientError.protocolStatusCode).equals(BdxStatusCode.LengthTooLarge);

                    expect(clientStorage.context.has(fd.text)).equals(false);
                },
            });
        });

        it("Request a file from peer that is larger than the data using startOffset", async () => {
            const data = crypto.randomBytes(100);

            let fd: PersistedFileDesignator;
            await bdxTransfer({
                prepare: (clientStorage, serverStorage, messenger) => {
                    fd = new PersistedFileDesignator("data", clientStorage);
                    serverStorage.context.set("data", data);

                    return {
                        bdxClient: BdxClient.asReceiver(messenger, { fileDesignator: fd }),
                        expectedInitialMessageType: BdxMessageType.ReceiveInit,
                    };
                },
                clientExchangeManipulator: message => {
                    if (message.payloadHeader.messageType === BdxMessageType.ReceiveInit) {
                        const data = BdxReceiveInitMessage.decode(message.payload);
                        data.maxLength = 100;
                        data.startOffset = 50;
                        message.payload = BdxReceiveInitMessage.encode(data);
                    }
                    return message;
                },
                validate: async (clientStorage, _serverStorage, { clientError }) => {
                    expect(clientError instanceof BdxStatusResponseError).equals(true);
                    expect(clientError.protocolStatusCode).equals(BdxStatusCode.LengthTooLarge);

                    expect(clientStorage.context.has(fd.text)).equals(false);
                },
            });
        });

        it("Unexpected Blockcounter in request with SenderDriver", async () => {
            const data = crypto.randomBytes(256);

            let fd: PersistedFileDesignator;
            await bdxTransfer({
                prepare: (clientStorage, _serverStorage, messenger) => {
                    fd = new PersistedFileDesignator("data", clientStorage);
                    clientStorage.context.set("data", data);

                    return {
                        bdxClient: BdxClient.asSender(messenger, { fileDesignator: fd }),
                        expectedInitialMessageType: BdxMessageType.SendInit,
                    };
                },
                clientExchangeManipulator: message => {
                    if (message.payloadHeader.messageType === BdxMessageType.BlockEof) {
                        const data = BdxBlockEofMessage.decode(message.payload);
                        data.blockCounter++;
                        message.payload = BdxBlockEofMessage.encode(data);
                    }
                    return message;
                },
                validate: async (_clientStorage, serverStorage, { serverExchangeData, clientError }) => {
                    expect(clientError instanceof BdxStatusResponseError).equals(true);
                    expect(clientError.protocolStatusCode).equals(BdxStatusCode.BadBlockCounter);

                    expect(serverExchangeData[1].type).equals(SecureMessageType.StatusReport);
                    expect(serverExchangeData[1].data.generalStatus).equals(GeneralStatusCode.Failure);
                    expect(serverExchangeData[1].data.protocolStatus).equals(BdxStatusCode.BadBlockCounter);

                    expect(serverStorage.context.has(fd.text)).equals(false);
                },
            });
        });

        it("BlockQueryWithSkip skipping bytes but end errors because of too less data", async () => {
            const data = crypto.randomBytes(2048);

            let fd: PersistedFileDesignator;
            await bdxTransfer({
                prepare: (clientStorage, _serverStorage, messenger) => {
                    fd = new PersistedFileDesignator("data", clientStorage);
                    clientStorage.context.set("data", data);

                    return {
                        bdxClient: BdxClient.asSender(messenger, {
                            fileDesignator: fd,
                            preferredDriverModes: [Flow.DriverMode.ReceiverDrive],
                        }),
                        expectedInitialMessageType: BdxMessageType.SendInit,
                    };
                },
                serverExchangeManipulator: message => {
                    if (message.payloadHeader.messageType === BdxMessageType.BlockQuery) {
                        const data = BdxBlockQueryMessage.decode(message.payload);
                        // Manipulate the second BlockQuery to also Skip over bytes
                        if (data.blockCounter === 1) {
                            const skipQuery: BdxBlockQueryWithSkip = {
                                blockCounter: data.blockCounter,
                                bytesToSkip: 100,
                            };
                            message.payload = BdxBlockQueryWithSkipMessage.encode(skipQuery);
                            message.payloadHeader.messageType = BdxMessageType.BlockQueryWithSkip;
                        }
                    }
                    return message;
                },
                validate: async (
                    _clientStorage,
                    serverStorage,
                    { clientExchangeData, serverExchangeData, clientError },
                ) => {
                    expect(clientError instanceof BdxError).equals(true);
                    expect(clientError.code).equals(BdxStatusCode.LengthTooShort);

                    expect(clientExchangeData.length).equals(4);
                    expect(serverExchangeData.length).equals(4);

                    expect(clientExchangeData[0].type).equals(BdxMessageType.SendInit);
                    expect(clientExchangeData[0].data).deep.equals({
                        transferProtocol: {
                            version: 0,
                            senderDrive: false,
                            receiverDrive: true,
                            asynchronousTransfer: false,
                        },
                        maxBlockSize: 966,
                        fileDesignator: fd.bytes,
                        maxLength: 2048,
                        metaData: undefined,
                        startOffset: undefined,
                    });

                    expect(serverExchangeData[0].type).equals(BdxMessageType.SendAccept);
                    expect(serverExchangeData[0].data).deep.equals({
                        transferControl: {
                            version: 0,
                            senderDrive: false,
                            receiverDrive: true,
                            asynchronousTransfer: false,
                        },
                        maxBlockSize: 966,
                        metaData: undefined,
                    });

                    expect(serverExchangeData[1].type).equals(BdxMessageType.BlockQuery);
                    expect(serverExchangeData[1].data.blockCounter).equals(0);

                    expect(clientExchangeData[1].type).equals(BdxMessageType.Block);
                    expect(clientExchangeData[1].data.blockCounter).equals(0);
                    expect(clientExchangeData[1].data.data.length).equals(966);
                    expect(clientExchangeData[1].data.data).deep.equals(Bytes.of(data).slice(0, 966));

                    expect(serverExchangeData[2].type).equals(BdxMessageType.BlockQuery); // Original is stored, so not manipulated type
                    expect(serverExchangeData[2].data.blockCounter).equals(1);

                    expect(clientExchangeData[2].type).equals(BdxMessageType.Block);
                    expect(clientExchangeData[2].data.blockCounter).equals(1);
                    expect(clientExchangeData[2].data.data.length).equals(966);
                    expect(clientExchangeData[2].data.data).deep.equals(Bytes.of(data).slice(1066, 1066 + 966));

                    expect(serverExchangeData[3].type).equals(BdxMessageType.BlockQuery);
                    expect(serverExchangeData[3].data.blockCounter).equals(2);

                    expect(clientExchangeData[3].type).equals(SecureMessageType.StatusReport);
                    expect(clientExchangeData[3].data.generalStatus).equals(GeneralStatusCode.Failure);
                    expect(clientExchangeData[3].data.protocolStatus).equals(BdxStatusCode.LengthTooShort);

                    expect(serverStorage.context.has(fd.text)).equals(false);
                },
            });
        });
    });
});
