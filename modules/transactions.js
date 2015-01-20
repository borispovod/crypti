var transactionHelper = require('../helpers/transaction.js'),
	ed = require('ed25519'),
	bignum = require('bignum'),
	ByteBuffer = require("bytebuffer"),
	crypto = require('crypto'),
	genesisblock = require('../helpers/genesisblock.js'),
	constants = require("../helpers/constants.js"),
	blockHelper = require("../helpers/block.js"),
	timeHelper = require("../helpers/time.js"),
	params = require('../helpers/params.js'),
	extend = require('extend');

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

	router.use(function (req, res, next) {
		if (modules) return next();
		res.status(500).send({success: false, error: 'loading'});
	});

	router.get('/', function (req, res) {
		var blockId = req.query.blockId;
		var limit = req.query.limit;
		var orderBy = req.query.orderBy;
		var offset = req.query.offset;
		var senderPublicKey = req.query.senderPublicKey;
		var recipientId = req.query.recipientId;

		self.list({
			blockId: blockId,
			senderPublicKey: senderPublicKey,
			recipientId: recipientId,
			limit: limit || 20,
			orderBy: orderBy,
			offset: offset,
			hex: true
		}, function (err, transactions) {
			if (err) {
				return res.json({success: false, error: "Transactions not found"});
			}

			res.json({success: true, transactions: transactions});
		});
	});

	router.get('/get', function (req, res) {
		var id = params.string(req.query.id);
		if (!id) {
			return res.json({success: false, error: "Provide id in url"});
		}

		self.get(id, true, function (err, transaction) {
			if (!transaction || err) {
				return res.json({success: false, error: "Transaction not found"});
			}
			res.json({success: true, transaction: transaction});
		});
	});

	router.get('/unconfirmed/get', function (req, res) {
		var id = params.string(req.query.id);

		if (!id) {
			return res.json({success: false, error: "Provide id in url"});
		}

		var transaction = extend(true, {}, self.getUnconfirmedTransaction(id));

		if (!transaction) {
			return res.json({success: false, error: "Transaction not found"});
		}

		delete transaction.asset;
		transaction.senderPublicKey = transaction.senderPublicKey.toString('hex');
		transaction.signature = transaction.signature.toString('hex');
		transaction.signSignature = transaction.signSignature && transaction.signSignature.toString('hex');

		res.json({success: true, transaction: transaction});
	});

	router.get('/unconfirmed/', function (req, res) {
		var transactions = self.getUnconfirmedTransactions(true),
			toSend = [];

		var senderPublicKey = params.string(req.query.senderPublicKey),
			address = params.string(req.query.address);

		if (senderPublicKey || address) {
			for (var i = 0; i < transactions.length; i++) {
				if (transactions[i].senderPublicKey.toString('hex') == senderPublicKey || transactions[i].recipientId == address) {
					var transaction = extend(true, {}, transactions[i]);

					delete transaction.asset;
					transaction.senderPublicKey = transaction.senderPublicKey.toString('hex');
					transaction.signature = transaction.signature.toString('hex');
					transaction.signSignature = transaction.signSignature && transaction.signSignature.toString('hex');

					toSend.push(transaction);
				}
			}
		} else {
			for (var i = 0; i < transactions.length; i++) {
				var transaction = extend(true, {}, transactions[i]);

				delete transaction.asset;
				transaction.senderPublicKey = transaction.senderPublicKey.toString('hex');
				transaction.signature = transaction.signature.toString('hex');
				transaction.signSignature = transaction.signSignature && transaction.signSignature.toString('hex');

				toSend.push(transaction);
			}
		}

		res.json({success: true, transactions: toSend});
	});

	router.put('/', function (req, res) {
		var secret = params.string(req.body.secret),
			amount = params.int(req.body.amount),
			recipientId = params.string(req.body.recipientId),
			publicKey = params.buffer(req.body.publicKey, 'hex'),
			secondSecret = params.string(req.body.secondSecret);

		var hash = crypto.createHash('sha256').update(secret, 'utf8').digest();
		var keypair = ed.MakeKeypair(hash);

		if (secret.length == 0) {
			return res.json({success: false, error: "Provide secret key"});
		}

		if (publicKey.length > 0) {
			if (keypair.publicKey.toString('hex') != publicKey.toString('hex')) {
				return res.json({success: false, error: "Please, provide valid secret key of your account"});
			}
		}

		var account = modules.accounts.getAccountByPublicKey(keypair.publicKey);

		if (!account) {
			return res.json({success: false, error: "Account doesn't has balance"});
		}

		if (!account.publicKey) {
			return res.json({success: false, error: "Open account to make transaction"});
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

		if (account.secondSignature) {
			if (!secondSecret || secondSecret.length == 0) {
				return res.json({success: false, error: "Provide second secret key"});
			}

			self.secondSign(secondSecret, transaction);
		}

		self.processUnconfirmedTransaction(transaction, true, function (err) {
			if (err) {
				return res.json({success: false, error: err});
			}

			res.json({success: true, transactionId: transaction.id});
		});
	});

	router.use(function (req, res, next) {
		res.status(500).send({success: false, error: 'api not found'});
	});

	library.app.use('/api/transactions', router);
	library.app.use(function (err, req, res, next) {
		err && library.logger.error('/api/transactions', err)
		if (!err) return next();
		res.status(500).send({success: false, error: err});
	});

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
	var parameters = {}, fields = [];
	if (filter.blockId) {
		fields.push('blockId = $blockId')
		parameters.blockId = params.string(filter.blockId);
	}
	if (filter.senderPublicKey) {
		fields.push('hex(senderPublicKey) = $senderPublicKey')
		parameters.senderPublicKey = params.buffer(filter.senderPublicKey, 'hex').toString('hex').toUpperCase();
	}
	if (filter.recipientId) {
		fields.push('recipientId = $recipientId')
		parameters.recipientId = params.string(filter.recipientId);
	}
	if (filter.limit) {
		parameters.limit = params.int(filter.limit);
	}
	if (filter.offset) {
		parameters.offset = params.int(filter.offset);
	}

	if (filter.orderBy) {
		filter.orderBy = params.string(filter.orderBy);
		var sort = filter.orderBy.split(':');
		sortBy = sort[0].replace(/[^\w\s]/gi, '');
		sortBy = "t." + sortBy;
		if (sort.length == 2) {
			sortMethod = sort[1] == 'desc' ? 'desc' : 'asc'
		}
	}

	if (params.int(filter.limit) > 1000) {
		return cb('Maximum of limit is 1000');
	}

	library.dbLite.query("select t.id t_id, t.blockId t_blockId, t.type t_type, t.timestamp t_timestamp, hex(t.senderPublicKey) t_senderPublicKey,  t.senderId t_senderId, t.recipientId t_recipientId, t.amount t_amount, t.fee t_fee, hex(t.signature) t_signature, hex(t.signSignature) t_signSignature, (select max(height) + 1 from blocks) - b.height as confirmations " +
		"from trs t " +
		"inner join blocks b on t.blockId = b.id " +
		(fields.length ? "where " + fields.join(' or ') : '') + " " +
		(filter.orderBy ? 'order by ' + sortBy + ' ' + sortMethod : '') + " " +
		(filter.limit ? 'limit $limit' : '') + " " +
		(filter.offset ? 'offset $offset' : ''), parameters, ['t_id', 't_blockId', 't_type', 't_timestamp', 't_senderPublicKey', 't_senderId', 't_recipientId', 't_amount', 't_fee', 't_signature', 't_signSignature', 'confirmations'], function (err, rows) {
			if (err) {
				return cb(err)
			}

			async.mapSeries(rows, function (row, cb) {
				setImmediate(cb, null, blockHelper.getTransaction(row, true, filter.hex));
			}, cb)
	});
}

Transactions.prototype.get = function (id, hex, cb) {
	library.dbLite.query("select t.id t_id, t.blockId t_blockId, t.type t_type, t.subtype t_subtype, t.timestamp t_timestamp, hex(t.senderPublicKey) t_senderPublicKey, t.senderId t_senderId, t.recipientId t_recipientId, t.amount t_amount, t.fee t_fee, hex(t.signature) t_signature, hex(t.signSignature) t_signSignature, hex(c_t.generatorPublicKey) t_companyGeneratorPublicKey, (select max(height) + 1 from blocks) - b.height as confirmations " +
	"from trs t " +
	"inner join blocks b on t.blockId = b.id " +
	"left outer join companies as c_t on c_t.address=t.recipientId " +
	"where t.id = $id", {id: id}, ['t_id', 't_blockId', 't_type', 't_subtype', 't_timestamp', 't_senderPublicKey', 't_senderId', 't_recipientId', 't_amount', 't_fee', 't_signature', 't_signSignature', 't_companyGeneratorPublicKey', 'confirmations'], function (err, rows) {
		if (err || rows.length == 0) {
			return cb(err || "Can't find transaction: " + id);
		}

		var transacton = blockHelper.getTransaction(rows[0], true, hex);
		cb(null, transacton);
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
			if (a.timestamp > b.timestamp)
				return -1;
			if (a.timestamp < b.timestamp)
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

Transactions.prototype.processUnconfirmedTransaction = function (transaction, broadcast, cb) {
	var txId = transactionHelper.getId(transaction);

	if (transaction.id && transaction.id != txId) {
		cb && cb("Invalid transaction id");
		return;
	} else {
		transaction.id = txId;
	}

	library.dbLite.query("SELECT id FROM trs WHERE id=$id", {id: transaction.id}, ['id'], function (err, rows) {
		if (err) {
			cb && cb("Internal sql error");
			return;
		}

		if (rows.length > 0) {
			cb && cb("Can't process transaction, transaction already confirmed");
			return;
		} else {
			// check in confirmed transactions
			if (unconfirmedTransactions[transaction.id] || doubleSpendingTransactions[transaction.id]) {
				cb && cb("This transaction already exists");
				return;
			}

			var sender = modules.accounts.getAccountByPublicKey(transaction.senderPublicKey);

			if (!sender) {
				cb && cb("Can't process transaction, sender not found");
				return;
			}

			transaction.senderId = sender.address;

			if (!self.verifySignature(transaction)) {
				cb && cb("Can't verify signature");
				return;
			}

			if (sender.secondSignature) {
				if (!self.verifySecondSignature(transaction, sender.secondPublicKey)) {
					cb && cb("Can't verify second signature");
					return;
				}
			}

			// check if transaction is not float and great then 0
			if (transaction.amount < 0 || transaction.amount.toString().indexOf('.') >= 0) {
				cb && cb("Invalid transaction amount");
				return;
			}

			if (transaction.timestamp > timeHelper.getNow() + 15) {
				cb && cb("Invalid transaction timestamp");
				return;
			}

			var fee = transactionHelper.getFee(transaction, modules.blocks.getFee());

			if (fee <= 0) {
				fee = 1;
			}

			transaction.fee = fee;

			switch (transaction.type) {
				case 0:
					switch (transaction.subtype) {
						case 0:
							if (transactionHelper.getLastChar(transaction) != "C") {
								cb && cb("Invalid transaction recipient id");
								return;
							}
							break;

						default:
							cb && cb("Unknown transaction type");
							return;
					}
					break;

				case 1:
					switch (transaction.subtype) {
						case 0:
							cb && cb("Not supporting transaction");
							return;

						default:
							cb && cb("Unknown transaction type");
							return;
					}
					break;

				case 2:
					switch (transaction.subtype) {
						case 0:
							if (!transaction.asset.signature) {
								cb && cb("Empty transaction asset for company transaction")
								return;
							}
							break;

						default:
							cb && cb("Unknown transaction type");
							return;
					}
					break;

				case 3:
					switch (transaction.subtype) {
						case 0:
							cb && cb("Companies doesn't supports now");
							return;
						default:
							cb && cb("Unknown transaction type");
							return;
					}
					break;

				default:
					cb && cb("Unknown transaction type");
					return;
			}

			async.parallel([
				function (cb) {
					if (transaction.type == 1 && transaction.subtype == 0) {
						library.dbLite.query("SELECT id FROM companies WHERE address = $address", {address: transaction.recipientId}, ['id'], function (err, rows) {
							if (err) {
								return cb("Internal sql error");
							}

							if (rows.length > 0) {
								cb();
							} else {
								cb("Company with this address as recipient not found");
							}
						});
					} else {
						setImmediate(cb);
					}
				}
			], function (err) {
				if (err) {
					return cb && cb(err);
				}

				if (!self.applyUnconfirmed(transaction)) {
					doubleSpendingTransactions[transaction.id] = transaction;
					return cb && cb("Can't apply transaction: " + transaction.id);
				}

				transaction.asset = transaction.asset || {};
				unconfirmedTransactions[transaction.id] = transaction;

				library.bus.message('unconfirmedTransaction', transaction, broadcast)

				cb && cb(null, transaction.id);

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

	// process only two types of transactions
	if (transaction.type == 0) {
		if (transaction.subtype == 0) {
			sender.addToBalance(-amount);

			var recipient = modules.accounts.getAccountOrCreate(transaction.recipientId);
			recipient.addToUnconfirmedBalance(transaction.amount);
			recipient.addToBalance(transaction.amount);

			return true;
		}
	} else if (transaction.type == 1) {
		if (transaction.subtype == 0) {
			return false;
		}
	} else if (transaction.type == 2) {
		if (transaction.subtype == 0) {
			sender.addToBalance(-amount);

			sender.unconfirmedSignature = false;
			sender.secondSignature = true;
			sender.secondPublicKey = transaction.asset.signature.publicKey;
			return true;
		}
	} else {
		return true;
	}
}

Transactions.prototype.applyUnconfirmed = function (transaction) {
	var sender = modules.accounts.getAccountByPublicKey(transaction.senderPublicKey);

	if (!sender && transaction.blockId != genesisblock.blockId) {
		return false;
	} else {
		sender = modules.accounts.getAccountOrCreate(transaction.senderPublicKey);
	}

	if (transaction.type == 2) {
		if (transaction.subtype == 0) {
			if (sender.unconfirmedSignature || sender.secondSignature) {
				return false;
			}

			sender.unconfirmedSignature = true;
		}
	}

	var amount = transaction.amount + transaction.fee;

	if (sender.unconfirmedBalance < amount && transaction.blockId != genesisblock.blockId) {
		return false;
	}

	sender.addToUnconfirmedBalance(-amount);

	return true;
}

Transactions.prototype.undoUnconfirmed = function (transaction) {
	var sender = modules.accounts.getAccountByPublicKey(transaction.senderPublicKey);
	var amount = transaction.amount + transaction.fee;

	sender.addToUnconfirmedBalance(amount);

	if (transaction.type == 2 && transaction.subtype == 0) {
		sender.unconfirmedSignature = false;
	}

	return true;
}


Transactions.prototype.undo = function (transaction) {
	var sender = modules.accounts.getAccountByPublicKey(transaction.senderPublicKey);
	var amount = transaction.amount + transaction.fee;

	sender.addToBalance(amount);

	// process only two types of transactions
	if (transaction.type == 0) {
		if (transaction.subtype == 0) {
			var recipient = modules.accounts.getAccountOrCreate(transaction.recipientId);
			recipient.addToUnconfirmedBalance(-transaction.amount);
			recipient.addToBalance(-transaction.amount);

			return true;
		}
	} else if (transaction.type == 2) {
		if (transaction.subtype == 0) {
			sender.secondSignature = false;
			sender.unconfirmedSignature = true;
			sender.secondPublicKey = null;

			return true;
		}
	} else {
		return true;
	}
}

Transactions.prototype.parseTransaction = function (transaction) {
	transaction.asset = transaction.asset || {}; //temp

	transaction.id = params.string(transaction.id);
	transaction.blockId = params.string(transaction.blockId);
	transaction.type = params.int(transaction.type);
	transaction.subtype = params.int(transaction.subtype);
	transaction.timestamp = params.int(transaction.timestamp);
	transaction.senderPublicKey = params.buffer(transaction.senderPublicKey);
	transaction.senderId = params.string(transaction.senderId);
	transaction.recipientId = params.string(transaction.recipientId);
	transaction.amount = params.int(transaction.amount);
	transaction.fee = params.int(transaction.fee);
	transaction.signature = params.buffer(transaction.signature);

	if (transaction.signSignature) {
		transaction.signSignature = params.buffer(transaction.signSignature);
	}

	if (transaction.type == 2 && transaction.subtype == 0) {
		transaction.asset.signature = modules.signatures.parseSignature(params.object(params.object(transaction.asset).signature));
	}

	if (transaction.type == 3 && transaction.subtype == 0) {
		transaction.asset.company = modules.companies.parseCompany(params.object(params.object(transaction.asset).company))
	}

	return transaction;
}

Transactions.prototype.verifySignature = function (transaction) {
	if (transaction.signature.length != 64 || transaction.senderPublicKey.length != 32) {
		return false;
	}

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

	try {
		var res = ed.Verify(hash, transaction.signature || ' ', transaction.senderPublicKey || ' ');
	} catch (e) {
		library.logger.info("first signature");
		library.logger.error(e, {err: e, transaction: transaction})
	}

	return res;
}

Transactions.prototype.verifySecondSignature = function (transaction, publicKey) {
	if (transaction.signSignature.length != 64 || publicKey.length != 32) {
		return false;
	}

	var bytes = transactionHelper.getBytes(transaction);
	var data2 = new Buffer(bytes.length - 64);

	for (var i = 0; i < data2.length; i++) {
		data2[i] = bytes[i];
	}

	var hash = crypto.createHash('sha256').update(data2).digest();

	try {
		var res = ed.Verify(hash, transaction.signSignature || ' ', publicKey || ' ');
	} catch (e) {
		library.logger.error(e, {err: e, transaction: transaction})
	}

	return res;
}

Transactions.prototype.run = function (scope) {
	modules = scope;
}

module.exports = Transactions;