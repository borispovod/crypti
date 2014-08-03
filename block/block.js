var crypto = require('crypto'),
    ed  = require('ed25519'),
    bignum = require('bignum'),
    _ = require('underscore'),
    genesis = require('./genesisblock.js'),
    account = require("../account").account,
    constants = require("../Constants.js"),
    ByteBuffer = require("bytebuffer"),
    bufferEqual = require('buffer-equal'),
    utils = require('../utils.js');

var block = function (version, id, timestamp, previousBlock, transactions, totalAmount, totalFee, payloadLength, payloadHash, generatorPublicKey, generationSignature, blockSignature) {
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
    this.cumulativeDifficulty = null;
    this.nextBlock = null;
    this.height = 0;
    this.baseTarget = 0;
    this.numberOfRequests = 0;
    this.addressesLength = 0;
    this.requestsLength = 0;
    this.generationWeight = bignum(0);

    if (this.transactions) {
        this.numberOfTransactions = this.transactions.length;
    } else {
        this.numberOfTransactions = 0;
    }

    if (this.addresses) {
        this.numberOfAddresses = this.addresses.length;
    } else {
        this.numberOfAddresses = 0;
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
    /*obj.payloadHash = new Buffer(this.payloadHash, 'hex');
    obj.generatorPublicKey = new Buffer(this.generatorPublicKey, 'hex');
    obj.generationSignature = new Buffer(this.generationSignature, 'hex');
    obj.blockSignature = new Buffer(this.blockSignature, 'hex');*/

    obj.payloadHash = this.payloadHash.toString('hex');
    obj.generatorPublicKey = this.generatorPublicKey.toString('hex');
    obj.generationSignature = this.generationSignature.toString('hex');
    obj.blockSignature = this.blockSignature.toString('hex');
    obj.generationWeight = this.generationWeight.toString();

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
        this.cumulativeDifficulty = bignum("0");
        this.baseTarget = bignum(constants.initialBaseTarget);
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

        a.addToBalance(this.totalFee);
        a.addToUnconfirmedBalance(this.totalFee);

    } else {
        this.blockchain.getLastBlock().nextBlock = this.getId();
        this.height = this.blockchain.getLastBlock().height + 1;
        this.blockchain.blocks[this.getId()] = this;

        this.baseTarget = this.getBaseTarget();
        //this.cumulativeDifficulty = this.blockchain.getBlock(this.previousBlock).cumulativeDifficulty.add(bignum(constants.two64).div(bignum(this.baseTarget.toString())));
        var a = this.accountprocessor.getAccountByPublicKey(this.generatorPublicKey);
        a.setApp(this.app);
        this.accountprocessor.addAccount(a);

        a.addToBalance(this.forForger);
        a.addToUnconfirmedBalance(this.forForger);
    }


    for (var a in this.addresses) {
        var addr = this.addresses[a];
        this.app.addressprocessor.addresses[addr.id] = addr;
    }

    for (var i = 0; i < this.transactions.length; i++) {
        var t = this.transactions[i];
        var sender = this.accountprocessor.getAccountByPublicKey(t.senderPublicKey)
        sender.setBalance(sender.balance - (t.amount + t.fee));
        sender.setUnconfirmedBalance(sender.unconfirmedBalance - (t.amount + t.fee));

        var recepient = this.accountprocessor.getAccountById(t.recipientId);

        if (!recepient) {
            recepient = new account(t.recipientId);
            recepient.setApp(this.app);
            recepient.setHeight(this.blockchain.getLastBlock().height);
            this.accountprocessor.addAccount(recepient);
        }



        if (t.recipientId[t.recipientId.length - 1] == "D") {
            //t.type = 1;
            var address = this.app.addressprocessor.addresses[t.recipientId];

            /*if (!address) {
                address = this.app.addressprocessor.unconfirmedAddresses[t.recipientId];
            }*/

            var addr = this.accountprocessor.getAddressByPublicKey(address.generatorPublicKey);
            addr.popWeight = t.amount;
            recepient = this.accountprocessor.getAccountById(addr);

            if (!recepient) {
                recepient = new account(addr);
                recepient.setHeight(this.blockchain.getLastBlock().height);
                this.accountprocessor.addAccount(recepient);
            }
        }

        switch (t.type) {
            case 0:
                switch (t.subtype) {
                    case 0:
                        recepient.addToBalance(t.amount);
                        recepient.addToUnconfirmedBalance(t.amount);
                        break;
                }
                break;

            case 1:
                switch (t.subtype) {
                    case 0:
                        var value = 0;

                        if (t.fee >= 2) {
                            if (t.fee % 2 != 0) {
                                var r = t.fee % 2;
                                value = t.fee / 2 - r;
                            } else {
                                value = t.fee / 2;
                            }
                        }

                        recepient.addToBalance(t.amount + value);
                        recepient.addToUnconfirmedBalance(t.amount + value);
                        break;
                }
                break;
        }
    }

    return true;
}

block.prototype.getBaseTarget = function () {
    var lastBlock = this.blockchain.getLastBlock();

    if (lastBlock.getId() == genesis.blockId) {
        return this.blockchain.getBlock(lastBlock.getId()).baseTarget;
    } else {
        var previousBlock = this.blockchain.getBlock(lastBlock.previousBlock);
        var newBaseTarget = previousBlock.baseTarget.mul(bignum(lastBlock.timestamp - previousBlock.timestamp)).div(60).toNumber();

        if (newBaseTarget < 0 || newBaseTarget > constants.maxBaseTarget) {
            newBaseTarget = constants. maxBaseTarget;
        }

        if (newBaseTarget < previousBlock.baseTarget.toNumber() / 2) {
            newBaseTarget = previousBlock.baseTarget.toNumber() / 2;
        }

        if (newBaseTarget == 0) {
            newBaseTarget = 1;
        }

        var twofoldCurBaseTarget = previousBlock.baseTarget.toNumber() * 2;

        if (twofoldCurBaseTarget < 0) {
            twofoldCurBaseTarget = maxBaseTarget;

        }
        if (newBaseTarget > twofoldCurBaseTarget) {
            newBaseTarget = twofoldCurBaseTarget;
        }

        return bignum(newBaseTarget.toString());
    }
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
/*
block.prototype.getBaseTarget = function (previousBlock) {
    if (this.getId() == genesis.blockId && !this.previousBlockId) {
        this.baseTarget = 153722867;
        this.cumulativeDifficulty = 0;

        return this.baseTarget;
    } else {
        var prevBaseTarget = this.blockchain.getBlock(previousBlock).baseTarget;
        var prevNum = bignum.fromBuffer(prevBaseTarget);
        var newBaseTarget = bignum.fromBuffer(prevBaseTarget).mul(bignum(this.timestamp - previousBlock.timestamp)).div(bignum(60));

        if (newBaseTarget.lt(0) || newBaseTarget.gt(153722867 * 1000000000)) {
            newBaseTarget = bignum(153722867 * 1000000000);
        }

        if (newBaseTarget.lt(prevNum.mul(2))) {
            newBaseTarget = prevNum.mul(2);
        }

        if (newBaseTarget.eq(0)) {
            newBaseTarget = bignum(1);
        }

        var twofoldCurBaseTarget = prevNum.mul(2);
        if (twofoldCurBaseTarget.lt(0)) {
            twofoldCurBaseTarget = bignum(153722867 * 1000000000);
        }

        if (newBaseTarget.gt(twofoldCurBaseTarget)) {
            newBaseTarget = twofoldCurBaseTarget;
        }

        this.baseTarget = newBaseTarget.toBuffer();
        return this.baseTarget;
    }
}*/

block.prototype.getBytes = function () {
    var size = 4 + 4 + 8 + 4 + 4 + 4 + 8 + 8 + 8 + 4 + 4 + 4 + 32 + 32 + 64 + 64;

    var bb = new ByteBuffer(size, true);
    bb.writeInt(this.version);
    bb.writeInt(this.timestamp);

    if (this.previousBlock) {
        var pb = bignum(this.previousBlock).toBuffer({ size : '8' });

        for (var i = 0; i < 8; i++) {
            bb.writeByte(pb[i]);
        }
    } else {
        for (var i = 0; i < 8; i++) {
            bb.writeByte(0);
        }
    }

    bb.writeInt(this.numberOfAddresses);
    bb.writeInt(this.numberOfTransactions);
    bb.writeInt(this.numberOfRequests);
    bb.writeLong(this.totalAmount);
    bb.writeLong(this.totalFee);

    var generationWeightBuffer = this.generationWeight.toBuffer({ size : '8' });

    for (var i = 0; i < 8; i++) {
        bb.writeByte(generationWeightBuffer[i]);
    }

    bb.writeInt(this.payloadLength);
    bb.writeInt(this.addressesLength);
    bb.writeInt(this.requestsLength);

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
    /*var a = this.accountprocessor.getAccountByPublicKey(this.generatorPublicKey);

    if (a == null) {
        a = { publickey : this.generatorPublicKey };
    }*/

    var data = this.getBytes();
    var data2 = new Buffer(data.length - 64);

    for (var i = 0; i < data2.length; i++) {
        data2[i] = data[i];
    }

    //console.log(this.generatorPublicKey);

    var hash = crypto.createHash('sha256').update(data2).digest();
    return ed.Verify(hash, this.blockSignature, this.generatorPublicKey);
}

block.prototype.verifyGenerationSignature = function () {
    var previousBlock = this.blockchain.getBlock(this.previousBlock);
    var needWeightBuffer = new Buffer(8);

    var elapsedTime = this.timestamp - previousBlock.timestamp;

    if (elapsedTime < 60) {
        console.log("Block timestamp not valid");
        return false;
    }

    var cycle = parseInt(elapsedTime / 60);
    cycle -= 1;

    for (var i = 0; i < 8; i++) {
        needWeightBuffer[i] = previousBlock.generationSignature[i];
    }

    var needWeight = bignum.fromBuffer(needWeightBuffer);

    var requests = _.map(this.app.requestprocessor.unconfirmedRequests, function (v) { return v; });
    var accounts = [];

    for (var i = 0; i < requests.length; i++) {
        var item = requests[i];

        var account = this.app.accountprocessor.getAccountByPublicKey(item.publicKey);

        console.log(account.address + "/" + account.getEffectiveBalance());

        if (!account || account.getEffectiveBalance() < 10000 * constants.numberLength) {
            console.log("here");
            continue;
        }

        var buffer = new Buffer(8);
        for (var j = 0; j < 8; j++) {
            buffer[j] = item.signature[j];
        }

        accountWeight = bignum.fromBuffer(buffer);
        var different = bignum(0);

        if (accountWeight.gt(needWeight)) {
            accountWeight = accountWeight.sub(account.popWeight);

            if (accountWeight.lt(needWeight)) {
                accountWeight = bignum(needWeight);
            }

            different = different.add(accountWeight.sub(needWeight));
        } else {
            accountWeight = accountWeight.add(account.popWeight);

            if (accountWeight.gt(needWeight)) {
                accountWeight = bignum(needWeight);
            }

            different = different.add(needWeight.sub(accountWeight));
        }

        accounts.push({ weight : different, address : account.address });
    }

    accounts.sort(function compare(a,b) {
        if (a.weight.lt(b.weight))
            return -1;

        if (a.weight.gt(b.weight))
            return 1;

        return 0;
    });


    //accounts = accounts.reverse();


    if (cycle + 1 > accounts.length) {
        cycle = accounts.length - 1;
    }

    console.log(cycle);
    var generator = accounts[cycle];

    console.log("generator: " + this.generationWeight.toString());
    console.log("to generate: " + generator.weight.toString());

    console.log(accounts);

    if (this.generationWeight.toString() == generator.weight.toString()) {
        return true;
    } else {
        console.log("generator not valid");
        return false;
        // проверяем предыдущие аккаунты, в будующем надо добавить от форков
        /*var i = 0;
        for (var i = 0; accounts.length < 0; i++) {
            if (accountss[i].publicKey.toString ('hex') == this.generatorPublicKey.toString('hex')) {
                break;
            }
        }

        if (i < cycle) {
            return true;
        } else {
            return false;
        }*/
    }
}

module.exports.block = block;