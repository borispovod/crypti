var transactionHelper = require('../helpers/transaction.js'),
	ed = require('ed25519'),
	bignum = require('bignum'),
	ByteBuffer = require("bytebuffer"),
	crypto = require('crypto'),
	genesisblock = require('../helpers/genesisblock.js'),
	constants = require("../helpers/constants.js"),
	blockHelper = require("../helpers/block.js"),
	timeHelper = require("../helpers/time.js");

var Router = require('../helpers/router.js');
var async = require('async');

// private
var modules, library, self;
var unconfirmedTransactions, doubleSpendingTransactions;

function Transactions(cb, scope) {
	library = scope;
	unconfirmedTransactions = {};
	doubleSpendingTransactions = {};
	self = this;

	var router = new Router();

	router.get('/', function (req, res) {
		self.list({
			blockId: req.query.blockId,
			senderPublicKey: req.query.senderPublicKey ? new Buffer(req.query.senderPublicKey, 'hex') : null,
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

	router.get('/unconfirmed/get', function (req, res) {
		if (!req.query.id) {
			return res.json({success: false, error: "Provide id in url"});
		}
		var transaction = self.getUnconfirmedTransaction(req.query.id);
		if (!transaction) {
			return res.json({success: false, error: "Transaction not found"});
		}
		return res.json({success: true, transaction: transaction});
	});

	router.get('/unconfirmed/', function (req, res) {
		var transactions = self.getUnconfirmedTransactions(true),
			toSend = [];

		if (req.query.senderPublicKey) {
			for (var i = 0; i < transactions.length; i++) {
				if (transactions[i].senderPublicKey.toString('hex') == req.query.senderPublicKey) {
					toSend.push(transactions[i]);
				}
			}
		} else {
			toSend = transactions;
		}

		return res.json({success: true, transactions: toSend});
	});

	router.put('/', function (req, res) {
		var secret = req.body.secret,
			amount = req.body.amount,
			recipientId = req.body.recipientId,
			publicKey = req.body.publicKey,
			secondSecret = req.body.secondSecret;

		var hash = crypto.createHash('sha256').update(secret, 'utf8').digest();
		var keypair = ed.MakeKeypair(hash);

		if (publicKey) {
			if (keypair.publicKey.toString('hex') != new Buffer(publicKey).toString('hex')) {
				return res.json({success: false, error: "Please, provide valid secret key of your account"});
			}
		}

		var account = modules.accounts.getAccountByPublicKey(keypair.publicKey);

		if (!account) {
			return res.json({success: false, error: "Account doesn't has balance"});
		}

		if (!account.publicKey) {
			return res.json({success: false, error: "Open account to send funds"});
		}

		var transaction = {
			type: 0,
			subtype: 0,
			amount: amount,
			recipientId: recipientId,
			senderPublicKey: account.publicKey,
			timestamp: timeHelper.getNow()
		};

		self.sign(secret, transaction);

		if (secondSecret) {
			self.secondSign(secret, transaction);
		}

		self.processUnconfirmedTransaction(transaction, true, function (err) {
			if (err) {
				return res.json({success: false, error: err});
			} else {
				return res.json({success: true, transaction: transaction});
			}
		});
	});

	library.app.use('/api/transactions', router);

	setImmediate(cb, null, self);
}

Transactions.prototype.sign = function (secret, transaction) {
	var hash = transactionHelper.getHash(transaction);
	var passHash = crypto.createHash('sha256').update(secret, 'utf8').digest();
	var keypair = ed.MakeKeypair(passHash);
	transaction.signature = ed.Sign(hash, keypair);
}

Transactions.prototype.secondSign = function (secret, transaction) {
	var hash = transactionHelper.getHash(transaction);
	var passHash = crypto.createHash('sha256').update(secret, 'utf8').digest();
	var keypair = ed.MakeKeypair(passHash);
	transaction.signSignature = ed.Sign(hash, keypair);
}

Transactions.prototype.list = function (filter, cb) {
	var params = {}, fields = [];
	if (filter.blockId) {
		fields.push('blockId = $blockId')
		params.$blockId = filter.blockId;
	}
	if (filter.senderPublicKey) {
		fields.push('senderPublicKey = $senderPublicKey')
		params.$senderPublicKey = filter.senderPublicKey;
	}
	if (filter.recipientId) {
		fields.push('recipientId = $recipientId')
		params.$recipientId = filter.recipientId;
	}
	if (filter.limit) {
		params.$limit = filter.limit;
	}

	if (filter.orderBy) {
		var sort = filter.orderBy.split(':');
		sortBy = sort[0].replace(/[^\w\s]/gi, '');
		if (sort.length == 2) {
			sortMethod = sort[1] == 'desc' ? 'desc' : 'asc'
		}
	}

	if (filter.limit > 1000) {
		return cb('Maximum of limit is 1000');
	}

	// need to fix 'or' or 'and' in query
	params.$topHeight = modules.blocks.getLastBlock().height + 1;
	var stmt = library.db.prepare("select t.id t_id, t.blockId t_blockId, t.type t_type, t.subtype t_subtype, t.timestamp t_timestamp, t.senderPublicKey t_senderPublicKey, t.senderId t_senderId, t.recipientId t_recipientId, t.amount t_amount, t.fee t_fee, t.signature t_signature, t.signSignature t_signSignature, c_t.generatorPublicKey t_companyGeneratorPublicKey, $topHeight - b.height as confirmations " +
	"from trs t " +
	"inner join blocks b on t.blockId = b.id " +
	"left outer join companies as c_t on c_t.address=t.recipientId " +
	(fields.length ? "where " + fields.join(' or ') : '') + " " +
	(filter.orderBy ? 'order by ' + sortBy + ' ' + sortMethod : '') + " " +
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
	var stmt = library.db.prepare("select t.id t_id, t.blockId t_blockId, t.type t_type, t.subtype t_subtype, t.timestamp t_timestamp, t.senderPublicKey t_senderPublicKey, t.senderId t_senderId, t.recipientId t_recipientId, t.amount t_amount, t.fee t_fee, t.signature t_signature, t.signSignature t_signSignature, c_t.generatorPublicKey t_companyGeneratorPublicKey, $topHeight - b.height as confirmations " +
	"from trs t " +
	"inner join blocks b on t.blockId = b.id " +
	"left outer join companies as c_t on c_t.address=t.recipientId " +
	"where t.id = $id");

	stmt.bind({
		$id: id,
		$topHeight: modules.blocks.getLastBlock().height + 1
	});

	stmt.get(function (err, row) {
		var transacton = row && blockHelper.getTransaction(row);
		cb(err, transacton);
	});
}

Transactions.prototype.getUnconfirmedTransaction = function (id) {
	return unconfirmedTransactions[id];
}

Transactions.prototype.getUnconfirmedTransactions = function (sort) {
	var a = [];

	for (var id in unconfirmedTransactions) {
		a.push(unconfirmedTransactions[id]);
	}

	if (sort) {
		a.sort(function compare(a, b) {
			if (a.timestamp < b.timestamp)
				return -1;
			if (a.timestamp > b.timestamp)
				return 1;
			return 0;
		});
	}

	return a;
}

Transactions.prototype.removeUnconfirmedTransaction = function (id) {
	if (unconfirmedTransactions[id]) {
		delete unconfirmedTransactions[id];
	}
}

Transactions.prototype.processUnconfirmedTransaction = function (transaction, sendToPeers, cb) {
	var self = this;
	var txId = transactionHelper.getId(transaction);

	if (transaction.id && transaction.id != txId) {
		return cb("Invalid transaction id");
	} else {
		transaction.id = txId;
	}

	library.db.get("SELECT id FROM trs WHERE id=$id", {$id: transaction.id}, function (err, confirmed) {
		if (err) {
			return cb("Internal sql error");
		} else if (confirmed) {
			return cb("Can't process transaction, transaction already confirmed");
		} else {
			// check in confirmed transactions
			if (unconfirmedTransactions[transaction.id] || doubleSpendingTransactions[transaction.id]) {
				return cb("This transaction already exists");
			}

			var sender = modules.accounts.getAccountByPublicKey(transaction.senderPublicKey);

			if (!sender) {
				return cb("Can't process transaction, sender not found");
			}

			transaction.senderId = sender.address;

			if (!self.verifySignature(transaction)) {
				return cb("Can't verify signature")
			}

			// check if transaction is not float and great then 0
			if (transaction.amount < 0 || transaction.amount.toString().indexOf('.') >= 0) {
				return cb("Invalid transaction amount");
			}

			if (transaction.timestamp > timeHelper.getNow() + 15) {
				return cb("Invalid transaction timestamp");
			}

			var fee = transactionHelper.getFee(transaction, modules.blocks.getFee());

			if (fee <= 0) {
				fee = 1;
			}

			switch (transaction.type) {
				case 0:
					switch (transaction.subtype) {
						case 0:
							if (transactionHelper.getLastChar(transaction) != "C") {
								return cb("Invalid transaction recipient id");
							}

							transaction.fee = fee;
							break;

						default:
							return cb("Unknown transaction type");
					}
					break;

				case 1:
					switch (transaction.subtype) {
						case 0:
							if (transactionHelper.getLastChar(transaction) != "D") {
								return cb("Invalid transaction recipient id");
							}

							transaction.fee = fee;
							break;

						default:
							return cb("Unknown transaction type");
					}
					break;

				case 2:
					switch (transaction.subtype) {
						case 0:
							if (transaction.fee != 100 * constants.fixedPoint) {
								return cb("Invalid transaction fee");
							}

							if (!transaction.asset) {
								return cb("Empty transaction asset for company transaction")
							}

							// process signature of transaction
							break;

						default:
							return cb("Unknown transaction type");
					}
					break;

				case 3:
					switch (transaction.subtype) {
						case 0:
							if (transaction.fee != 1000 * constants.fixedPoint) {
								return cb("Invalid transaction fee");
							}

							if (!transaction.asset) {
								return cb("Empty transaction asset for company transaction")
							}

							// process company of transaction
							break;

						default:
							return cb("Unknown transaction type");
					}
					break;

				default:
					return cb("Unknown transaction type");
			}


			async.parallel([
				function (cb) {
					library.db.get("SELECT publicKey FROM signatures WHERE generatorPublicKey = $generatorPublicKey", {$generatorPublicKey: transaction.senderPublicKey}, function (err, signature) {
						if (err) {
							return cb("Internal sql error");
						} else {
							if (signature) {
								if (!self.verifySecondSignature(transaction, signature.publicKey)) {
									return cb("Can't verify second signature");
								}
							} else {
								return cb();
							}
						}
					});
				},
				function (cb) {
					if (transaction.type == 1 && transaction.subtype == 0) {
						library.db.serialize(function () {
							library.db.get("SELECT id FROM companies WHERE address = $address", {$address: transaction.recipientId}, function (err, company) {
								if (err) {
									return cb("Internal sql error");
								} else if (company) {
									return cb();
								} else {
									return cb("Company with this address as recipient not found");
								}
							});
						});
					} else {
						return cb();
					}
				}
			], function (errors) {
				if (errors) {
					return cb(errors.pop());
				} else {
					if (self.applyUnconfirmed(transaction)) {
						unconfirmedTransactions[transaction.id] = transaction;

						if (sendToPeers) {
							modules.transport.broadcast(100, '/transaction', {transaction: transaction});
						}
					} else {
						doubleSpendingTransactions[transaction.id] = transaction;
					}

					return cb && cb(null, transaction.id);
				}
			});
		}
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