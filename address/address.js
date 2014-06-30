var ByteBuffer = require("bytebuffer"),
    ed = require('ed25519'),
    crypto = require('crypto'),
    ecparams = require('ecurve-names')('secp256k1'),
    ECDSA = require('ecdsa'),
    BigInteger = require('bigi'),
    bignum = require('bignum'),
    _ = require('underscore');

var address = function (version, id, generatorPublicKey, publicKey, timestamp, signature, accountSignature) {
    this.version = version;
    this.id = id;
    this.generatorPublicKey = generatorPublicKey;
    this.publicKey = publicKey;
    this.timestamp = timestamp;
    this.signature = signature;
    this.accountSignature = accountSignature;
}

address.prototype.toJSON = function () {
    var jsonObj = _.extend({}, this);
    jsonObj.address = this.id;
    jsonObj.publicKey = this.publicKey.toString('hex');
    jsonObj.signature = this.signature.toString('hex');
    jsonObj.accountSignature = this.accountSignature.toString('hex');
    jsonObj.generatorPublicKey = this.generatorPublicKey.toString('hex');


    return jsonObj;
}

address.prototype.getHash = function () {
    return crypto.createHash('sha256').update(this.getBytes()).digest();
}

address.prototype.sign = function (keypair) {
    var hash = this.getHash();
    this.signature = ed.Sign(hash, keypair);
}

address.prototype.signAccount = function (keyPair) {
    var hash = this.getHash();
    this.accountSignature = ed.Sign(hash, keyPair);
}

address.prototype.getBytes = function () {
    var bb = new ByteBuffer(4 + 4 + 8 + 32 + 32 + 64 + 64, true);
    bb.writeInt(this.version);
    bb.writeInt(this.timestamp);

    var id = this.id.slice(0, -1);
    id = bignum(id).toBuffer();

    for (var i = 0; i < 8; i++) {
        bb.writeByte(id[i] || 0);
    }

    for (var i = 0; i < this.publicKey.length; i++) {
        bb.writeByte(this.publicKey[i]);
    }

    console.log(this.generatorPublicKey);
    for (var i = 0; i < this.generatorPublicKey.length; i++) {
        bb.writeByte(this.generatorPublicKey[i]);
    }

    if (this.signature) {
        for (var i = 0; i < this.signature.length; i++) {
            bb.writeByte(this.signature[i]);
        }
    }

    if (this.accountSignature) {
        for (var i = 0; i < this.accountSignature.length; i++) {
            bb.writeByte(this.accountSignature[i]);
        }
    }

    bb.flip();
    var b = bb.toBuffer();
    return b;
}

address.prototype.verify = function () {
    var bytes = this.getBytes();
    var data2 = new Buffer(bytes.length - 128);

    for (var i = 0; i < data2.length; i++) {
        data2[i] = bytes[i];
    }

    var hash = crypto.createHash('sha256').update(data2).digest();
    return ed.Verify(hash, this.signature, this.publicKey);
}

address.prototype.accountVerify = function () {
    var bytes = this.getBytes();
    var data2 = new Buffer(bytes.length - 64);

    for (var i = 0; i < data2.length; i++) {
        data2[i] = bytes[i];
    }

    var hash = crypto.createHash('sha256').update(data2).digest();
    return ed.Verify(hash, this.accountSignature, this.generatorPublicKey);
}

module.exports = address;