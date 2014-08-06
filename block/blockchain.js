var genesisblock = require("./genesisblock.js"),
    crypto = require('crypto'),
    block = require("./block.js").block,
    transaction = require('../transactions').transaction,
    transactionprocessor = require("../transactions").transactionprocessor.getInstance(),
    utils = require('../utils.js'),
    constants = require("../Constants.js"),
    ByteBuffer = require("bytebuffer"),
    bignum = require('bignum'),
    bufferEqual = require('buffer-equal'),
    Long = require("long");

var blockchain = function (app) {
    this.app = app;
    this.accountprocessor = this.app.accountprocessor;
    this.transactionprocessor = this.app.transactionprocessor;
    this.logger = this.app.logger;
    this.addressprocessor = this.app.addressprocessor;
    this.db = this.app.db;
    this.blocks = {};
    this.lastBlock = null;

    this.fee = constants.feeStart;
    this.nextFeeVolume = constants.feeStartVolume;
    this.actualFeeVolume = 0;
    this.totalPurchaseAmount = bignum(0);
}

blockchain.prototype.getBlock = function (id) {
    return this.blocks[id];
}

blockchain.prototype.getLastBlock = function () {
    return this.blocks[this.lastBlock];
}

blockchain.prototype.fromJSON = function (b) {
    var block = new Block(b.version, null, b.timestamp, b.previousBlock, [], b.totalAmount, b.totalFee, b.payloadLength, new Buffer(b.payloadHash,'hex'), new Buffer(b.generatorPublicKey, 'hex'), new Buffer(b.generationSignature, 'hex'), new Buffer(b.blockSignature, 'hex'));
    block.addressesLength = b.addressesLength;
    block.requestsLength = b.requestsLength;
    block.signatureslength = b.signaturesLength;
    block.numberOfSignatures = b.numberOfSignatures;

    return block;
}

/*
blockchain.prototype.blockFromJSON = function (jsonObj) {
    try {
        var data = JSON.parse(jsonObj);
        block = new block(data.version, data.id, data.timestamp, data.previousBlock, data.transactions, data.totalAmount, data.totalFee, data.payloadLength, data.payloadHash, data.generatorPublicKey, data.generationSignature, data.blockSignature);
    } catch (e) {
        return null;
    }
}*/

blockchain.prototype.blockFromBytes = function (buffer) {
    var bb = ByteBuffer.wrap(buffer, true);
    bb.flip();
    var b = new block();

    b.version = bb.readInt();
    b.timestamp = bb.readInt();
    b.previousBlock = bb.readLong();
    b.numbersOfTransactions = bb.readInt();
    b.totalAmount = bb.readInt();
    b.totalFee = bb.readInt();

    var generationWeightBuffer = new Buffer(8);
    for (var i = 0; i < 8; i++) {
        generationWeightBuffer[i] = bb.readByte();
    }

    b.generationWeight = bignum.fromBuffer(generationWeightBuffer);

    b.payloadLength = bb.readInt();
    b.addressesLength = bb.readInt();
    b.requestsLength = bb.readInt();

    var payloadHash = new Buffer(32);

    for (var i = 0; i < 32; i++) {
        payloadHash[i] = bb.readByte();
    }

    var generatorPublicKey = new Buffer(32);

    for (var i = 0; i < 32; i++) {
        generatorPublicKey[i] = bb.readByte();
    }

    var generationSignature = new Buffer(64);

    for (var i = 0; i < 64; i++) {
        generationSignature[i] = bb.readByte();
    }

    var blockSignature = new Buffer(64);

    for (var i = 0; i < 64; i++) {
        blockSignature[i] = bb.readByte();
    }

    b.payloadHash = payloadHash;
    b.generatorPublicKey = generatorPublicKey;
    b.blockSignature = blockSignature;

    return b;
}

blockchain.prototype.pushBlock = function (buffer, sendToPeers) {
    this.logger.info("Processing new block...");
    var bb = ByteBuffer.wrap(buffer, true);
    bb.flip();
    var b = new block();

    b.version = bb.readInt();
    b.timestamp = bb.readInt();

    var pb = new Buffer(8);

    for (var i = 0; i < 8; i++) {
        pb[i] = bb.readByte();
    }

    b.previousBlock = bignum.fromBuffer(pb, { size : 'auto' }).toString();
    b.numberOfAddresses = bb.readInt();
    b.numberOfTransactions = bb.readInt();
    b.numberOfRequests = bb.readInt();

    var amountLong = bb.readLong();
    b.totalAmount  = new Long(amountLong.low, amountLong.high, false).toNumber();
    var feeLong = bb.readLong();
    b.totalFee = new Long(feeLong.low, feeLong.high, false).toNumber();

    var generationWeightBuffer = new Buffer(8);
    for (var i = 0; i < 8; i++) {
        generationWeightBuffer[i] = bb.readByte();
    }

    b.generationWeight = bignum.fromBuffer(generationWeightBuffer, { size : 'auto' });

    b.payloadLength = bb.readInt();
    b.addressesLength = bb.readInt();
    b.requestsLength = bb.readInt();

    var payloadHash = new Buffer(32);

    for (var i = 0; i < 32; i++) {
        payloadHash[i] = bb.readByte();
    }

    var generatorPublicKey = new Buffer(32);

    for (var i = 0; i < 32; i++) {
        generatorPublicKey[i] = bb.readByte();
    }

    var generationSignature = new Buffer(64);

    for (var i = 0; i < 64; i++) {
        generationSignature[i] = bb.readByte();
    }


    var blockSignature = new Buffer(64);

    for (var i = 0; i < 64; i++) {
        blockSignature[i] = bb.readByte();
    }

    b.payloadHash = payloadHash;
    b.generatorPublicKey = generatorPublicKey;
    b.generationSignature = generationSignature;
    b.blockSignature = blockSignature;

    b.setApp(this.app);

    if (this.getLastBlock().previousBlock == b.previousBlock) {
        this.logger.error("Invalid previous block: " + b.getId() + ", " + b.previousBlock + " must be " + this.getLastBlock().previousBlock);
        return false;
    }

    var curTime = utils.getEpochTime(new Date().getTime());
    if (b.timestamp > curTime || b.timestamp < this.getLastBlock().timestamp || curTime - this.getLastBlock().timestamp < 60) {
        this.logger.error("Invalid block (" + b.getId() + ") time: " + b.timestamp + ", current time: " + curTime + ", last block time: " + this.getLastBlock().timestamp);
        return false;
    }

    if (b.payloadLength > constants.maxPayloadLength || b.addressesLength > constants.maxAddressesLength || b.requestsLength > constants.maxRequestsLength || b.payloadLength + constants.blockHeaderLength + b.requestsLength + b.addressesLength != buffer.length) {
        this.logger.error("Invalid payload length: " + b.getId(), " length: " + (b.payloadLength + constants.blockHeaderLength + b.requestsLength + b.addressesLength), "buffer length: " + buffer.length);
        return false;
    }

    b.index = Object.keys(this.blocks).length + 1;

    if (b.previousBlock != this.lastBlock || this.getBlock(b.getId()) != null || !b.verifyGenerationSignature() || !b.verifyBlockSignature()) {
        this.logger.error("Invalid block signatures: " + b.getId() + ", previous block: " + b.previousBlock + "/" + this.lastBlock + ", generation signature verification: " + b.verifyGenerationSignature() + ", block signature verification: " + b.verifyBlockSignature());
        return false;
    }

    this.logger.info("Load addresses and transactions from block: " + b.getId());

    b.transactions = [];
    for (var i = 0; i < b.numberOfTransactions; i++) {
        b.transactions.push(this.transactionprocessor.transactionFromBuffer(bb));
    }

    b.addresses = {};
    for (var i = 0; i < b.numberOfAddresses; i++) {
        var addr = this.app.addressprocessor.fromByteBuffer(bb);
        addr.blockId = b.getId();
        b.addresses[addr.id] = addr;
    }

    b.requests = {};
    for (var i = 0; i < b.numberOfRequests; i++) {
        var r = this.app.requestprocessor.fromByteBuffer(bb);
        b.requests[r.getId()] = r;
    }

    b.signatures = [];
    for (var i = 0; i < b.numberOfSignatures; i++) {
        var s = this.app.signatureprocessor.fromByteBuffer(bb);
        b.signatures.push(s);
    }

    b.forForger = 0;

    var c = 0;
    for (var a in b.addresses) {
        var addr = b.addresses[a];
        addr.height = b.height;
        addr.blockId = b.getId();

        if (addr.timestamp > curTime ||  !addr.verify() || !addr.accountVerify()) {
            break;
        }

        if (!addr.verify() || !addr.accountVerify()) {
            this.logger.error("Invalid addr signatures: " + addr.id + ", " + addr.verify() + "/" + addr.accountVerify());
            return false;
        }

        if (this.app.addressprocessor.addresses[addr.id]) {
            this.logger.error("Address already exists: " + addr.id);
            return false;
        }

        this.app.addressprocessor.addresses[addr.id] = addr;

        var account = this.app.accountprocessor.getAccountByPublicKey(addr.generatorPublicKey);

        if (!account || account.getEffectiveBalance() <= 0) {
            this.logger.error("Account not found or effective balance equal 0: " + account.address + "/" + account.getEffectiveBalance() + " for address: " + addr.id);
            break;
        }

        c++;
    }

    if (c != b.numberOfAddresses) {
        this.logger.error("Invalid addresses count, mistake in addresses: " + b.getId() + ", number of addresses: " + b.numberOfAddresses + ", processed: " + c);
        return false;
    }

    this.logger.info("Process transactions in block: " + b.getId());
    var accumulatedAmounts = {};
    var i, calculatedTotalAmount = 0, calculatedTotalFee = 0;
    for (i = 0; i < b.transactions.length; i++) {
        var t = b.transactions[i];

        if (t.timestamp > curTime || t.fee <= 0 || t.fee >= 99999999 * constants.numberLength || this.transactionprocessor.getTransaction(t.getId()) || (this.transactionprocessor.getUnconfirmedTransaction(t.getId()) && !t.verify())) {
            console.log(t);
            console.log(t.verify());
            break;
        }

        var fee = 0;

        if (t.type == 0 || t.type == 1) {
            if (t.subtype == 0) {
                fee = parseInt(t.amount / 100.00 * this.fee);
                if (fee == 0) {
                    fee = 1;
                }

                if (fee != t.fee) {
                    this.logger.error("Fee is not correct: " + fee + "/" + t.fee);
                    break;
                }
            }
        } else if (t.type == 2) {
            if (t.subtype == 0) {
                if (t.fee != 100 * constants.numberLength) {
                    this.logger.error("Can't process asset, invalid fee");
                    break;
                }

                var s = t.asset;

                if (!s) {
                    this.logger.error("Asset not found: " + t.getId());
                    break;
                }

                if (s.timestamp > curTime || s.timestamp > b.timestamp) {
                    this.logger.error("Can't process asset: " + s.getId() + "(signature), invalid timestamp");
                    break;
                }

                if (!s.verify()) {
                    this.logger.error("Can't process asset: " + s.getId() + "(signature), invalid signature");
                    break;
                }

                if (!s.verifyGenerationSignature()) {
                    this.logger.error("Can't process asset: " + s.getId() + "(signature), invalid generation signature");
                    break;
                }

                var account = this.app.accountprocessor.getAccountByPublicKey(s.generatorPublicKey);

                if (this.app.signatureprocessor.getSignatureByAddress(account.address)) {
                    this.logger.error("Can't process account signature, it's already added: " + s.getId() + " / " + account.address);
                    break;
                }

                s.blockId = b.getId();
                s.transactionId = t.getId();
            }
        }

        var sender = this.accountprocessor.getAccountByPublicKey(t.senderPublicKey);
        if (!accumulatedAmounts[sender.address]) {
            accumulatedAmounts[sender.address] = 0;
        }

        var signature = this.app.signatureprocessor.getSignatureByAddress(sender.address);

        if (signature) {
            if (!t.verifySignature(signature.publicKey)) {
                this.logger.error("Can't verify second segnature: " + transaction.getId());
                break;
            }
        }

        if (t.type == 1 && t.recipientId[t.recipientId.length - 1] != "D") {
            this.app.logger.error("Can't process transaction: " + t.getId() + ", because invalid type: 0/1");
            break;
        }

        if (t.type == 0 && t.recipientId[t.recipientId.length - 1] != "C") {
            this.app.logger.error("Can't process transaction: " + t.getId() + ", because invalid type: 1/0");

            break;
        }

        if (t.type == 1) {
            if (!this.app.addressprocessor.addresses[t.recipientId]) {
                break;
            }
        }

        accumulatedAmounts[sender.address] += t.amount + t.fee;
        if (t.type == 0) {
            if (t.subtype == 0) {
                calculatedTotalAmount += t.amount;
                b.forForger += t.fee;
            } else {
                break;
            }
        } else if (t.type == 1) {
            if (t.subtype == 0) {
                calculatedTotalAmount += t.amount;

                if (t.fee >= 2) {
                    if (t.fee % 2 != 0) {
                        var r = t.fee % 2;
                        b.forForger += t.fee / 2 + r;
                    } else {
                        b.forForger += t.fee / 2;
                    }
                } else {
                    b.forForger += t.fee;
                }
            } else {
                break;
            }
        }  else if (t.type == 2) {
            if (t.subtype == 0) {
                b.forForger += t.fee;
            } else {
                break;
            }
        } else {
            break;
        }

        calculatedTotalFee += t.fee;
    }

    if (calculatedTotalAmount != b.totalAmount || calculatedTotalFee != b.totalFee || i != b.transactions.length) {
        this.logger.error("Total amount, fee, transactions count invalid: " + b.getId() + ", total amount: " + calculatedTotalAmount + "/" + b.totalAmount + ", total fee: " + calculatedTotalFee + "/" + b.totalFee + ", transactions count: " + i + "/" + b.transactions.length);
        return false;
    }

    var numOfRequests = 0;
    for (var r in b.requests) {
        var request = b.requests[r];

        console.log(request.lastAliveBlock);

        if (request.lastAliveBlock != this.getLastBlock().getId()) {
            break;
        }

        if (!request.verify()) {
            break;
        }

        var account = this.app.accountprocessor.getAccountByPublicKey(request.publicKey);
        if (!account || account.getEffectiveBalance() < 1000 * constants.numberLength) {
            break;
        }

        var rId = request.getId();

        if (!this.app.requestprocessor.getUnconfirmedRequest(account.address)  || this.app.requestprocessor.getRequest(rId)) {
            break;
        }

        request.blockId = b.getId();

        numOfRequests += 1;
    }

    if (numOfRequests != b.numberOfRequests) {
        this.app.logger.error("Can't process block: " + b.getId() + ", invalid requests invalid: " + numOfRequests + '/' + b.numberOfRequests);
        return false;
    }
    // check generator

    var hash = crypto.createHash('sha256');

    for (i = 0; i < b.transactions.length; i++) {
        hash.update(b.transactions[i].getBytes());
    }

    for (var a in b.addresses) {
        hash.update(b.addresses[a].getBytes());
    }

    for (var r in b.requests) {
        hash.update(b.requests[r].getBytes());
    }

    var a = hash.digest();

    if (!bufferEqual(a, b.payloadHash)) {
        this.logger.error("Payload hash invalid: " + b.getId());
        return false;
    }

    for (var a in accumulatedAmounts) {
        var account = this.accountprocessor.getAccountById(a);

        if (account.balance < accumulatedAmounts[a]) {
            this.logger.error("Amount not valid: " + b.getId() + ", with account: " + account.address + ", amount: " + account.balance + "/" + accumulatedAmounts[a]);
            return false;
        }
    }

    if (b.previousBlock != this.getLastBlock().getId()) {
        this.logger.error("Previous block not valid: " + b.getId() + ", " + b.previousBlock + " must be " + this.getLastBlock().getId());
        return false;
    }

    // reset popWeight
    this.app.accountprocessor.resetPopWeight();

    if (!b.analyze()) {
        this.logger.error("Block can't be analyzed: " + b.getId());
        return false;
    }

    for (var i = 0; i < b.transactions.length; i++) {
        b.transactions[i].blockId = b.getId();

        if (!this.transactionprocessor.addTransaction(b.transactions[i])) {
            this.logger.error("Can't add transaction: " + b.getId() + ", transaction: " + b.transactions[i].getId());
            return false;
        }
    }

    for (var i = 0; i < b.transactions.length; i++) {
        var r = this.transactionprocessor.removeUnconfirmedTransaction(b.transactions[i]);
        if (r) {
            var a = this.accountprocessor.getAccountByPublicKey(b.transactions[i].senderPublicKey);

            a.setUnconfirmedBalance(a.unconfirmedBalance + b.transactions[i].amount + b.transactions[i].fee);
        }

        this.transactionprocessor.getTransaction(b.transactions[i].getId()).blockId = b.getId();
    }


    for (var r in b.requests) {
        var request = b.requests[r];
        var address = this.app.accountprocessor.getAccountByPublicKey(request.publicKey).address;
        if (!this.app.requestprocessor.confirmedRequests[address]) {
            this.app.requestprocessor.confirmedRequests[address] = [];
        }

        this.app.requestprocessor.confirmedRequests[address].push(request);
    }


    for (var i in b.addresses) {
        delete this.app.addressprocessor.unconfirmedAddresses[addr.id];
    }

    this.lastBlock = b.getId();
    this.logger.info("Block processed: " + b.getId());

    // save block, transactions, addresses to db.
    this.app.db.writeBlock(b);

    for (var i = 0; i < b.transactions.length; i++) {
        this.app.db.writeTransaction(b.transactions[i]);

        switch (b.transactions[i].type) {
            case 2:
                switch (b.transactions[i].subtype) {
                    case 0:
                        this.app.db.writeSignature(b.transactions[i].asset);
                        break;
                }
                break;
        }
    }

    for (var a in b.addresses) {
        this.app.db.writeAddress(b.addresses[a]);
    }

    for (var r in b.requests) {
        this.app.db.writePeerRequest(b.requests[r]);
    }

    this.app.requestprocessor.unconfirmedRequests = {};

    this.actualFeeVolume += b.totalAmount + b.totalFee;

    if (this.nextFeeVolume <= this.actualFeeVolume) {
        this.fee -= this.fee / 100 * 25;
        this.nextFeeVolume *= 2;
        this.actualFeeVolume = 0;
    }

    /*for (var i = 0; i < b.addresses.length; i++) {
        console.log("save address: " + b.addresses[i]);
        this.app.db.writeAddress(b.addresses[i]);
    }*/


    if (sendToPeers) {
        this.app.peerprocessor.sendBlockToAll(b);
    }

    return true;
}

module.exports.addGenesisBlock = function (app, cb) {
    var bc = app.blockchain;
    app.logger.info("Blockchain is trying to find genesis block...");
    var b = bc.getBlock(genesisblock.blockId);

    if (!b) {
        var signSignature = new Buffer(64);
        signSignature.fill(0);
        var t = new transaction(0, null, 0, new Buffer(genesisblock.sender, 'hex'), genesisblock.recipient, genesisblock.amount * constants.numberLength, 1 * constants.numberLength, new Buffer(genesisblock.trSignature, 'hex'));

        //t.sign("nY4NxXNd9velmtPxRN6TS8JLDR2dMGzkyL51p1sTPefA3tY9SzWBZT6GYlxyUgCQhSrJsoLiXHiuGqFVZTEObqI5BWgua6i5MAk");
        //console.log(t.signature.toString('hex'));

        if (!t.verify()) {
            app.logger.error("Genesis transaction has not valid signature")
            return null;
        }

        var payloadHash = crypto.createHash('sha256').update(t.getBytes()).digest();

        var generationSignature = new Buffer(64);
        generationSignature.fill(0);

        b = new block(1, null, 0, null, [t], 99999999 * constants.numberLength, 1 * constants.numberLength, t.getSize(), payloadHash, new Buffer(genesisblock.sender, 'hex'), generationSignature, new Buffer(genesisblock.blockSignature, 'hex'));

        b.baseTarget = bignum(constants.initialBaseTarget);
        b.cumulativeDifficulty = 0;
        b.numberOfTransactions = 1;
        bc.lastBlock = b.getId();
        t.blockId = genesisblock.blockId;

        //b.sign("nY4NxXNd9velmtPxRN6TS8JLDR2dMGzkyL51p1sTPefA3tY9SzWBZT6GYlxyUgCQhSrJsoLiXHiuGqFVZTEObqI5BWgua6i5MAk");
        //console.log(b.blockSignature.toString('hex'));
        //console.log(b.getId());

        b.setApp(app);

        var r = b.analyze();

        if (!r) {
            app.logger.error("Genesis block not added");
            return null;
        }

        app.db.writeBlock(b, function (err) {
            if (err) {
                cb(err);
            } else {
                app.db.writeTransaction(t, function (err) {
                    cb(err);
                });
            }
        });
    } else {
        app.logger.info("Genesis block is found!");
        cb();
    }
}

module.exports.init = function (app) {
    var logger = app.logger;
    var bc = new blockchain(app);
    return bc;
}