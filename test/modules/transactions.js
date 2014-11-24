// private
var modules, library;

var fixedPoint = Math.pow(10, 8);

// get valid transaction fee, if we need to get fee for block generator, use isGenerator = true
function getTransactionFee(transaction, isGenerator) {
    var fee = -1;

    switch (transaction.type) {
        case 0:
            switch (transaction.subtype) {
                case 0:
                    fee = transaction.fee;
                    break;
            }
            break;

        case 1:
            switch (transaction.subtype) {
                case 0:
                    if (transaction.fee >= 2) {
                        if (transaction.fee % 2 != 0) {
                            var tmp = parseInt(transaction.fee / 2);

                            if (isGenerator) {
                                fee = transaction.fee - tmp;
                            } else {
                                fee = tmp;
                            }
                        } else {
                            fee = transaction.fee / 2;
                        }
                    } else {
                        if (isGenerator) {
                            fee = transaction.fee;
                        } else {
                            fee = 0;
                        }
                    }
                    break;
            }
            break;

        case 2:
            switch (transaction.subtype) {
                case 0:
                    fee = transaction.fee;
                    break;
            }
            break;

        case 3:
            switch (transaction.subtype) {
                case 0:
                    fee = 100 * fixedPoint;
                    break;
            }
            break;
    }

    if (fee == -1) {
        throw new Error("Invalid transaction type: " + t.id);
    }

    return fee;
}


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
                        amount = transaction.amount + getTransactionFee(transaction, false);
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

Transactions.prototype.run = function (cb, scope) {
    modules = scope;
}

module.exports = Transactions;