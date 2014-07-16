var crypto = require('crypto'),
    ed  = require('ed25519'),
    bignum = require('bignum'),
    _ = require('underscore'),
    ByteBuffer = require("bytebuffer");

var transaction = function(type, id, timestamp, senderPublicKey, recipientId, amount, fee, signature) {
    this.type = type;
    this.subtype = 0;
    this.id = id;
    this.timestamp = timestamp;
    this.senderPublicKey = senderPublicKey;
    this.recipientId = recipientId;
    this.amount = amount;
    this.fee = fee;
    this.signature = signature;
    this.height = 9007199254740992;
}

transaction.prototype.getBytes = function () {
    var bb = new ByteBuffer(1 + 1 + 4 + 32 + 8 + 8 + 8 + 64, true);
    bb.writeByte(this.type);
    bb.writeByte(this.subtype);
    bb.writeInt(this.timestamp);

    for (var i = 0; i < this.senderPublicKey.length; i++) {
        bb.writeByte(this.senderPublicKey[i]);
    }

    var recepient = this.recipientId.slice(0, -1);
    recepient = bignum(recepient).toBuffer();

    for (var i = 0; i < 8; i++) {
        bb.writeByte(recepient[i] || 0);
    }

    bb.writeLong(this.amount);
    bb.writeLong(this.fee);

    if (this.signature) {
        for (var i = 0; i < this.signature.length; i++) {
            bb.writeByte(this.signature[i]);
        }
    }

    bb.flip();
    return bb.toBuffer();
}

transaction.prototype.toJSON = function () {
    var obj = _.extend({}, this);
    /*obj.senderPublicKey = new Buffer(this.senderPublicKey, 'hex');
    obj.signature = new Buffer(this.signature, 'hex');*/

    obj.senderPublicKey = this.senderPublicKey.toString('hex');
    obj.signature = this.signature.toString('hex');

    return obj;
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
    t.amount = bb.readUint64();
    t.fee = bb.readUint64();
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