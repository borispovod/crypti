var crypto = require('crypto'),
    ed  = require('ed25519'),
    bignum = require('bignum'),
    _ = require('underscore'),
    ByteBuffer = require("bytebuffer");

var transaction = function(type, id, timestamp, senderPublicKey, recipientId, amount, signature, signSignature) {
    this.type = type;
    this.subtype = 0;
    this.id = id;
    this.timestamp = timestamp;
    this.senderPublicKey = this.isBuffer(senderPublicKey);
    this.recipientId = recipientId;
    this.amount = amount;
    this.signature = this.isBuffer(signature);
    this.signSignature = signSignature;

    if (this.signSignature) {
        this.signSignature = this.isBuffer(this.signSignature);
    }

    this.height = 0;
    this.asset = null;
    this.rowId = null;
}

transaction.prototype.setRowId = function (rowId) {
    this.rowId = rowId;
}

transaction.prototype.isBuffer = function (b) {
    if (b && Buffer.isBuffer(b)) {
        return b;
    } else if (b) {
        return new Buffer(b);
    } else {
        return null;
    }
}

transaction.prototype.getBytes = function () {
    var assetSize = 0;

    switch (this.type) {
        case 2:
            switch (this.subtype) {
                case 0:
                    assetSize = 196;
                    break;
            }
            break;

        case 3:
            switch (this.subtype) {
                case 0:
                    assetSize = this.asset.getBytes().length;
                    break;
            }
            break;
    }

    var bb = new ByteBuffer(1 + 1 + 4 + 32 + 8 + 8 + 64 + 64 + assetSize, true);
    bb.writeByte(this.type);
    bb.writeByte(this.subtype);
    bb.writeInt(this.timestamp);

    for (var i = 0; i < this.senderPublicKey.length; i++) {
        bb.writeByte(this.senderPublicKey[i]);
    }

    if (this.recipientId) {
        var recipient = this.recipientId.slice(0, -1);
        recipient = bignum(recipient).toBuffer({ size : '8' });

        for (var i = 0; i < 8; i++) {
            bb.writeByte(recipient[i] || 0);
        }
    } else {
        for (var i = 0; i < 8; i++) {
            bb.writeByte(0);
        }
    }

    bb.writeLong(this.amount);

    if (assetSize > 0) {
        var assetBytes = this.asset.getBytes();

        for (var i = 0; i < assetSize; i++) {
            bb.writeByte(assetBytes[i]);
        }
    }

    if (this.signature) {
        for (var i = 0; i < this.signature.length; i++) {
            bb.writeByte(this.signature[i]);
        }
    }

    if (this.signSignature) {
        for (var i = 0; i < this.signSignature.length; i++) {
            bb.writeByte(this.signSignature[i]);
        }
    }

    bb.flip();
    return bb.toBuffer();
}

transaction.prototype.toJSON = function () {
    var obj = _.extend({}, this);

    if (this.asset) {
        obj.asset = this.asset.toJSON();
    }

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

    var toRemove = 64;

    if (this.signSignature) {
        toRemove = 128;
    }

    var bytes = this.getBytes();
    var data2 = new Buffer(bytes.length - toRemove);

    for (var i = 0; i < data2.length; i++) {
        data2[i] = bytes[i];
    }

    var hash = crypto.createHash('sha256').update(data2).digest();

    return ed.Verify(hash, this.signature, this.senderPublicKey);
}

transaction.prototype.signSignatureGeneration = function (secretPharse) {
    var hash = this.getHash();
    var passHash = crypto.createHash('sha256').update(secretPharse, 'utf8').digest();
    var keypair = ed.MakeKeypair(passHash);
    this.signSignature = ed.Sign(hash, keypair);
}

transaction.prototype.verifySignature = function (publicKey) {
    if (!publicKey || !this.signSignature) {
        return false;
    }

    var bytes = this.getBytes();
    var data2 = new Buffer(bytes.length - 64);

    for (var i = 0; i < data2.length; i++) {
        data2[i] = bytes[i];
    }

    var hash = crypto.createHash('sha256').update(data2).digest();
    return ed.Verify(hash, this.signSignature, publicKey);
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