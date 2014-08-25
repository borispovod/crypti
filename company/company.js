var ed = require('ed25519'),
    _ = require('underscore'),
    ByteBuffer = require("bytebuffer"),
    crypto = require('crypto'),
    bignum = require('bignum');

var company = function (name, description, domain, email, timestamp, generatorPublicKey, signature) {
    if (generatorPublicKey && !Buffer.isBuffer(generatorPublicKey)) {
        generatorPublicKey = new Buffer(generatorPublicKey);
    }

    if (signature && !Buffer.isBuffer(signature)) {
        signature = new Buffer(signature);
    }

    this.name = name;
    this.description = description;
    this.domain = domain;
    this.email = email;
    this.timestamp = timestamp;
    this.generatorPublicKey = generatorPublicKey;
    this.signature = signature;
}

company.prototype.toJSON = function () {
    var obj = _.extend({}, this);
    return obj;
}


company.prototype.getBytes = function () {
    var nameBuffer = new Buffer(this.name, 'utf8');

    var descriptionBuffer = null;
    if (this.description) {
        descriptionBuffer = new Buffer(this.description, 'utf8');
    } else {
        descriptionBuffer = new Buffer(0);
    }

    var domainBuffer = new Buffer(this.domain, 'utf8');
    var emailBuffer = new Buffer(this.email, 'utf8');

    var bb = new ByteBuffer(4 + 4 + 4 + 4 + nameBuffer.length + descriptionBuffer.length + domainBuffer.length + emailBuffer.length + 4 + 32 + 64, true);

    bb.writeInt(nameBuffer.length);
    bb.writeInt(descriptionBuffer.length);
    bb.writeInt(domainBuffer.length);
    bb.writeInt(emailBuffer.length);

    for (var i = 0; i < nameBuffer.length; i++) {
        bb.writeByte(nameBuffer[i])
    }

    for (var i = 0; i < descriptionBuffer.length; i++) {
        bb.writeByte(descriptionBuffer[i]);
    }

    for (var i = 0; i < domainBuffer.length; i++) {
        bb.writeByte(domainBuffer[i]);
    }

    for (var i = 0; i < emailBuffer.length; i++) {
        bb.writeByte(emailBuffer[i]);
    }

    bb.writeInt(this.timestamp);

    for (var i = 0; i < this.generatorPublicKey.length; i++) {
        bb.writeByte(this.generatorPublicKey[i]);
    }

    if (this.signature) {
        for (var i = 0; i < this.signature.length; i++) {
            bb.writeByte(this.signature[i]);
        }
    }

    bb.flip();
    return bb.toBuffer();
}


company.prototype.verify = function () {
    if (!this.signature || !this.generatorPublicKey) {
        return false;
    }

    var bytes = this.getBytes();
    var data2 = new Buffer(bytes.length - 64);

    for (var i = 0; i < data2.length; i++) {
        data2[i] = bytes[i];
    }

    var hash = crypto.createHash('sha256').update(data2).digest();
    return ed.Verify(hash, this.signature, this.generatorPublicKey);
}


company.prototype.sign = function (secretPhrase) {
    var hash = this.getHash();
    var passHash = crypto.createHash('sha256').update(secretPhrase, 'utf8').digest();
    var keypair = ed.MakeKeypair(passHash);
    this.signature = ed.Sign(hash, keypair);
}

company.prototype.getHash = function () {
    var bytes = this.getBytes();
    var hash = crypto.createHash('sha256').update(bytes).digest();
    return hash;
}

company.prototype.getId = function () {
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

module.exports = company;