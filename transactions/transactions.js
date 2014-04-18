var crypto = require('crypto'),
    ed  = require('ed25519'),
    bignum = require('bignum'),
    _ = require('underscore');

var transaction = function(id, timestamp, senderPublicKey, senderId, recipientId, amount, deadline, fee, signature) {
    this.id = null;
    this.timestamp = timestamp;
    this.deadline = deadline;
    this.senderPublicKey = senderPublicKey;
    this.senderId = senderId;
    this.recipientId = recipientId;
    this.amount = amount;
    this.fee = fee;
    this.signature = signature;
}

transaction.prototype.getJSON = function () {
    var obj = _.extend({}, this);
    obj.signature = null;
    obj.id = null;
    obj.hash = null;

    return JSON.stringify(obj);
}

transaction.prototype.getId = function (cb) {
    if (!this.id) {
        if (!this.signature) {
            if (cb) {
                cb("Transaction not signed");
            }
        } else {
            var self = _.extend({}, this);
            self.signature = null;

            var shasum = crypto.createHash('sha256'),
                json = this.getJSON();

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

transaction.prototype.verify = function (publicKey, cb) {
    if (!this.signature) {
        cb("Transaction not signed", false);
    } else {
        var hash = this.getHash();

        var r = ed.Verify(new Buffer(hash), this.signature, publicKey);
        cb(null, r);
    }
}

module.exports.transaction = transaction;