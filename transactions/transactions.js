var crypto = require('crypto'),
    ed  = require('ed25519'),
    bignum = require('bignum');

var transaction = function(timestamp, senderPublicKey, senderId, recipientId, amount, deadline, fee, signature) {
    this.timestamp = timestamp;
    this.deadline = deadline;
    this.senderPublicKey = senderPublicKey;
    this.senderId = senderId;
    this.recipientId = recipientId;
    this.amount = amount;
    this.fee = fee;
    this.signature = signature;
}

transaction.prototype.getId = function (cb) {
    if (!this.id) {
        if (!this.signature) {
            if (cb) {
                cb("Transaction not signed");
            }
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
            if (cb) {
                cb(null, this.id);
            } else {
                return this.id;
            }
        }
    } else {
        if (cb) {
            cb(null, this.id);
        } else {
            return this.id;
        }
    }
}

transaction.prototype.sign = function (username, password, cb) {
    if (this.signature) {
        cb("Transaction already signed");
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

transaction.prototype.getHash = function (cb) {
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

module.exports.transaction = transaction;