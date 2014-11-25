var transactionHelper = require('../helpers/transaction.js');

// private
var modules, library;

function Transactions(cb, scope) {
    library = scope;

    setImmediate(function () {
        cb(null, this);
    })
}

Transactions.prototype.apply = function (transaction, cb) {
    var sender = modules.accounts.getAccountByPublicKey(transaction.senderPublicKey);
    var amount = transaction.amount + transaction.fee;

    sender.addToBalance(-amount);

    // process only two types of transactions
    if (transaction.type == 1) {
        if (transaction.subtype == 0) {
            var recipient = modules.accounts.getAccountOrCreate(transaction.recipientId);
            recipient.addToUnconfirmedBalance(transaction.amount);
            recipient.addToBalance(transaction.amount);

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
                        amount = transaction.amount + transactionHelper.getTransactionFee(transaction, false);
                        companyCreator.addToUnconfirmedBalance(amount);
                        companyCreator.addToBalance(amount);

                        return cb();
                    }
                });
            });
        }
    } else {
        return setImmediate(cb);
    }
}

Transactions.prototype.applyUnconfirmed = function (transaction, cb) {
    var sender = modules.accounts.getAccountByPublicKey(transaction.senderPublicKey);

    if (!sender) {
        return false;
    }

    var amount = transaction.amount + transaction.fee;
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

}

Transactions.prototype.run = function (cb, scope) {
    modules = scope;
}

module.exports = Transactions;