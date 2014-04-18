var crypto = require('crypto'),
    ed  = require('ed25519'),
    bignum = require('bignum'),
    _ = require('underscore');

var block = function (timestamp, totalAmount, totalFee, generatorPublicKey, generatorId, generationSignature, blockSignature, transactions) {
    this.timestamp = timestamp;
    this.totalAmount = totalAmount;
    this.totalFee = totalFee;
    this.generatorPublicKey = generatorPublicKey;
    this.generationSignature = generationSignature;
    this.blockSignature = blockSignature;
    this.transactions = transactions;
    this.generatorId = generatorId;
}

block.prototype.getJSON = function () {
    var obj = _.extend({}, this);
    obj.hash = null;
    obj.blockSignature = null;

    var tmp = [];
    for (var i = 0; i < obj.transactions; i++) {
        tmp.push(JSON.parse(obj.transactions[i].toJSON()));
    }

    obj.transactions = tmp;
    return JSON.stringify(obj);
}

block.prototype.getId = function (cb) {
    if (!this.id) {
        if (!this.signature) {
            cb("Block not signed");
        } else {
            var shasum = crypto.createHash('sha256'),
                json = this.getJSON();

            shasum.update(json, 'utf8');
            var hash = shasum.digest();
            var temp = new Buffer(8);
            for (var i = 0; i < 8; i++) {
                temp[i] = hash[7-i];
            }

            this.id = bignum.fromBuffer(temp).toString();
            cb(null, this.id);
        }
    } else {
        cb(null, this.id);
    }
}

block.prototype.getHash = function (cb) {
    if (!this.hash || this.hash) {
        var shasum = crypto.createHash('sha256'),
            json = this.getJSON();

        shasum.update(json, 'utf8');
        this.hash = shasum.digest();

        if (cb) {
            cb(null, this.hash);
        } else {
            return this.hash;
        }
    } else {
        if (cb) {
            cb(null, this.hash);
        } else {
            return this.hash;
        }
    }
}

block.prototype.sign = function (username, password, cb) {
    if (this.blockSignature) {
        cb("Block already signed");
    } else {
        var hash = this.getHash(function (err, hash) {
            if (err) {
                cb(err);
            } else {
                var passHash = crypto.createHash('sha256').update(username + password, 'utf8').digest();
                var keypair = ed.MakeKeypair(passHash);

                this.blockSignature = ed.Sign(hash, keypair);
                cb(null, this.blockSignature);
            }
        }.bind(this));
    }
}

block.prototype.verify = function (publicKey, cb) {
    if (!this.blockSignature) {
        cb("Block not signed");
    } else {
        var hash = this.getHash();
        var r = ed.Verify(new Buffer(hash), this.blockSignature, publicKey);
        cb(null, r);
    }
}

module.exports = block;