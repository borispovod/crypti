var _ = require('underscore'),
    ed = require('ed25519'),
    bignum = require('bignum'),
    crypto = require('crypto'),
    ByteBuffer = require("bytebuffer"),
    utils = require("../utils.js"),
    signature = require('./signature.js');

var signatureprocessor = function () {
    this.unconfirmedSignatures = {};
    this.signatures = {};
}

signatureprocessor.prototype.setApp = function (app) {
    this.app = app;
}

signatureprocessor.prototype.addSignature = function (address, signature) {
    if (!this.signatures[address]) {
        this.signatures[address] = signature;
    }
}

signatureprocessor.prototype.generateNewSignature = function (timestamp, secretPhrase, secondSecretPhrase) {
    var hash1 = crypto.createHash('sha256').update(secretPhrase, 'utf8').digest();
    var keypair1 = ed.MakeKeypair(hash1);

    var hash2 = crypto.createHash('sha256').update(secondSecretPhrase, 'utf8').digest();
    var keypair2 = ed.MakeKeypair(hash2);


    var s = new signature(keypair2.publicKey, keypair1.publicKey, timestamp);
    s.sign(secondSecretPhrase);
    s.signGeneration(secretPhrase);

    return s;
}

signatureprocessor.prototype.getSignatureByAddress = function (address) {
    return this.signatures[address];
}

signatureprocessor.prototype.getUnconfirmedSignatureByAddress = function (address) {
    return this.unconfirmedSignatures[address];
}

signatureprocessor.prototype.processSignature = function (signature) {
    var account = this.app.accountprocessor.getAccountByPublicKey(signature.generatorPublicKey);

    if (!account) {
        this.app.logger.error("Account not found, " + signature.getId() + " signature can't be processed");
        return false;
    }

    if (this.signatures[account.address] || this.unconfirmedSignatures[account.address]) {
        this.app.logger.error("Signature " + signature.getId() + " already added for this address " + account.address);
        return false;
    }

    var now = utils.getEpochTime(new Date().getTime());
    if (now < signature.timestamp) {
        this.app.logger.error("Signature " + signature.getId() + " has not valid timestamp " + now + "/" + signature.timestamp);
        return false;
    }

    if (!signature.verify()) {
        this.app.logger.error("Signature " + signature.getId() + " has not valid signature");
        return false;
    }

    if (!signature.verifyGenerationSignature()) {
        this.app.logger.error("Generation signature of signature " + signature.getId() + " not valid");
        return false;
    }

    this.unconfirmedSignatures[account.address] = signature;

    return true;
}

signatureprocessor.prototype.removeSignature = function (address) {
    delete this.signatures[address];
}

signatureprocessor.prototype.removeUnconfirmedSignature = function (address) {
    delete this.unconfirmedSignatures[address];
}

signatureprocessor.prototype.fromJSON = function (JSON) {
    var s = new signature(JSON.publicKey, JSON.generatorPublicKey, JSON.timestamp, JSON.signature, JSON.generationSignature);
    return s;
}

signatureprocessor.prototype.fromByteBuffer = function (bb) {
    var s = new signature();
    s.publicKey = new Buffer(32);

    for (var i = 0; i < 32; i++) {
        s.publicKey[i] = bb.readByte();
    }

    s.generatorPublicKey = new Buffer(32);

    for (var i = 0; i < 32; i++) {
        s.generatorPublicKey[i] = bb.readByte();
    }

    s.timestamp = bb.readInt();

    s.signature = new Buffer(64);
    for (var i = 0; i < 64; i++) {
        s.signature[i] = bb.readByte();
    }

    s.generationSignature = new Buffer(64);
    for (var i = 0; i < 64; i++) {
        s.generationSignature[i] = bb.readByte();
    }

    return s;
}

signatureprocessor.prototype.fromBytes = function (buffer) {
    var bb = ByteBuffer.wrap(buffer, true);
    bb.flip();
    
    var s = new signature();
    s.publicKey = new Buffer(32);

    for (var i = 0; i < 32; i++) {
        s.publicKey[i] = bb.readByte();
    }

    s.generatorPublicKey = new Buffer(32);

    for (var i = 0; i < 32; i++) {
        s.generatorPublicKey[i] = bb.readByte();
    }

    s.timestamp = bb.readInt();

    s.signature = new Buffer(64);
    for (var i = 0; i < 64; i++) {
        s.signature[i] = bb.readByte();
    }

    s.generationSignature = new Buffer(64);
    for (var i = 0; i < 64; i++) {
        s.generationSignature[i] = bb.readByte();
    }

    return s;
}

module.exports = signatureprocessor;