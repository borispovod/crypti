var crypto = require('crypto'),
    ed  = require('ed25519'),
    bignum = require('bignum'),
    _ = require('underscore'),
    ByteBuffer = require("bytebuffer");

var transaction = function(type, id, timestamp, senderPublicKey, recipientId, amount, deadline, fee, referencedTransaction, signature) {
    this.type = type;
    this.subtype = 0;
    this.id = id;
    this.timestamp = timestamp;
    this.deadline = deadline;
    this.senderPublicKey = senderPublicKey;
    this.recipientId = recipientId;
    this.amount = amount;
    this.fee = fee;
    this.referencedTransaction = referencedTransaction;
    this.signature = signature;
    this.height = 9007199254740992;
}

transaction.prototype.getBytes = function () {
    var bb = new ByteBuffer(1 + 1 + 4 + 2 + 32 + 8 + 4 + 4 + 8 + 64, true);
    bb.writeByte(this.type);
    bb.writeByte(this.subtype);
    bb.writeInt(this.timestamp);
    bb.writeShort(this.deadline);

    for (var i = 0; i < this.senderPublicKey.length; i++) {
        bb.writeByte(this.senderPublicKey[i]);
    }


    var recepient = this.recipientId.slice(0, -1);
    recepient = bignum(recepient).toBuffer();

    for (var i = 0; i < 8; i++) {
        bb.writeByte(recepient[i] || 0);
    }

    bb.writeInt(this.amount);
    bb.writeInt(this.fee);

    if (this.referencedTransaction) {
        var referncedTransactionBuffer = bignum(this.referencedTransaction).toBuffer();
        for (var i = 0; i < 8; i++) {
            bb.writeByte(referncedTransactionBuffer[i] || 0);
        }
    } else {
        for (var i = 0; i < 8; i++) {
            bb.writeByte(0);
        }
    }

    if (this.signature) {
        for (var i = 0; i < this.signature.length; i++) {
            bb.writeByte(this.signature[i]);
        }
    }

    bb.flip();
    return bb.toBuffer();
}

transaction.prototype.getJSON = function () {
    return JSON.stringify(this);
}

transaction.prototype.getId = function () {
    if (!this.id) {
        var hash = crypto.createHash('sha256').update(this.getBytes()).digest();
        var temp = new Buffer(8);
        for (var i = 0; i < 8; i++) {
            temp[i] = hash[7 - i];
        }

        this.id =  bignum.fromBuffer(temp).toString();
        return this.id;
    } else {
        return this.id;
    }
}

transaction.prototype.fromJSON = function (JSON) {
    try {
        var json = JSON.parse(JSON);
        return new transaction(json.type, json.id, json.timestamp, json.senderPublicKey, json.recipientId, json.amount, json.deadline, json.fee, json.referencedTransaction, json.signature);
    } catch (e) {
        return null;
    }
}

transaction.prototype.fromBytes = function (buffer) {
    var bb = ByteBuffer.wrap(buffer);
    bb.flip();

    var t = new transaction();
    t.type = bb.readByte();
    t.subtype = bb.readByte();
    t.deadline = bb.readShort();

    var buffer = new Buffer(32);
    for (var i = 0; i < 32; i++) {
        buffer[i] = bb.readByte();
    }

    t.senderPublicKey = buffer;

    var recepient = bb.readLong();
    t.recipientId = recepient + "C";
    t.amount = bb.readInt();
    t.fee = bb.readInt();
    t.referencedTransaction = bb.readLong();

    var signature = new Buffer(64);
    for (var i = 0; i < 64; i++) {
        signature[i] = bb.readByte();
    }

    t.signature = signature;
    return t;
}

transaction.prototype.sign = function (secretPharse) {
    var hash = this.getHash();
    var passHash = crypto.createHash('sha256').update(secretPharse, 'utf8').digest();
    var keypair = ed.MakeKeypair(passHash);
    this.signature = ed.Sign(hash, keypair);
}

transaction.prototype.verify = function () {
    if (!this.signature || !this.senderPublicKey) {
        return false;
    }

    var bytes = this.getBytes();
    var data2 = new Buffer(bytes.length - 64);

    for (var i = 0; i < data2.length; i++) {
        data2[i] = bytes[i];
    }

    var hash = crypto.createHash('sha256').update(data2).digest();
    return ed.Verify(hash, this.signature, this.senderPublicKey);
}

transaction.prototype.getHash = function () {
    return crypto.createHash('sha256').update(this.getBytes()).digest();
}

transaction.prototype.getSize = function () {
    return this.getBytes().length;
}

transaction.prototype.setBlockId = function (blockId) {
    this.blockId = blockId;
}

module.exports = transaction;