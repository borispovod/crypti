var crypto = require('crypto'),
    ed  = require('ed25519'),
    bignum = require('bignum'),
    _ = require('underscore'),
    genesis = require('./genesisblock.js'),
    account = require("../account").account,
    constants = require("../Constants.js"),
    ByteBuffer = require("bytebuffer"),
    utils = require('../utils.js');

var block = function (version, id, timestamp, previousBlock, transactions, totalAmount, totalFee, payloadLength, payloadHash, generatorPublicKey, generationSignature, blockSignature) {
    if (payloadHash && !Buffer.isBuffer(payloadHash)) {
        payloadHash = new Buffer(payloadHash);
    }

    if (generatorPublicKey && !Buffer.isBuffer(generatorPublicKey)) {
        generatorPublicKey = new Buffer(generatorPublicKey);
    }

    if (generationSignature && !Buffer.isBuffer(generationSignature)) {
        generationSignature = new Buffer(generationSignature);
    }

    if (blockSignature && !Buffer.isBuffer(blockSignature)) {
        blockSignature = new Buffer(blockSignature);
    }

    this.version = version;
    this.id = id;
    this.timestamp = timestamp;
    this.previousBlock = previousBlock;
    this.transactions = transactions || [];
    this.totalAmount = totalAmount;
    this.totalFee = totalFee;
    this.payloadLength = payloadLength;
    this.payloadHash = payloadHash;
    this.generatorPublicKey = generatorPublicKey;
    this.generationSignature = generationSignature;
    this.blockSignature = blockSignature;
    this.nextBlock = null;
    this.height = 0;
    this.numberOfRequests = 0;
    this.numberOfConfirmations = 0;
    this.requestsLength = 0;
    this.confirmationsLength = 0;
    this.weight = bignum(0);
    this.generationWeight = bignum(1);
    this.removedWeights = [];

    if (this.transactions) {
        this.numberOfTransactions = this.transactions.length;
    } else {
        this.numberOfTransactions = 0;
    }
}


block.prototype.setApp = function (app) {
    this.app = app;
    this.blockchain = app.blockchain;
    this.accountprocessor = app.accountprocessor;
    this.logger = app.logger;
}

block.prototype.toJSON = function () {
    var obj = _.extend({}, this);

    obj.app = null;
    obj.blockchain = null;
    obj.accountprocessor = null;
    obj.logger = null;
    delete obj.app;
    delete obj.blockchain;
    delete obj.accountprocessor;
    delete obj.logger;

    return obj;
}

block.prototype.analyze = function () {
    if (!this.previousBlock) {
        this.id = genesis.blockId;
        this.blockchain.blocks[this.getId()] = this;
        this.blockchain.lastBlock = this.getId();

        var a = new account(this.accountprocessor.getAddressByPublicKey(this.generatorPublicKey), this.generatorPublicKey);
        a.setApp(this.app);
        a.app.blockchain = this.blockchain;
        a.setHeight(this.blockchain.getLastBlock().height);
        this.accountprocessor.addAccount(a);

        if (!this.verifyBlockSignature()) {
            this.logger.error("Genesis block has not valid signature");
            return false;
        }

        a.addToBalance(0);
        a.addToUnconfirmedBalance(0);

    } else {
        this.blockchain.getLastBlock().nextBlock = this.getId();
        this.height = this.blockchain.getLastBlock().height + 1;
        this.blockchain.blocks[this.getId()] = this;

        var a = this.accountprocessor.getAccountByPublicKey(this.generatorPublicKey);
        a.setApp(this.app);
        this.accountprocessor.addAccount(a);

        a.addToBalance(this.forForger);
        a.addToUnconfirmedBalance(this.forForger);
    }


    for (var i = 0; i < this.transactions.length; i++) {
        var t = this.transactions[i];
        var sender = this.accountprocessor.getAccountByPublicKey(t.senderPublicKey);

        var fee = 0;
        switch (t.type) {
            case 0:
            case 1:
                switch (t.subtype) {
                    case 0:
                        fee = parseInt(t.amount / 100 * this.app.blockchain.fee);

                        if (fee == 0) {
                            fee = 1;
                        }
                        break;
                }
                break;

            case 2:
                switch(t.subtype) {
                    case 0:
                        fee = 100 * constants.numberLength;
                        break;
                }
                break;

            case 3:
                switch (t.subtype)  {
                    case 0:
                        fee = 1000 * constants.numberLength;
                        break;
                }
                break;
        }

        sender.setBalance(sender.balance - (t.amount + fee));
        sender.setUnconfirmedBalance(sender.unconfirmedBalance - (t.amount + fee));

        var recipient = null;

        if ((t.type == 0 || t.type == 1) && t.subtype == 0) {
            recipient = this.accountprocessor.getAccountById(t.recipientId);

            if (!recipient) {
                recipient = new account(t.recipientId);
                recipient.setApp(this.app);
                recipient.setHeight(this.blockchain.getLastBlock().height);
                this.accountprocessor.addAccount(recipient);
            }

            if (t.recipientId[t.recipientId.length - 1] == "D" && t.type == 1 && t.subtype == 0) {
                var company = this.app.companyprocessor.addresses[t.recipientId];

                var addr = this.accountprocessor.getAddressByPublicKey(company.generatorPublicKey);
                recipient = this.accountprocessor.getAccountById(addr);

                if (!recipient) {
                    recipient = new account(addr);
                    recipient.setHeight(this.blockchain.getLastBlock().height);
                    this.accountprocessor.addAccount(recipient);
                }
            }
        }

        switch (t.type) {
            case 3:
                switch (t.subtype) {
                    case 0:
                        var company = t.asset;
                        company.blocks = 1;
                        this.app.companyprocessor.unconfirmedCompanies[company.domain] = null;
                        delete this.app.companyprocessor.unconfirmedCompanies[company.domain];
                        this.app.companyprocessor.addedCompanies[company.domain] = company;
                        this.app.companyprocessor.confirmations[company.domain] = 1;
                        this.app.companyprocessor.domains.push(company.domain);
                        this.app.companyprocessor.addedCompaniesIds[company.getId()] = company;

                        if (!this.app.accountprocessor.purchases[this.getId()]) {
                            this.app.accountprocessor.purchases[this.getId()] = {};
                        }

                        if (!this.app.accountprocessor.purchases[this.getId()][sender.address]) {
                            this.app.accountprocessor.purchases[this.getId()][sender.address] = 0;
                        }

                        this.app.accountprocessor.purchases[this.getId()][sender.address] += fee / constants.numberLength;
                        break;
                }
            break;

            case 2:
                switch (t.subtype) {
                    case 0:
                        var signature = t.asset;
                        var a = this.app.accountprocessor.getAccountByPublicKey(signature.generatorPublicKey);
                        this.app.signatureprocessor.removeUnconfirmedSignature(a.address);
                        this.app.signatureprocessor.addSignature(a.address, signature);

                        if (!this.app.accountprocessor.purchases[this.getId()]) {
                            this.app.accountprocessor.purchases[this.getId()] = {};
                        }

                        if (!this.app.accountprocessor.purchases[this.getId()][sender.address]) {
                            this.app.accountprocessor.purchases[this.getId()][sender.address] = 0;
                        }

                        this.app.accountprocessor.purchases[this.getId()][sender.address] += fee / constants.numberLength;

                        break;
                }
                break;

            case 0:
                switch (t.subtype) {
                    case 0:
                        recipient.addToBalance(t.amount);
                        recipient.addToUnconfirmedBalance(t.amount);

                        if (!this.app.accountprocessor.purchases[this.getId()]) {
                            this.app.accountprocessor.purchases[this.getId()] = {};
                        }

                        if (!this.app.accountprocessor.purchases[this.getId()][sender.address]) {
                            this.app.accountprocessor.purchases[this.getId()][sender.address] = 0;
                        }

                        this.app.accountprocessor.purchases[this.getId()][sender.address] += (t.amount + fee) / constants.numberLength;
                        break;
                }
                break;

            case 1:
                switch (t.subtype) {
                    case 0:
                        var value = 0;

                        if (fee >= 2) {
                            if (fee % 2 != 0) {
                                value = parseInt(fee / 2);
                            } else {
                                value = fee / 2;
                            }
                        }

                        var blockId = this.getId();

                        if (!this.app.accountprocessor.purchases[this.getId()]) {
                            this.app.accountprocessor.purchases[this.getId()] = {};
                        }

                        if (!this.app.accountprocessor.purchases[this.getId()][sender.address]) {
                            this.app.accountprocessor.purchases[this.getId()][sender.address] = 0;
                        }

                        this.app.accountprocessor.purchases[this.getId()][sender.address] += (t.amount + fee) / constants.numberLength;

                        this.app.blockchain.totalPurchaseAmount += t.amount / constants.numberLength;
                        recipient.addToBalance(t.amount + value);
                        recipient.addToUnconfirmedBalance(t.amount + value);
                        break;
                }
                break;
        }
    }

    return true;
}

block.prototype.getJSON = function () {
    return JSON.stringify(this);
}

block.prototype.setPreviousBlock = function (block, cb) {
    if (block) {
        if (block.getId() != this.previousBlockId) {
            if (cb) {
                return cb("Previous block id not valid");
            } else {
                return false;
            }
        }

        this.height = block.height + 1;
        if (cb) {
            return cb(null, true);
        } else {
            return true;
        }
    } else {
        this.height = 0;

        if (cb) {
            cb(null, true);
        } else {
            return true;
        }
    }
}

block.prototype.getBytes = function () {
    var size = 4 + 4 + 8 + 4 + 4 + 4 + 8 + 8 + 4 + 4 + 4 + 32 + 32 + 64 + 64;

    var bb = new ByteBuffer(size, true);
    bb.writeInt(this.version);
    bb.writeInt(this.timestamp);

    if (this.previousBlock) {
        var pb = bignum(this.previousBlock.toString()).toBuffer({ size : '8' });

        for (var i = 0; i < 8; i++) {
            bb.writeByte(pb[i]);
        }
    } else {
        for (var i = 0; i < 8; i++) {
            bb.writeByte(0);
        }
    }

    bb.writeInt(this.numberOfTransactions);
    bb.writeInt(this.numberOfRequests);
    bb.writeInt(this.numberOfConfirmations);
    bb.writeLong(this.totalAmount);
    bb.writeLong(this.totalFee);

    bb.writeInt(this.payloadLength);
    bb.writeInt(this.requestsLength);
    bb.writeInt(this.confirmationsLength);

    for (var i = 0; i < this.payloadHash.length; i++) {
        bb.writeByte(this.payloadHash[i]);
    }

    for (var i = 0; i < this.generatorPublicKey.length; i++) {
        bb.writeByte(this.generatorPublicKey[i]);
    }

    for (var i = 0; i < this.generationSignature.length; i++) {
        bb.writeByte(this.generationSignature[i]);
    }

    if (this.blockSignature) {
        for (var i = 0; i < this.blockSignature.length; i++) {
            bb.writeByte(this.blockSignature[i]);
        }
    }

    bb.flip();
    var b = bb.toBuffer();
    return b;
}

block.prototype.sign = function (secretPharse) {
    var hash = this.getHash();
    var passHash = crypto.createHash('sha256').update(secretPharse, 'utf8').digest();
    var keypair = ed.MakeKeypair(passHash);
    this.blockSignature = ed.Sign(hash, keypair);
}

block.prototype.getId = function () {
    if (!this.id) {
        var hash = this.getHash();
        var temp = new Buffer(8);
        for (var i = 0; i < 8; i++) {
            temp[i] = hash[7 - i];
        }

        this.id = bignum.fromBuffer(temp).toString();
        return this.id;
    } else {
        return this.id;
    }
}

block.prototype.getHash = function () {
    return crypto.createHash("sha256").update(this.getBytes()).digest();
}


block.prototype.verifyBlockSignature = function () {
    var data = this.getBytes();
    var data2 = new Buffer(data.length - 64);

    for (var i = 0; i < data2.length; i++) {
        data2[i] = data[i];
    }

    var hash = crypto.createHash('sha256').update(data2).digest();
    return ed.Verify(hash, this.blockSignature, this.generatorPublicKey);
}

block.prototype.verifyGenerationSignature = function () {
    if (this.app.blockchain.getLastBlock().height < 33950) {
        var lastAliveBlock = this.app.blockchain.getLastBlock();
        var elapsedTime = this.timestamp - lastAliveBlock.timestamp;

        if (elapsedTime < 60) {
            this.app.logger.error("Block generation signature time not valid " + this.getId() + " must be > 60, but result is: " + elapsedTime);
            return false;
        }

        var requests = _.map(lastAliveBlock.requests, function (v) {
            return v;
        });

        var accounts = [];

        for (var i = 0; i < requests.length; i++) {
            var request = requests[i];
            var account = this.app.accountprocessor.getAccountById(request.address);

            if (!account || account.getEffectiveBalance() < 1000 * constants.numberLength) {
                continue;
            }

            var address = account.address;

            var confirmedRequests = this.app.requestprocessor.confirmedRequests[address];

            if (!confirmedRequests) {
                confirmedRequests = [];
            }

            confirmedRequests = confirmedRequests.slice(0);

            var accountWeightTimestamps = 0;
            var popWeightAmount = 0;

            var previousBlock = this.app.blockchain.getBlock(lastAliveBlock.getId());
            for (var j = confirmedRequests.length - 1; j >= 0; j--) {
                if (!previousBlock) {
                    break;
                }

                var confirmedRequest = confirmedRequests[j];

                var block = this.app.blockchain.getBlock(confirmedRequest.blockId);

                if (previousBlock.getId() != block.getId()) {
                    break;
                }

                accountWeightTimestamps += block.timestamp;
                var purchases = this.app.accountprocessor.purchases[block.getId()];

                if (purchases) {
                    if (purchases[address] > 10) {
                        popWeightAmount += (Math.log(1 + purchases[address]) / Math.LN10);
                        popWeightAmount = popWeightAmount / (Math.log(1 + (block.totalAmount + block.totalFee)) / Math.LN10)
                    } else if (purchases[address]) {
                        popWeightAmount += purchases[address];
                    }
                }

                if (block.generatorId == request.address) {
                    break;
                }

                previousBlock = this.app.blockchain.getBlock(previousBlock.previousBlock);
            }


            this.app.logger.debug("Account PoT weight: " + address + " / " + accountWeightTimestamps);
            this.app.logger.debug("Account PoP weight: " + address + " / " + popWeightAmount);

            var accountTotalWeight = accountWeightTimestamps + popWeightAmount;

            accounts.push({ address: address, weight: accountTotalWeight });

            this.app.logger.debug("Account " + address + " / " + accountTotalWeight);
        }


        accounts.sort(function compare(a, b) {
            if (a.weight > b.weight)
                return -1;

            if (a.weight < b.weight)
                return 1;

            return 0;
        });

        if (accounts.length == 0) {
            this.app.logger.debug("Need accounts for forging...");
            this.workingForger = false;
            return false;
        }

        var cycle = parseInt(elapsedTime / 60) - 1;

        if (cycle > accounts.length - 1) {
            cycle = parseInt(cycle % accounts.length);
        }

        this.logger.debug("Winner in cycle is: " + cycle);

        var winner = accounts[cycle];
        var sameWeights = [winner];

        for (var i = cycle + 1; i < accounts.length; i++) {
            var accountWeight = accounts[i];

            if (winner.weight == accountWeight.weight) {
                sameWeights.push(accountWeight);
            } else {
                break;
            }
        }

        if (sameWeights.length > 1) {
            this.app.logger.debug("Same weight in cyclet: " + sameWeights.length);

            var randomWinners = [];
            for (var i = 0; i < sameWeights.length; i++) {
                var a = sameWeights[i];

                var address = a.address.slice(0, -1);
                var addressBuffer = bignum(address).toBuffer({ 'size': '8' });
                var hash = crypto.createHash('sha256').update(bignum(a.weight).toBuffer({ size: '8' })).update(addressBuffer).digest();

                var result = new Buffer(8);
                for (var j = 0; j < 8; j++) {
                    result[j] = hash[j];
                }

                var weight = bignum.fromBuffer(result, { size: '8' }).toNumber();
                this.app.logger.debug("Account " + a.address + " new weight is: " + weight);
                randomWinners.push({ address: a.address, weight: weight });
            }

            randomWinners.sort(function (a, b) {
                if (a.weight > b.weight)
                    return -1;

                if (a.weight < b.weight)
                    return 1;

                return 0;
            });


            if (cycle > randomWinners.length - 1) {
                cycle = parseInt(cycle % randomWinners.length);
            }

            winner = randomWinners[cycle];
        }

        if (this.app.blockchain.getLastBlock().height <= 2813) {
            return true;
        }

        var addr = this.app.accountprocessor.getAddressByPublicKey(this.generatorPublicKey);

        this.app.logger.debug("Winner in cycle: " + winner.address);

        if (addr == winner.address) {
            this.app.logger.debug("Valid generator " + this.getId());
            return true;
        } else {
            this.app.logger.error("Generator of block not valid: " + winner.address + " / " + addr);
            return false;
        }
    } else {
        var previousBlock = this.app.blockchain.getBlock(this.previousBlock);
        if (previousBlock == null) {
            return false;
        }

        var hash = crypto.createHash('sha256').update(previousBlock.generationSignature).update(this.generatorPublicKey);
        var generationSignatureHash = hash.digest();

        var r = ed.Verify(generationSignatureHash, this.generationSignature, this.generatorPublicKey);
        if (!r) {
            return false;
        }

        var generator = this.app.accountprocessor.getAccountByPublicKey(this.generatorPublicKey);

        if (!generator) {
            return false;
        }

        if (generator.getEffectiveBalance() < 1000 * constants.numberLength) {
            return false;
        }

        return true;
    }
}

module.exports.block = block;