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
    Long = require("long"),
    request = require('../request').request;

var blockchain = function (app) {
    this.app = app;
    this.accountprocessor = this.app.accountprocessor;
    this.transactionprocessor = this.app.transactionprocessor;
    this.logger = this.app.logger;
    this.db = this.app.db;
    this.blocks = {};
    this.lastBlock = null;

    this.fee = constants.feeStart;
    this.nextFeeVolume = constants.feeStartVolume;
    this.actualFeeVolume = 0;
    this.totalPurchaseAmount = 0;
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
    b.totalAmount = bb.readLong();
    b.totalFee = bb.readLong();

    b.generationWeight = bb.readDouble();

    b.payloadLength = bb.readInt();
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

blockchain.prototype.getFee = function (transaction) {
    var fee = 0;

    switch (transaction.type) {
        case 0:
        case 1:
            switch (transaction.subtype) {
                case 0:
                    fee = parseInt(transaction.amount / 100 * this.fee);

                    if (fee == 0) {
                        fee = 1;
                    }
                break;
            }
        break;

        case 2:
            switch (transaction.subtype) {
                case 0:
                    fee = 100 * constants.numberLength;
                break;
            }
            break;
    }

    return fee;
}

blockchain.prototype.pushBlock = function (buffer, sendToPeers, checkRequests) {
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
    b.numberOfTransactions = bb.readInt();
    b.numberOfRequests = bb.readInt();
    b.numberOfConfirmations = bb.readInt();

    var amountLong = bb.readLong();
    b.totalAmount  = new Long(amountLong.low, amountLong.high, false).toNumber();
    var feeLong = bb.readLong();
    b.totalFee = new Long(feeLong.low, feeLong.high, false).toNumber();
    b.generationWeight = bb.readDouble();

    b.payloadLength = bb.readInt();
    b.requestsLength = bb.readInt();
    b.confirmationsLength = bb.readInt();

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
        this.logger.error("Invalid previous block: " + b.getId() + ", " + b.previousBlock + " must be " + this.getLastBlock().getId());
        return false;
    }

    var curTime = utils.getEpochTime(new Date().getTime());
    if (b.numberOfRequests == 0 || b.timestamp > curTime || b.timestamp <= this.getLastBlock().timestamp || curTime - this.getLastBlock().timestamp < 60) {
        this.logger.error("Invalid block (" + b.getId() + ") time: " + b.timestamp + ", current time: " + curTime + ", last block time: " + this.getLastBlock().timestamp);
        return false;
    }

    if (b.payloadLength > constants.maxPayloadLength || b.requestsLength > constants.maxRequestsLength || b.confirmationsLength > constants.maxConfirmations || b.payloadLength + constants.blockHeaderLength + b.confirmationsLength + b.requestsLength  != buffer.length) {
        this.logger.error("Invalid payload length: " + b.getId(), " length: " + (b.payloadLength + constants.blockHeaderLength + b.requestsLength + b.confirmationsLength), "buffer length: " + buffer.length);
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

    b.requests = {};
    for (var i = 0; i < b.numberOfRequests; i++) {
        var r = this.app.requestprocessor.fromByteBuffer(bb);
        b.requests[r.getId()] = r;
    }

    if (Object.keys(b.requests).length == 0) {
        this.app.logger.error("Not enough requests in block: " + b.getId());
        return false;
    }

    b.signatures = [];
    for (var i = 0; i < b.numberOfSignatures; i++) {
        var s = this.app.signatureprocessor.fromByteBuffer(bb);
        b.signatures.push(s);
    }

    b.confirmations = [];
    for (var i = 0; i < b.numberOfConfirmations; i++) {
        var c = this.app.companyprocessor.confirmationFromByteBuffer(bb);
        b.confirmations.push(c);
    }

    b.forForger = 0;

    this.logger.info("Process transactions in block: " + b.getId());
    var accumulatedAmounts = {};
    var i, calculatedTotalAmount = 0, calculatedTotalFee = 0;
    for (i = 0; i < b.transactions.length; i++) {
        var t = b.transactions[i];

        if (t.timestamp > curTime ||  this.transactionprocessor.getTransaction(t.getId()) || (this.transactionprocessor.getUnconfirmedTransaction(t.getId()) && !t.verify())) {
            break;
        }

        var fee = 0;

        if (t.type == 0 || t.type == 1) {
            if (t.subtype == 0) {
                fee = parseInt(t.amount / 100.00 * this.fee);

                if (fee == 0) {
                    fee = 1;
                }
            } else {
                break;
            }
        } else if (t.type == 2) {
            if (t.subtype == 0) {
                fee = 100 * constants.numberLength;

                if (t.amount > 0) {
                    this.logger.error("Amount not valid: " + t.getId());
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

                if (!account) {
                    this.logger.error("Can't process account signature, account not found: " + s.getId());
                    break;
                }

                if (this.app.signatureprocessor.getSignatureByAddress(account.address)) {
                    this.logger.error("Can't process account signature, it's already added: " + s.getId() + " / " + account.address);
                    break;
                }

                s.blockId = b.getId();
                s.transactionId = t.getId();
            } else {
                break;
            }
        } else if (t.type == 3) {
            if (t.subtype == 0) {
                fee = 1000 * constants.numberLength;

                if (t.amount > 0) {
                    this.logger.error("Amount not valid: " + t.getId());
                    break;
                }

                var c = t.asset;

                if (!c) {
                    this.logger.error("Asset not found: " + t.getId());
                    break;
                }

                if (c.timestamp > curTime || c.timestamp > b.timestamp) {
                    this.logger.error("Can't process asset: " + c.getId() + "(signature), invalid timestamp");
                    break;
                }

                if (!c.verify()) {
                    this.logger.error("Can't process asset: " + c.getId() + "(signature), invalid signature");
                    break;
                }

                var account = this.app.accountprocessor.getAccountByPublicKey(c.generatorPublicKey);

                if (!account) {
                    this.logger.error("Can't process account company, account not found: " + c.getId());
                    break;
                }

                var result = this.app.companyprocessor.checkCompanyData(c);

                if (!result) {
                    this.logger.error("Can't process company, invalid data of company: " + c.getId());
                    break;
                }

                if (this.app.companyprocessor.domainExists(c.domain)) {
                    this.logger.error("Can't process request, company domain already added: " + c.getId() + "/" + c.domain);
                    break;
                }

                if (this.app.companyprocessor.confirmations[c.domain] > 0 || this.app.companyprocessor.addedCompanies[c.domain] || this.app.companyprocessor.confirmedCompanies[c.domain]) {
                    this.logger.error("Can't process company, company already added and wait for confirmations: " + c.getId() + "/" + c.domain);
                    break;
                }

                c.blockId = b.getId();
                c.transactionId = t.getId();
            } else {
                break;
            }
        }
        else {
            break;
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

        if (t.type == 1 && t.subtype == 0 && t.recipientId[t.recipientId.length - 1] != "D") {
            this.app.logger.error("Can't process transaction: " + t.getId() + ", because invalid type: 0/1");
            break;
        }

        if (t.type == 0 && t.subtype == 0 && t.recipientId[t.recipientId.length - 1] != "C") {
            this.app.logger.error("Can't process transaction: " + t.getId() + ", because invalid type: 1/0");
            break;
        }

        if (t.type == 1 && t.subtype == 0) {
            var recipientId = t.recipientId;

            if (!this.app.companyprocessor.addresses[recipientId]) {
                this.app.logger.error("Can't process transaction: " + t.getId() + ", recipient not found: " + recipientId);
                break;
            }
        }

        accumulatedAmounts[sender.address] += t.amount + fee;
        if (t.type == 0) {
            if (t.subtype == 0) {
                calculatedTotalAmount += t.amount;
                b.forForger += fee;
            } else {
                break;
            }
        } else if (t.type == 1) {
            if (t.subtype == 0) {
                calculatedTotalAmount += t.amount;

                if (fee >= 2) {
                    if (fee % 2 != 0) {
                        var r = parseInt(fee / 2);
                        b.forForger += fee - r;
                    } else {
                        b.forForger += fee / 2;
                    }
                } else {
                    b.forForger += fee;
                }
            } else {
                break;
            }
        }  else if (t.type == 2) {
            if (t.subtype == 0) {
                b.forForger += fee;
            } else {
                break;
            }
        } else if (t.type == 3) {
            if (t.subtype == 0) {
                b.forForger += fee / 10;
            } else {
                break;
            }
        } else {
            break;
        }

        calculatedTotalFee += fee;
    }

    var confirmationsLength = 0;
    for (confirmationsLength = 0; confirmationsLength < b.confirmations.length; confirmationsLength++) {
        var c = b.confirmations[confirmationsLength];

        if (!c.verify(b.generatorPublicKey)) {
            this.app.logger.error("Can't process confirmation, invalid signature: " + b.getId() + " / " + c.getId());
            break;
        }

        if (c.timestamp > b.timestamp || c.timestamp > curTime) {
            this.app.logger.error("Invalid timestamp of confirmation: " + c.getId() + " / " + b.getId());
            break;
        }

        var company = this.app.companyprocessor.addedCompaniesIds[c.companyId];

        if (!company || !this.app.companyprocessor.addedCompanies[company.domain] || this.app.companyprocessor.confirmations[company.domain] <= 0 || this.app.companyprocessor.addedCompanies[company.domain].blocks >= 10 || !this.app.companyprocessor.confirmations[company.domain]) {
            this.app.logger.error("Invalid company: " + c.getId() + " / " + company.domain + " / " + b.getId());
            break;
        }

        if (this.app.companyprocessor.confirmedCompanies[company.domain]) {
            this.app.logger.error("Company already confirmed: " + c.getId() + " / " + company.domain);
            break;
        }

        c.blockId = b.getId();
        calculatedTotalFee += 100 * constants.numberLength;
        b.forForger += 100 * constants.numberLength;
    }

    if (confirmationsLength != b.numberOfConfirmations) {
        this.app.logger("Invalid number of confirmations: " + b.getId());
        return false;
    }

    if (calculatedTotalAmount != b.totalAmount || calculatedTotalFee != b.totalFee || i != b.transactions.length) {
        this.logger.error("Total amount, fee, transactions count invalid: " + b.getId() + ", total amount: " + calculatedTotalAmount + "/" + b.totalAmount + ", total fee: " + calculatedTotalFee + "/" + b.totalFee + ", transactions count: " + i + "/" + b.transactions.length);
        return false;
    }

    var numOfRequests = 0;
    var found = 0;
    for (var r in b.requests) {
        var request = b.requests[r];

        if (request.lastAliveBlock != this.getLastBlock().getId()) {
            this.logger.error("Invalid last alive block: " + request.lastAliveBlock + "/" + this.getLastBlock().getId());
            break;
        }

        var account = this.app.accountprocessor.getAccountByPublicKey(request.publicKey);
        if (!account || account.getEffectiveBalance() < 1000 * constants.numberLength) {
            this.logger.error("Request has not enough fee: " + account.address);
            break;
        }

        if (this.app.requestprocessor.getUnconfirmedRequest(account.address) && !request.verify()) {
            this.logger.error("Invalid request signature: " + request.getId());
            break;
        }

        var rId = request.getId();

        if (this.app.requestprocessor.getRequest(rId)) {
            break;
        }


        if (this.app.requestprocessor.unconfirmedRequests[account.address]) {
            found++;
        }

        request.blockId = b.getId();
        numOfRequests += 1;
    }

    if (checkRequests) {
        if (found != Object.keys(this.app.requestprocessor.unconfirmedRequests).length) {
            this.app.logger.error("Can't process, requests in blocks invalids: " + b.getId() + " / " + found + " / " + Object.keys(this.app.requestprocessor.unconfirmedRequests).length);
            return false;
        }
    }

    if (numOfRequests != b.numberOfRequests) {
        this.app.logger.error("Can't process block: " + b.getId() + ", invalid requests invalid: " + numOfRequests + '/' + b.numberOfRequests);
        return false;
    }

    var hash = crypto.createHash('sha256');

    for (i = 0; i < b.transactions.length; i++) {
        hash.update(b.transactions[i].getBytes());
    }

    for (var r in b.requests) {
        hash.update(b.requests[r].getBytes());
    }

    for (var i = 0; i < b.confirmations.length; i++) {
        hash.update(b.confirmations[i].getBytes());
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

    for (var i = 0; i < b.confirmations.length; i++) {
        var c = b.confirmations[i];
        var company = this.app.companyprocessor.addedCompaniesIds[c.companyId];

        if (c.verified == true || c.verified == 1) {
            this.app.companyprocessor.confirmations[company.domain] += 1;
        }

        this.app.companyprocessor.addedCompanies[company.domain].blocks += 1;

        if (this.app.companyprocessor.addedCompanies[company.domain].blocks == 10) {
            var confirmations = this.app.companyprocessor.confirmations[company.domain];
            delete this.app.companyprocessor.confirmations[company.domain];
            delete this.app.companyprocessor.addedCompanies[company.domain];
            delete this.app.companyprocessor.addedCompaniesIds[company.getId()];

            if (confirmations > 5) {
                this.app.companyprocessor.confirmedCompanies[company.domain] = company;

                var addr = new Buffer(8);
                for (var i = 0; i < 8; i++) {
                    addr[i] = company.signature[i];
                }

                addr = bignum.fromBuffer(addr).toString() + "D";
                this.app.companyprocessor.addresses[addr] = company;
            } else {
                this.app.companyprocessor.deletedCompanies.push(company);

                var indexOf = this.app.companyprocessor.domains.indexOf(company.domain);

                if (indexOf >= 0) {
                    this.app.companyprocessor.domains.splice(indexOf, 1);
                }
            }
        }
    }

    for (var i = 0; i < b.transactions.length; i++) {
        var r = this.transactionprocessor.removeUnconfirmedTransaction(b.transactions[i]);

        var fee = 0;

        switch (b.transactions[i].type) {
            case 0:
            case 1:
                switch (b.transactions[i].subtype) {
                    case 0:
                        fee = parseInt(b.transactions[i].amount / 100 * this.fee);

                        if (fee == 0) {
                            fee = 1;
                        }
                        break;
                }
                break;

            case 2:
                switch(b.transactions[i].subtype) {
                    case 0:
                        fee = 100 * constants.numberLength;
                        break;

                }
                break;

            case 3:
                switch (b.transactions[i].subtype) {
                    case 0:
                        fee = 1000 * constants.numberLength;
                        break;
                }
                break;
        }


        if (r) {
            var a = this.accountprocessor.getAccountByPublicKey(b.transactions[i].senderPublicKey);
            a.setUnconfirmedBalance(a.unconfirmedBalance + b.transactions[i].amount + fee);
        }

        this.transactionprocessor.getTransaction(b.transactions[i].getId()).fee = fee;
        this.transactionprocessor.getTransaction(b.transactions[i].getId()).blockId = b.getId();
    }


    for (var r in b.requests) {
        var request = b.requests[r];
        var address = this.app.accountprocessor.getAddressByPublicKey(request.publicKey);
        if (!this.app.requestprocessor.confirmedRequests[address]) {
            this.app.requestprocessor.confirmedRequests[address] = [];
        }

        this.app.requestprocessor.confirmedRequests[address].push(request);
    }


    this.lastBlock = b.getId();
    this.logger.info("Block processed: " + b.getId());

    // save block, transactions, addresses to db.
    this.app.db.writeBlock(b);

    for (var i = 0; i < b.transactions.length; i++) {
        b.transactions[i].sender = this.app.accountprocessor.getAccountByPublicKey(b.transactions[i].senderPublicKey).address;

        this.app.db.writeTransaction(b.transactions[i]);

        switch (b.transactions[i].type) {
            case 2:
                switch (b.transactions[i].subtype) {
                    case 0:
                        this.app.db.writeSignature(b.transactions[i].asset);
                        break;
                }
                break;

            case 3:
                switch (b.transactions[i].subtype) {
                    case 0:
                        this.app.db.writeCompany(b.transactions[i].asset);
                        break;
                }
                break;
        }
    }


    for (var r in b.requests) {
        this.app.db.writePeerRequest(b.requests[r]);
    }

    for (var i = 0; i < b.confirmations.length; i++) {
        this.app.db.writeCompanyConfirmation(b.confirmations[i]);
    }

    this.app.requestprocessor.unconfirmedRequests = {};

    this.actualFeeVolume += b.totalAmount + b.totalFee;

    var lastFee = this.fee;

    if (this.nextFeeVolume <= this.actualFeeVolume) {
        this.fee -= this.fee / 100 * 25;
        this.nextFeeVolume *= 2;
        this.actualFeeVolume = 0;
    }

    b.fee = this.fee;

    // пересчитываем баланс у неподтвержденных транзакций
    for (var tId in this.app.transactionprocessor.unconfirmedTransactions) {
        var t = this.app.transactionprocessor.unconfirmedTransactions[tId];

        if ((t.type == 1 || t.type == 0) && t.subtype == 0) {
            var lastAmount = parseInt(t.amount / 100 * lastFee);

            if (lastAmount == 0) {
                lastAmount = 1;
            }

            lastAmount += t.amount;

            var fee = parseInt(t.amount / 100.00 * this.fee);

            if (fee == 0) {
                fee = 1;
            }

            fee += t.amount;

            a.setUnconfirmedBalance(a.unconfirmedBalance + lastAmount - fee);
        }
    }

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
        var transactions = [];
        for (var i = 0; i < genesisblock.transactions.length; i++) {
            var gt = genesisblock.transactions[i];
            var t = new transaction(0, null, 0, new Buffer(genesisblock.sender, 'hex'), gt.recipient, gt.amount * constants.numberLength, 0, new Buffer(gt.signature, 'hex'));
            t.sender = app.accountprocessor.getAddressByPublicKey(t.senderPublicKey);
            t.fee = 0;

            if (!t.verify()) {
                app.logger.error("Genesis transaction has not valid signature: " + t.recipientId);
                return false;
            }

            transactions.push(t);
        }


        var req = new request(null, null, "127.0.0.1", new Buffer(genesisblock.requestGeneratorPublicKey, 'hex'), 0, new Buffer(genesisblock.requestSignature, 'hex'));

        if (!req.verify()) {
            app.logger.error("Genesis request has not valid signature: " + req.getId());
            return false;
        }

        var requestsLength = req.getBytes().length;
        var payloadHash = crypto.createHash('sha256');
        var payloadLength = 0;

        for (var i = 0; i < transactions.length; i++) {
            var bytes = transactions[i].getBytes();
            payloadHash.update(bytes);
            payloadLength += bytes.length;
        }

        payloadHash.update(req.getBytes());

        payloadHash = payloadHash.digest();

        var generationSignature = new Buffer(64);
        generationSignature.fill(0);


        b = new block(0, null, 0, null, transactions, 100000000 * constants.numberLength, 0 * constants.numberLength, payloadLength, payloadHash, new Buffer(genesisblock.sender, 'hex'), generationSignature, new Buffer(genesisblock.blockSignature, 'hex'));
        b.requestsLength = requestsLength;
        b.baseTarget = bignum(constants.initialBaseTarget);
        b.cumulativeDifficulty = 0;
        b.numberOfTransactions = 1;
        b.numberOfRequests = 1;
        b.height = 1;
        b.requests = [req];
        bc.lastBlock = b.getId();


        for (var i = 0; i < transactions.length; i++) {
            transactions[i].blockId = b.getId();
        }

        req.blockId = b.getId();

        b.setApp(app);

        var r = b.analyze();

        if (!r) {
            app.logger.error("Genesis block not added");
            return null;
        }

        var address = app.accountprocessor.getAddressByPublicKey(req.publicKey);
        app.requestprocessor.confirmedRequests[address] = [req];
        app.blockchain.blocks[b.getId()] = b;
        app.blockchain.lastBlock = b.getId();

        app.db.writeBlock(b, function (err) {
            if (err) {
                cb(err);
            } else {
                for (var i = 0; i < transactions.length; i++) {
                    app.db.writeTransaction(transactions[i]);
                }

                app.db.writePeerRequest(req);

                cb();
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