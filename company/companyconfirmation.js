var ed = require('ed25519'),
    _ = require('underscore'),
    ByteBuffer = require("bytebuffer"),
    crypto = require('crypto'),
    bignum = require('bignum');

var companyconfirmation = function (companyId, verified, timestamp, signature) {
    if (signature && !Buffer.isBuffer(signature)) {
        signature = new Buffer(signature);
    }

    this.companyId = companyId;
    this.verified = verified;
    this.timestamp = timestamp;
    this.signature = signature;
}

companyconfirmation.prototype.toJSON = function () {
    var obj = _.extend({}, this);
    return obj;
}

companyconfirmation.prototype.getBytes = function () {
    var bb = new ByteBuffer(8 + 1 + 4 + 64, true);

    var companyIdBuffer = bignum(this.companyId).toBuffer({ 'size' : '8' });

    for (var i = 0; i < companyIdBuffer.length; i++) {
        bb.writeByte(companyIdBuffer[i]);
    }

    if (this.verified) {
        bb.writeByte(1);
    } else {
        bb.writeByte(0);
    }

    bb.writeInt(this.timestamp);

    if (this.signature) {
        for (var i = 0; i < 64; i++) {
            bb.writeByte(this.signature[i]);
        }
    }

    bb.flip();
    return bb.toBuffer();
}


companyconfirmation.prototype.verify = function (publicKey) {
    if (!publicKey || !this.signature) {
        return false;
    }

    var bytes = this.getBytes();
    var data2 = new Buffer(bytes.length - 64);

    for (var i = 0; i < data2.length; i++) {
        data2[i] = bytes[i];
    }

    var hash = crypto.createHash('sha256').update(data2).digest();
    return ed.Verify(hash, this.signature, publicKey);
}


companyconfirmation.prototype.sign = function (secretPhrase) {
    var hash = this.getHash();
    var passHash = crypto.createHash('sha256').update(secretPhrase, 'utf8').digest();
    var keypair = ed.MakeKeypair(passHash);
    this.signature = ed.Sign(hash, keypair);
}

companyconfirmation.prototype.getHash = function () {
    var bytes = this.getBytes();
    var hash = crypto.createHash('sha256').update(bytes).digest();
    return hash;
}

companyconfirmation.prototype.getId = function () {
    if (!this.id) {
        var hash = crypto.createHash('sha256').update(this.getBytes()).digest();
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

module.exports = companyconfirmation;