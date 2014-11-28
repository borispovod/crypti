var transactionHelper = require('../helpers/transaction.js'),
	ed = require('ed25519'),
	bignum = require('bignum'),
	ByteBuffer = require("bytebuffer"),
	crypto = require('crypto'),
	genesisblock = require('../helpers/genesisblock.js'),
	blockHelper = require("../helpers/block.js");
var Router = require('../helpers/router.js');
var async = require('async');

// private
var modules, library, self;

function Transactions(cb, scope) {
	library = scope;
	self = this;

	var router = new Router();

	router.get('/', function (req, res) {
		self.list({
			blockId: req.query.blockId,
			sender: req.query.sender,
			recipientId: req.query.recipientId,
			limit: req.query.limit || 20,
			orderBy: req.query.orderBy
		}, function (err, transactions) {
			if (err) {
				return res.json({success: false, error: "Transactions not found"});
			}
			return res.json({success: true, transactions: transactions});
		});
	});

	router.get('/get', function (req, res) {
		if (!req.query.id) {
			return res.json({success: false, error: "Provide id in url"});
		}
		self.get(req.query.id, function (err, transaction) {
			if (!transaction || err) {
				return res.json({success: false, error: "Transaction not found"});
			}
			return res.json({success: true, transaction: transaction});
		});
	});

	router.put('/', function (req, res) {
		return res.json({});
	});

	library.app.use('/api/transactions', router);

	setImmediate(cb, null, self);
}

Transactions.prototype.list = function (filter, cb) {
	var params = {}, fields = [];
	if (filter.blockId) {
		fields.push('blockId = $blockId')
		params.$blockId = filter.blockId;
	}
	if (filter.sender) {
		fields.push('sender = $sender')
		params.$sender = filter.sender;
	}
	if (filter.recipientId) {
		fields.push('recipientId = $recipientId')
		params.$recipientId = filter.recipientId;
	}
	if (filter.limit) {
		params.$limit = filter.limit;
	}
	if (filter.orderBy) {
		params.$orderBy = filter.orderBy;
	}
	var stmt = library.db.prepare("select t.id t_id, t.blockId t_blockId, t.type t_type, t.subtype t_subtype, t.timestamp t_timestamp, t.senderPublicKey t_senderPublicKey, t.sender t_sender, t.recipientId t_recipientId, t.amount t_amount, t.fee t_fee, t.signature t_signature, t.signSignature t_signSignature, c_t.generatorPublicKey t_companyGeneratorPublicKey " +
	"from trs t " +
	"left outer join companies as c_t on c_t.address=t.recipientId " +
	(fields.length ? "where " + fields.join(' and ') : '') + " " +
	(filter.orderBy ? 'order by $orderBy' : '') + " " +
	(filter.limit ? 'limit $limit' : ''));

	stmt.bind(params);

	stmt.all(function (err, rows) {
		if (err) {
			return cb(err)
		}
		async.mapSeries(rows, function (row, cb) {
			setImmediate(cb, null, blockHelper.getTransaction(row));
		}, cb)
	})
}

Transactions.prototype.get = function (id, cb) {
	var stmt = library.db.prepare("select t.id t_id, t.blockId t_blockId, t.type t_type, t.subtype t_subtype, t.timestamp t_timestamp, t.senderPublicKey t_senderPublicKey, t.sender t_sender, t.recipientId t_recipientId, t.amount t_amount, t.fee t_fee, t.signature t_signature, t.signSignature t_signSignature, c_t.generatorPublicKey t_companyGeneratorPublicKey " +
	"from trs t " +
	"left outer join companies as c_t on c_t.address=t.recipientId " +
	"where t.id = ?");

	stmt.bind(id);

	stmt.get(function (err, row) {
		var transacton = row && blockHelper.getTransaction(row);
		cb(err, transacton);
	});
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