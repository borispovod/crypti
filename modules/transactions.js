var transactionHelper = require('../helpers/transaction.js'),
    ed = require('ed25519'),
    bignum = require('bignum'),
    ByteBuffer = require("bytebuffer"),
    crypto = require('crypto'),
    genesisblock = require('../helpers/genesisblock.js');

// private
var modules, library;

function Transactions(cb, scope) {
    library = scope;

    setImmediate(function () {
        cb(null, this);
    }.bind(this));
}

Transactions.prototype.apply = function (transaction) {
    var sender = modules.accounts.getAccountByPublicKey(transaction.senderPublicKey);
    var amount = transaction.amount + transaction.fee;


    if (sender.balance < amount && transaction.blockId != genesisblock.blockId) {
        return false;
    }

    sender.addToBalance(-amount);

    // process only two types of transactions
    if (transaction.type == 0) {
        if (transaction.subtype == 0) {
            var recipient = modules.accounts.getAccountOrCreate(transaction.recipientId);
            recipient.addToUnconfirmedBalance(transaction.amount);
            recipient.addToBalance(transaction.amount);

            return true;
        }
    } else if (transaction.type == 1) {
        if (transaction.subtype == 0) {
            if (transation.companyGeneratorPublicKey == null) {
                return false;
            }

            var recipient = transaction.getAccountByPublicKey(transaction.companyGeneratorPublicKey);

            if (!recipient) {
                return false;
            }


            amount = transaction.amount + transactionHelper.getTransactionFee(transaction, false);
            recipient.addToUnconfirmedBalance(amount);
            recipient.addToBalance(amount);

            return true;
        }
    } else {
        return true;
    }
}

Transactions.prototype.applyUnconfirmed = function (transaction, cb) {
    var sender = modules.accounts.getAccountByPublicKey(transaction.senderPublicKey);

    if (!sender && transaction.blockId != genesisblock.blockId) {
        return false;
    } else {
        sender = modules.accounts.getAccountOrCreate(transaction.senderPublicKey);
    }

    var amount = transaction.amount + transaction.fee;

    if (sender.unconfirmedBalance < amount && transaction.blockId != genesisblock.blockId) {
        return false;
    }

    sender.addToUnconfirmedBalance(-amount);

    return true;
}

Transactions.prototype.undo = function (transaction, cb) {
    var sender = modules.accounts.getAccountByPublicKey(transaction.senderPublicKey);
    var amount = transaction.amount + transaction.fee;

    sender.addToBalance(amount);

    // process only two types of transactions
    if (transaction.type == 1) {
        if (transaction.subtype == 0) {
            var recipient = modules.accounts.getAccountOrCreate(transaction.recipientId);
            recipient.addToUnconfirmedBalance(-transaction.amount);
            recipient.addToBalance(-transaction.amount);

            return setImmediate(cb);
        }
    } else if (transaction.type == 2) {
        if (transaction.subtype == 0) {
            // merchant transaction, first need to find merchant
            var recipient = transaction.recipientId;

            library.db.serialize(function () {
                library.db.get("SELECT generatorPublicKey FROM companies WHERE address = $address", { $address : recipient }, function (err, company) {
                    if (err) {
                        return cb(err);
                    } else if (!company) {
                        return cb();
                    } else {
                        var companyCreator = modules.accounts.getAccountByPublicKey(company.generatorPublicKey);

                        if (!companyCreator) {
                            return cb("Can't find company creator for address: " + recipient);
                        }

                        // need to calculate fee
                        amount = transaction.amount + getTransactionFee(transaction, false);
                        companyCreator.addToUnconfirmedBalance(-amount);
                        companyCreator.addToBalance(-amount);

                        return cb();
                    }
                });
            });
        }
    } else {
        return setImmediate(cb);
    }
}

Transactions.prototype.undoUnconfirmed = function (transaction) {
    var sender = modules.accounts.getAccountByPublicKey(transaction.senderPublicKey);
    var amount = transaction.amount + transaction.fee;

    sender.addToUnconfirmedBalance(amount);
    return true;
}

Transactions.prototype.verifySignature = function (transaction) {
    var remove = 64;

    if (transaction.signSignature) {
        remove = 128;
    }

    var bytes = transactionHelper.getBytes(transaction);
    var data2 = new Buffer(bytes.length - remove);

    for (var i = 0; i < data2.length; i++) {
        data2[i] = bytes[i];
    }

    var hash = crypto.createHash('sha256').update(data2).digest();

    return ed.Verify(hash, transaction.signature, transaction.senderPublicKey);
}

Transactions.prototype.verifySecondSignature = function (transaction, publicKey) {
    var bytes = transactionHelper.getBytes(transaction);
    var data2 = new Buffer(bytes.length - 64);

    for (var i = 0; i < data2.length; i++) {
        data2[i] = bytes[i];
    }

    var hash = crypto.createHash('sha256').update(data2).digest();
    return ed.Verify(hash, transaction.signSignature, publicKey);
}

Transactions.prototype.run = function (scope) {
    modules = scope;
}

module.exports = Transactions;