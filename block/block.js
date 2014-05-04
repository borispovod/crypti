var crypto = require('crypto'),
    ed  = require('ed25519'),
    bignum = require('bignum'),
    _ = require('underscore'),
    genesis = require('./genesisblock.js'),
    blockchain = require("./blockchain.js").getInstance(),
    account = require("../account").account,
    accountprocessor = require("../account").accountprocessor,
    constants = require("../Constants.js");

var block = function (version, id, timestamp, previousBlock, transactions, totalAmount, totalFee, payloadLength, payloadHash, generatorPublicKey, generationSignature, blockSignature) {
    this.version = version;
    this.id = id;
    this.timestamp = timestamp;
    this.previousBlock = previousBlock;
    this.transactions = transactions;
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

    this.numbersOfTransactions = this.transactions.length;
}

block.prototype.analyze = function () {
    if (!this.previousBlock) {
        this.id = genesis.blockId;
        blockchain.pushBlock(this);
        this.cumulativeDifficulty = bignum("0");
        this.baseTarget = constants.initialBaseTarget;

        var a = new account(genesis.sender);
        accountprocessor.addAccount(a);
    } else {
        blockchain.getLastBlock().nextBlock = this.getId();
        this.height = blockchain.getLastBlock().height + 1;
        blockchain.pushBlock(this);

        this.baseTarget = this.getBaseTarget();
        this.cumulativeDifficulty = blockchain.get(this.previousBlock).cumulativeDifficulty.add(bignum(constantstwo64).div(bignum(this.baseTarget.toString())));
        var a = accountprocessor.getAccountById(accountprocessor.getAccountByPublicKey(this.generatorPublicKey));
        a.addToBalance(this.totalFee);
        a.addToUnconfirmedBalance(this.totalFee);
    }

    for (var i = 0; i < this.transactions; i++) {
        var t = this.transactions[i];
        var sender = accountprocessor.getAccountById(accountprocessor.getAccountByPublicKey(t.senderPublicKey));
        sender.setBalance(sender.balance - (t.amount + t.fee));

        var recepient = accountprocessor.getAccountById(t.recipientId);

        if (!recepient) {
            recepient = new account(t.recipientId);
            accountprocessor.addAccount(recepient);
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
        }
    }
}

block.prototype.getBaseTarget = function () {
    var lastBlock = blockchain.getLastBlock();

    if (lastBlock.getId() == genesis.blockId) {
        return blockchain.getBlock(lastBlock.getId()).baseTarget;
    } else {
        var previousBlock = blockchain.getBlock(lastBlock.previousBlock);
        var newBaseTarget = previousBlock.baseTarget.mul(bignum(lastBlock.timestamp - previousBlock.timestamp)).div(60).toNumber();

        if (newBaseTarget < 0 || newBaseTarget > constants.maxBaseTarget) {
            newBaseTarget = maxBaseTarget;
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

block.prototype.getBaseTarget = function (previousBlock) {
    if (this.getId() == genesis.blockId && !this.previousBlockId) {
        this.baseTarget = 153722867;
        this.cumulativeDifficulty = 0;

        return this.baseTarget;
    } else {
        var prevBaseTarget = previousBlock.baseTarget;
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
}

block.prototype.getBytes = function () {
    var bb = new ByteBuffer(4 + 4 + 8 + 4 + 4 + 4 + 4 + 32 + 32 + 64 + 64, true);
    bb.writeInt(this.version);
    bb.writeInt(this.timestamp);
    bb.writeLong(this.previousBlock);
    bb.writeInt(this.numbersOfTransactions);
    bb.writeInt(this.totalAmount);
    bb.writeInt(this.totalFee);
    bb.writeInt(this.payloadLength);

    for (var i = 0; i < this.payloadHash.length; i++) {
        bb.write(this.payloadHash[i]);
    }

    for (var i = 0; i < this.generatorPublicKey.length; i++) {
        bb.write(this.generatorPublicKey[i]);
    }

    for (var i = 0; i < this.generationSignature.length; i++) {
        bb.write(this.generationSignature[i]);
    }

    for (var i = 0; i < this.blockSignature.length; i++) {
        bb.write(this.blockSignature[i]);
    }

    bb.flip();
    return bb.toBuffer();
}

block.prototype.getId = function () {
    if (!this.id) {
        var hash = this.getHash();
        var temp = new Buffer(8);
        for (var i = 0; i < 8; i++) {
            temp[i] = hash[7 - i];
        }

        this.id = bignum.fromBuffer(temp).toString();
    } else {
        return this.id;
    }
}

block.prototype.getHash = function () {
    return crypto.createHash("sha256").update(this.getBytes()).digest();
}

block.prototype.verifyBlockSignature = function () {
    var a = accountprocessor.getAccountById(accountprocessor.getAccountByPublicKey(this.generatorPublicKey));
    if (a == null) {
        return false;
    }

    var data = this.getBytes();
    var data2 = new Buffer(data.length - 64);

    for (var i = 0; i < data2.length; i++) {
        data2[i] = data[i];
    }

    return ed.Verify(data2, this.blockSignature, a.publicKey);
}

block.prototype.verifyGenerationSignature = function () {
    var previousBlock = blockchain.getBlock(this.previousBlock);

    if (!previousBlock) {
        return false;
    }

    if (ed.verify(this.generationSignature, previousBlock.generationSignature, this.generatorPublicKey)) {
        return false;
    }

    var a = accountprocessor.getAccountById(accountprocessor.getAccountByPublicKey(this.generatorPublicKey));

    if (!a) {
        return false;
    }

    var effectiveBalance = a.effectiveBalance;

    if (effectiveBalance <= 0) {
        return false;
    }

    var elapsedTime = this.timestamp - previousBlock.timestamp;
    var target = bignum(blockchain.getLastBlock().getBaseTarget()).mul(bignum(effectiveBalance)).mul(bignum(elapsedTime));
    var generationSignatureHash = crypto.createHash('sha256').update(previousBlock.generationSignature).update(this.generatorPublicKey).digest();

    if (generationSignatureHash != this.generationSignature) {
        return false;
    }

    var temp = new Buffer(8);
    for (var i = 0; i < 8; i++) {
        temp[i] = generationSignatureHash[7 - i];
    }

    var hit = bignum.fromBuffer(temp);

    return hit.lessThan(target);
}

module.exports = block;