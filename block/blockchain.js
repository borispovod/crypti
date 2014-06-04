var genesisblock = require("./genesisblock.js"),
    crypto = require('crypto'),
    block = require("./block.js").block,
    transaction = require('../transactions').transaction,
    transactionprocessor = require("../transactions").transactionprocessor.getInstance(),
    utils = require('../utils.js'),
    constants = require("../Constants.js"),
    ByteBuffer = require("bytebuffer"),
    bignum = require('bignum'),
    bufferEqual = require('buffer-equal');

var blockchain = function (app) {
    this.app = app;
    this.accountprocessor = this.app.accountprocessor;
    this.transactionprocessor = this.app.transactionprocessor;
    this.logger = this.app.logger;
    this.addressprocessor = this.app.addressprocessor;
    this.db = this.app.db;
    this.blocks = {};
    this.lastBlock = null;
}

blockchain.prototype.getBlock = function (id) {
    return this.blocks[id];
}

blockchain.prototype.getLastBlock = function () {
    return this.blocks[this.lastBlock];
}

blockchain.prototype.fromJSON = function (b) {
    return new Block(b.version, null, b.timestamp, b.previousBlock, [], b.totalAmount, b.totalFee, b.payloadLength, new Buffer(b.payloadHash,'hex'), new Buffer(b.generatorPublicKey, 'hex'), new Buffer(b.generationSignature, 'hex'), new Buffer(b.blockSignature, 'hex'));
}

blockchain.prototype.blockFromJSON = function (jsonObj) {
    try {
        var data = JSON.parse(jsonObj);
        return new block(data.version, data.id, data.timestamp, data.previousBlock, data.transactions, data.totalAmount, data.totalFee, data.payloadLength, data.payloadHash, data.generatorPublicKey, data.generationSignature, data.blockSignature);
    } catch (e) {
        return null;
    }
}

blockchain.prototype.blockFromBytes = function (buffer) {
    var bb = ByteBuffer.wrap(buffer);
    bb.flip();
    var b = new block();

    b.version = bb.readInt();
    b.timestamp = bb.readInt();
    b.previousBlock = bb.readLong();
    b.numbersOfTransactions = bb.readInt();
    b.totalAmount = bb.readFloat();
    b.totalFee = bb.readFloat();
    b.payloadLength = bb.readInt();

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

blockchain.prototype.pushBlock = function (buffer) {
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

    b.previousBlock = bignum.fromBuffer(pb).toString();
    b.numberOfTransactions = bb.readInt();
    b.totalAmount = bb.readFloat();
    b.totalFee = bb.readFloat();
    b.payloadLength = bb.readInt();

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
        return false;
    }

    var curTime = utils.getEpochTime(new Date().getTime());
    if (b.timestamp > curTime || b.timestamp < this.getLastBlock().timestamp) {
        return false;
    }

    if (b.payloadLength > constants.maxPayloadLength || b.payloadLength + constants.blockHeaderLength != buffer.length) {
        return false;
    }

    b.index = Object.keys(this.blocks).length + 1;

    if (b.previousBlock != this.lastBlock || this.getBlock(b.getId()) != null || !b.verifyGenerationSignature() || !b.verifyBlockSignature()) {
        return false;
    }

    b.transactions = [];
    for (var i = 0; i < b.numberOfTransactions; i++) {
        b.transactions.push(this.transactionprocessor.transactionFromBuffer(bb));
    }


    b.addresses = {};
    for (var i = 0; i < b.numberOfAddresses; i++) {
        var addr = this.addressprocessor.fromByteBuffer(bb);
        addr.blockId = b.getId();
        b.addresses[a.id] = a;
    }

    b.forForger = 0;

    var c = 0;
    for (var a in b.addresses) {
        var addr = b.addresses[a];
        if (addr.timestamp > curTime ||  !addr.verify() || !addr.verifyAccount() || !this.addressprocessor.unconfirmedAddresses[addr.id]) {
            break;
        }

        var account = this.accountprocessor.getAccountByPublicKey(addr.generatorPublicKey);

        if (!account || account.getEffectiveBalance() <= 0) {
            break;
        }

        c++;
    }

    if (c != b.numberOfTransactions) {
        return false;
    }

    var accumulatedAmounts = {};
    var i, calculatedTotalAmount = 0, calculatedTotalFee = 0;
    for (i = 0; i < b.transactions.length; i++) {
        var t = b.transactions[i];

        if (t.timestamp > curTime || t.deadline < 1 || t.deadline > 24 || t.timestamp + (t.deadline * 60 * 60) < b.timestamp || t.fee <= 1 || t.fee >= 1000 * 1000 * 1000 || this.transactionprocessor.getTransaction(t.getId()) || (t.referencedTransaction != "0" && this.transactionprocessor.getTransaction(t.referencedTransaction) == null || (this.transactionprocessor.getUnconfirmedTransaction(t.getId()) && !t.verify()))) {
            break;
        }

        var sender = this.accountprocessor.getAccountByPublicKey(t.senderPublicKey);
        if (!accumulatedAmounts[sender.address]) {
            accumulatedAmounts[sender.address] = 0;
        }

        accumulatedAmounts[sender.address] += t.amount + t.fee;
        if (t.type == 0) {
            if (t.subtype == 0) {
                calculatedTotalAmount += t.amount;
            } else {
                break;
            }
        } else if (t.type == 1) {
            if (t.subtype == 0) {
                calculatedTotalAmount += t.amount;
                b.forForger += t.fee / 2;
            } else {
                break;
            }
        } else {
            break;
        }

        calculatedTotalFee += t.fee;
    }

    if (calculatedTotalAmount != b.totalAmount || calculatedTotalFee != b.totalFee || i != b.transactions.length) {
        return false;
    }

    var hash = crypto.createHash('sha256');

    for (i = 0; i < b.transactions.length; i++) {
        hash.update(b.transactions[i].getBytes());
    }

    var a = hash.digest();

    if (!bufferEqual(a, b.payloadHash)) {
        return false;
    }

    for (var a in accumulatedAmounts) {
        var account = this.accountprocessor.getAccountById(a);

        if (account.balance < accumulatedAmounts[a]) {
            return false;
        }
    }

    if (b.previousBlock != this.getLastBlock().getId()) {
        return false;
    }


    if (!b.analyze()) {
        return false;
    }

    for (var i = 0; i < b.transactions.length; i++) {
        b.transactions[i].blockId = b.getId();

        if (!this.transactionprocessor.addTransaction(b.transactions[i])) {
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

    for (var i in b.addresses) {
        var addr = b.addresses[i];
        addr.height = b.height;
        addr.blockId = b.getId();

        if (this.addressprocessor.addresses[addr.id]) {
            return false;
        }

        this.addressprocess.addresses[addr.id] = addr;
        if (!this.addressprocessor.unconfirmedAddresses[addr.id]) {
            return false;
        }

        delete this.addressprocessor.unconfirmedAddresses[addr.id];
    }

    this.lastBlock = b.getId();
    this.logger.info("Block processed: " + b.getId());

    // save block, transactions, addresses to db.
    this.db.writeBlock(b);

    for (var i = 0; i < b.transactions.length; i++) {
        this.db.writeTransaction(b.transactions[i]);
    }

    for (var i = 0; i < b.addresses.length; i++) {
        this.db.writeAddresses(b.addresses[i]);
    }


    // send to users.

    return true;
}

module.exports.init = function (app) {
    var logger = app.logger;
    var bc = new blockchain(app);
    app.blockchain = bc;

    logger.info("Blockchain is trying to find genesis block...");
    var b = bc.getBlock(genesisblock.blockId);

    if (!b) {
        var t = new transaction(0, null, 0, new Buffer(genesisblock.sender, 'hex'), genesisblock.recipient, 1000 * 1000 * 1000, 0, 0, null, new Buffer(genesisblock.trSignature, 'hex'));

        if (!t.verify()) {
            logger.error("Genesis transaction has not valid signature")
            return null;
        }

        var payloadHash = crypto.createHash('sha256').update(t.getBytes()).digest();

        var generationSignature = new Buffer(64);
        generationSignature.fill(0);

        var blockSignature = new Buffer(64);
        blockSignature.fill(0);

        b = new block(1, null, 0, null, [t], 1000 * 1000 * 1000, 1, t.getSize(), payloadHash, new Buffer(genesisblock.sender, 'hex'), generationSignature, new Buffer(genesisblock.blockSignature, 'hex'));

        b.baseTarget = bignum(constants.initialBaseTarget);
        b.cumulativeDifficulty = 0;
        b.numberOfTransactions = 1;
        bc.lastBlock = b.getId();
        t.blockId = genesisblock.blockId;

        b.setApp(app);

        var r = b.analyze();

        if (!r) {
            logger.error("Genesis block not added");
            return null;
        }

        logger.info("Genesis block added");
        return bc;
    } else {
        logger.info("Genesis block is found!");
        return bc;
    }
}