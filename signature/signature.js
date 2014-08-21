var _ = require('underscore'),
    ed = require('ed25519'),
    bignum = require('bignum'),
    crypto = require('crypto'),
    ByteBuffer = require("bytebuffer");

var signature = function (publicKey, generatorPublicKey, timestamp, signature, generationSignature) {
    this.publicKey = this.isBuffer(publicKey);
    this.generatorPublicKey = this.isBuffer(generatorPublicKey);
    this.timestamp = timestamp;
    this.signature = this.isBuffer(signature);
    this.generationSignature = this.isBuffer(generationSignature);
}

signature.prototype.isBuffer = function (b) {
    if (b && Buffer.isBuffer(b)) {
        return b;
    } else if (b) {
        return new Buffer(b);
    } else {
        return null;
    }
}

signature.prototype.toJSON = function () {
    var obj = _.extend({}, this);
    return obj;
}

signature.prototype.getBytes = function () {
    var bb = new ByteBuffer(32 + 32 + 4 + 64 + 64, true);
    for (var i = 0; i < this.publicKey.length; i++) {
        bb.writeByte(this.publicKey[i]);
    }

    for (var i = 0; i < this.generatorPublicKey.length; i++) {
        bb.writeByte(this.generatorPublicKey[i]);
    }

    bb.writeInt(this.timestamp);

    if (this.signature) {
        for (var i = 0; i < this.signature.length; i++) {
            bb.writeByte(this.signature[i]);
        }
    }

    if (this.generationSignature) {
        for (var i = 0; i < this.generationSignature.length; i++) {
            bb.writeByte(this.generationSignature[i]);
        }
    }

    bb.flip();
    return bb.toBuffer();
}

signature.prototype.getHash = function () {
    return crypto.createHash("sha256").update(this.getBytes()).digest();
}

signature.prototype.getId = function () {
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

signature.prototype.verify = function () {
    if (!this.signature || !this.publicKey) {
        return false;
    }

    var data = this.getBytes();
    var data2 = new Buffer(data.length - 128);

    for (var i = 0; i < data2.length; i++) {
        data2[i] = data[i];
    }


    var hash = crypto.createHash('sha256').update(data2).digest();
    return ed.Verify(hash, this.signature, this.publicKey);
}

signature.prototype.verifyGenerationSignature = function () {
    if (!this.generationSignature || !this.generatorPublicKey) {
        return false;
    }

    var data = this.getBytes();
    var data2 = new Buffer(data.length - 64);

    for (var i = 0; i < data2.length; i++) {
        data2[i] = data[i];
    }

    var hash = crypto.createHash('sha256').update(data2).digest();
    return ed.Verify(hash, this.generationSignature, this.generatorPublicKey);
}

signature.prototype.sign = function (secretPhrase) {
    var hash = this.getHash();
    var passHash = crypto.createHash('sha256').update(secretPhrase, 'utf8').digest();
    var keypair = ed.MakeKeypair(passHash);
    this.signature = ed.Sign(hash, keypair);
}

signature.prototype.signGeneration = function (secretPhrase) {
    var hash = this.getHash();
    var passHash = crypto.createHash('sha256').update(secretPhrase, 'utf8').digest();
    var keypair = ed.MakeKeypair(passHash);
    this.generationSignature = ed.Sign(hash, keypair);
}

module.exports = signature;