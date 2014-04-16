var crypto = require('crypto'),
    ed  = require('ed25519'),
    bignum = require('bignum');

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

block.prototype.getId = function (cb) {
    if (!this.id) {
        if (this.signature) {
            cb("Block not signed");
        } else {
            var shasum = crypto.createHash('sha256'),
                json = JSON.stringify(this);

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
    if (!this.hash) {
        var shasum = crypto.createHash('sha256'),
            json = JSON.stringify(this);

        shasum.update(json, 'utf8');
        this.hash = shasum.digest();
        cb(null, this.hash)
    } else {
        cb(null, this.hash);
    }
}

block.prototype.sign = function (username, password, cb) {
    if (this.signature) {
        cb("Block already signed");
    } else {
        var json = JSON.stringify(this);
        var hash = this.getHash(function (err, hash) {
            if (err) {
                cb(err);
            } else {
                var passHash = crypto.createHash('sha256').update(username + password, 'utf8').digest();
                var keypair = ed.MakeKeypair(passHash);

                this.signature = ed.Sign(hash, keypair);
                cb(null, this.signature);
            }
        }.bind(this));
    }
}

module.exports = block;