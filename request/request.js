var ed = require('ed25519'),
    _ = require('underscore'),
    ByteBuffer = require("bytebuffer"),
    crypto = require('crypto'),
    bignum = require('bignum');

var request = function (id, blockId, ip, publicKey, lastAliveBlock, signature) {
    if (publicKey && !Buffer.isBuffer(publicKey)) {
        publicKey = new Buffer(publicKey);
    }

    if (signature && !Buffer.isBuffer(signature)) {
        signature = new Buffer(signature);
    }

    this.id = id;
    this.ip = ip;
    this.publicKey = publicKey;
    this.signature = signature;
    this.lastAliveBlock = lastAliveBlock;
    this.blockId = blockId;
}

request.prototype.toJSON = function () {
    var obj = _.extend({}, this);

    return obj;
}

request.prototype.getBytes = function () {
    var bb = new ByteBuffer(32 + 8 + 64, true);

    for (var i = 0; i < this.publicKey.length; i++) {
        bb.writeByte(this.publicKey[i]);
    }

    var blockBuffer = bignum(this.lastAliveBlock).toBuffer({ size : '8' });

    for (var i = 0; i < 8; i++) {
        bb.writeByte(blockBuffer[i]);
    }

    if (this.signature) {
        for (var i = 0; i < this.signature.length; i++) {
            bb.writeByte(this.signature[i]);
        }
    }

    bb.flip();
    return bb.toBuffer();
}

request.prototype.verify = function () {
    if (!this.signature || !this.publicKey) {
        return false;
    }

    var bytes = this.getBytes();
    var data2 = new Buffer(bytes.length - 64);

    for (var i = 0; i < data2.length; i++) {
        data2[i] = bytes[i];
    }

    var hash = crypto.createHash('sha256').update(data2).digest();
    return ed.Verify(hash, this.signature, this.publicKey);
}

request.prototype.sign = function (secretPhrase) {
    var hash = this.getHash();
    var passHash = crypto.createHash('sha256').update(secretPhrase, 'utf8').digest();
    var keypair = ed.MakeKeypair(passHash);
    this.signature = ed.Sign(hash, keypair);
}

request.prototype.getHash = function () {
    var bytes = this.getBytes();
    var hash = crypto.createHash('sha256').update(bytes).digest();
    return hash;
}

request.prototype.getId = function () {
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

module.exports = request;