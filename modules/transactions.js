var transactionHelper = require('../helpers/transaction.js'),
	ed = require('ed25519'),
	bignum = require('bignum'),
	ByteBuffer = require("bytebuffer"),
	crypto = require('crypto'),
	genesisblock = require('../helpers/genesisblock.js'),
	constants = require("../helpers/constants.js");

var Router = require('../helpers/router.js');

// private
var modules, library;
var unconfirmedTransactions;

function Transactions(cb, scope) {
	library = scope;
	unconfirmedTransactions = {};

	var router = new Router();

	router.get('/', function (req, res) {
		return res.json({});
	});

	router.get('/get', function (req, res) {
		return res.json({});
	});

	router.put('/', function (req, res) {
		return res.json({});
	});

	library.app.use('/api/transactions', router);

	setImmediate(cb, null, this);
}

Transactions.prototype.getUnconfirmedTransaction = function (id) {
	return unconfirmedTransactions[id];
}

Transactions.prototype.getAllTransactions = function () {
	return unconfirmedTransactions;
}

Transactions.prototype.processUnconfirmedTransaction = function (transaction, cb) {
	// process unconfirmed transaction
	if (!this.verifySignature(transaction)) {
		return cb("Can't verify signature")
	}

	// later need to check second signature
	/*
	if (transaction.signSignature) {
		if (!this.verifySecondSignature(transaction)) {
			return cb("Can't verify second signature");
		}
	}
	*/

	if (transaction.amount < 0) {
		return cb("Invalid transaction amount");
	}

	var minimalFee = 1 * constants.fixedPoint;

	switch (transaction.type) {
		case 0:
			switch (transaction.subtype) {
				case 0:
					if (transaction.fee < minimalFee) {
						return cb("Invalid transaction fee, minimal amount is: " + minimalFee);
					}
					break;

				default:
					return cb("Invalid transaction type");
			}
			break;

		case 1:
			switch (transaction.subtype) {
				case 0:
					if (transaction.fee < minimalFee) {
						return cb("Invalid transaction fee, minimal amount is: " + minimalFee)
					}
					break;

				default:
					return cb("Invalid transaction type");
			}
			break;

		case 2:
			switch (transaction.subtype) {
				case 0:
					if (transaction.fee != 100 * constants.fixedPoint) {
						return cb("Invalid transaction fee, fee must be: " + 100 * constants.fixedPoint);
					}
					break;

				default:
					return cb("Invalid transaction type");
			}
			break;

		case 3:
			switch (transaction.subtype) {
				case 0:
					if (transaction.fee != 1000 * constants.fixedPoint) {
						return cb("Invalid transaction fee, fee must be: " + 1000 * constants.fixedPoint);
					}
					break;

				default:
					return cb("Invalid transaction type");
			}
			break;

		default:
			return cb("Invalid transaction type");
	}

	// need to check company address existing in database if type is 1 and subtype is 0, later


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
				library.db.get("SELECT generatorPublicKey FROM companies WHERE address = $address", {$address: recipient}, function (err, company) {
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