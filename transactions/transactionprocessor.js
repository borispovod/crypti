var transaction = require("./transactions.js"),
    epochTime = require('../utils.js').getEpochTime,
    accountprocessor = require("../account").accountprocessor,
    bignum = require('bignum'),
    utils = require("../utils.js"),
    Long = require('long'),
    signatureprocessor = require('../signature').signatureprocessor,
    constants = require("../Constants.js");

var transactionprocessor = function () {
    this.transactions = {};
    this.unconfirmedTransactions = {};
    this.doubleSpendingTransactions = {};
}


transactionprocessor.prototype.fromJSON = function (t) {
    return new Transaction(t.type, null, t.timestamp, new Buffer(t.senderPublicKey, 'hex'), t.recipientId, t.amount, new Buffer(t.signature, 'hex'));
}

transactionprocessor.prototype.setApp = function (app) {
    this.app = app;
    this.logger = app.logger;
    this.accountprocessor = app.accountprocessor;
    this.addressprocessor = app.addressprocessor;
}

transactionprocessor.prototype.getTransaction = function (id) {
    return this.transactions[id];
}

transactionprocessor.prototype.getUnconfirmedTransaction = function (id) {
    return this.unconfirmedTransactions[id];
}

transactionprocessor.prototype.processTransaction = function (transaction, sendToPeers) {
    this.logger.info("Process transaction: " + transaction.getId());

    var currentTime = epochTime(new Date().getTime());

    if (transaction.timestamp > currentTime) {
        this.logger.error("Can't verify transaction: " + transaction.getId() + " invalid time: " + transaction.timestamp + "/" + currentTime);
        return false;
    }

    var blockId = transaction.creationBlockId;

    if (!blockId) {
        this.logger.error("Creation block id not provided: " + transaction.getId());
        return false;
    }

    var block = this.app.blockchain.blocks[blockId];

    if (!block) {
        this.logger.error("Creation block id not found: " + transaction.getId());
        return false;
    }

    var fee = parseInt(transaction.amount / 100 * this.app.blockchain.fee);

    if (fee == 0) {
        fee = 1;
    }

    /*if (transaction.fee <= 0) {
        this.logger.error("Can't verify transaction: " + transaction.getId() + " invalid fee: " + transaction.fee);
        return false;
    }*/

    var id = transaction.getId();

    if (this.transactions[id] || this.unconfirmedTransactions[id] || this.doubleSpendingTransactions[id] || !transaction.verify()) {
        this.logger.error("Can't verify transaction: " + transaction.getId() + ", it's already exist");
        return false;
    }

    switch (transaction.type) {
        case 0:
            switch (transaction.subtype) {
                case 0:
                    if (transaction.asset) {
                        return false;
                    }
                    break;

                default:
                    return false;
                    break;
            }
            break;
        case 1:
            switch (transaction.subtype) {
                case 0:
                    if (transaction.asset) {
                        return false;
                    }
                    break;

                default:
                    return false;
                break;
            }
            break;
        case 2:
            switch (transaction.subtype) {
                case 0:
                    if (!transaction.asset) {
                        return false;
                    }

                    fee = 100 * constants.numberLength;

                    if (transaction.amount > 0) {
                        this.logger.error("Transaction has not valid amount");
                        return false;
                    }
                    break;

                default:
                    return false;
                break;
            }
            break;

        default:
            return false;
        break;
    }

    if (transaction.type == 1 && transaction.recipientId[transaction.recipientId.length - 1] != "D") {
        this.logger.error("Type of transaction and account end not valid: " + transaction.getId() + ", " + transaction.type + "/" + transaction.recipientId);
        return false;
    }

    if (transaction.type == 0 && transaction.recipientId[transaction.recipientId.length - 1] != "C") {
        this.logger.error("Type of transaction and account end not valid: " + transaction.getId() + ", " + transaction.type + "/" + transaction.recipientId);
        return false;
    }

    if (transaction.type == 1) {
        if (!this.app.addressprocessor.addresses[transaction.recipientId] && !this.app.addressprocessor.unconfirmedAddresses[transaction.recipientId]) {
            this.logger.error("Invalid recipient, merchant address not found: " + transaction.getId() + ", address: " + transaction.recipientId);
            return false;
        }
    }

    var isDoubleSpending = false;
    var a = this.accountprocessor.getAccountByPublicKey(transaction.senderPublicKey);

    if (!a) {
        isDoubleSpending = true;
    } else {
        var signature = this.app.signatureprocessor.getSignatureByAddress(a.address);

        if (signature) {
            if (!transaction.verifySignature(signature.publicKey)) {
                this.logger.error("Can't verify second segnature: " + transaction.getId());
                return false;
            }
        }

        var amount = transaction.amount + fee;

        if (a.unconfirmedBalance < amount) {
            isDoubleSpending = true;
        } else {
            switch (transaction.type) {
                case 2:
                    switch (transaction.subtype) {
                        case 0:
                            var r = this.app.signatureprocessor.processSignature(transaction.asset);

                            if (!r) {
                                this.app.logger.error("Can't process signature: " + transaction.asset.getId());
                                return false;
                            }

                            break;
                    }
                    break;
            }

            a.setUnconfirmedBalance(a.unconfirmedBalance - amount);
        }
    }

    // add index

    if (isDoubleSpending) {
        this.doubleSpendingTransactions[id] = transaction;
    } else {
        this.unconfirmedTransactions[id] = transaction;

    }

    if (isDoubleSpending) {
        this.logger.info("Double spending transaction processed: " + transaction.getId());
    } else {
        this.logger.info("Transaction processed: " + transaction.getId());
    }

    if (sendToPeers) {
        this.app.peerprocessor.sendUnconfirmedTransactionToAll(transaction);
    }

    return true;
}

transactionprocessor.prototype.addTransaction = function (t) {
    if (this.transactions[t.getId()]) {
        return false;
    } else {
        this.transactions[t.getId()] = t;
        return true;
    }
}

transactionprocessor.prototype.removeUnconfirmedTransaction = function (t) {
    if (this.unconfirmedTransactions[t.getId()]) {
        delete this.unconfirmedTransactions[t.getId()];
        return true;
    } else {
        return false;
    }
}

transactionprocessor.prototype.transactionFromBuffer = function (bb) {
    var t = new transaction();
    t.type = bb.readByte();
    t.subtype = bb.readByte();

    var assetSize = 0;

    switch (t.type) {
        case 2:
            switch (t.subtype) {
                case 0:
                    assetSize = 196;
                    break;
            }
            break;
    }

    t.timestamp = bb.readInt();

    var buffer = new Buffer(32);
    for (var i = 0; i < 32; i++) {
        buffer[i] = bb.readByte();
    }

    t.senderPublicKey = buffer;

    var account = this.app.accountprocessor.getAccountByPublicKey(t.senderPublicKey);
    var readSignature = false;
    if (this.app.signatureprocessor.getSignatureByAddress(account.address)) {
        readSignature = true;
    }

    var recipientBuffer = new Buffer(8);

    for (var i = 0; i < 8; i++) {
        recipientBuffer[i] = bb.readByte();
    }

    var recipient = bignum.fromBuffer(recipientBuffer).toString();

    if (t.type == 1) {
        t.recipientId = recipient + "D";
    } else {
        t.recipientId = recipient + "C";
    }

    var amountLong = bb.readLong();
    t.amount = new Long(amountLong.low, amountLong.high, false).toNumber();

    var blockId = new Buffer(8);

    for (var i = 0; i < 8; i++) {
        blockId[i] = bb.readByte();
    }

    t.creationBlockId = bignum.fromBuffer(blockId, { size : '8' }).toString();

    if (assetSize > 0) {
        var assetBuffer = new Buffer(assetSize);
        for (var i = 0; i < assetSize; i++) {
            assetBuffer[i] = bb.readByte();
        }

        switch (t.type) {
            case 2:
                switch (t.subtype) {
                    case 0:
                        t.asset = this.app.signatureprocessor.fromBytes(assetBuffer);
                        break;
                }
                break;
        }
    }

    var signature = new Buffer(64);
    for (var i = 0; i < 64; i++) {
        signature[i] = bb.readByte();
    }

    if (readSignature) {
        t.signSignature = new Buffer(64);
        for (var i = 0; i < 64; i++) {
            t.signSignature[i] = bb.readByte();
        }
    } else {
        t.signSignature = null;
    }

    t.signature = signature;
    return t;
}

transactionprocessor.prototype.transactionFromBytes = function (bytes) {
    var bb = ByteBuffer.wrap(buffer, true);
    bb.flip();

    var t = new transaction();
    t.type = bb.readByte();
    t.subtype = bb.readByte();
    t.timestamp = bb.readInt();

    var buffer = new Buffer(32);
    for (var i = 0; i < 32; i++) {
        buffer[i] = bb.readByte();
    }

    t.senderPublicKey = buffer;

    var recipientBuffer = new Buffer(8);

    for (var i = 0; i < 8; i++) {
        recipientBuffer[i] = bb.readByte();
    }

    var recipient = bignum.fromBuffer(recipientBuffer).toString();

    if (t.type == 1) {
        t.recipientId = recipient + "D";
    } else {
        t.recipientId = recipient + "C";
    }

    t.amount = bb.readUint32();

    if (assetSize > 0) {
        var assetBuffer = new Buffer(assetSize);
        for (var i = 0; i < assetSize; i++) {
            assetBuffer[i] = bb.readByte();
        }

        switch (t.type) {
            case 2:
                switch (t.subtype) {
                    case 0:
                        t.asset = this.app.signatureprocessor.fromBytes(assetBuffer);
                        break;
                }
                break;
        }
    }

    var signature = new Buffer(64);
    for (var i = 0; i < 64; i++) {
        signature[i] = bb.readByte();
    }

    t.signSignature = new Buffer(64);
    for (var i = 0; i < 64; i++) {
        t.signSignature[i] = bb.readByte();
    }

    t.signature = signature;
    return t;
}

transactionprocessor.prototype.transactionFromJSON = function (transaction) {
    try {
        var json = JSON.parse(JSON);
        return new transaction(json.type, json.id, json.timestamp, json.senderPublicKey, json.recipientId, json.amount, json.signature);
    } catch (e) {
        return null;
    }
}

var tp = null;

module.exports.init = function () {
    tp = new transactionprocessor();
    return tp;
}

module.exports.getInstance = function () {
    return tp;
}