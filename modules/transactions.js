var ed = require('ed25519'),
	util = require('util'),
	ByteBuffer = require("bytebuffer"),
	crypto = require('crypto'),
	genesisblock = require('../helpers/genesisblock.js'),
	constants = require("../helpers/constants.js"),
	slots = require('../helpers/slots.js'),
	extend = require('extend'),
	Router = require('../helpers/router.js'),
	async = require('async'),
	RequestSanitizer = require('../helpers/request-sanitizer.js'),
	TransactionTypes = require('../helpers/transaction-types.js'),
	errorCode = require('../helpers/errorCodes.js').error;

// private fields
var modules, library, self, private = {};

private.hiddenTransactions = [];
private.unconfirmedTransactions = [];
private.unconfirmedTransactionsIdIndex = {};
private.doubleSpendingTransactions = {};

function Transfer() {
	this.create = function (data, trs) {
		trs.recipientId = data.recipientId;
		trs.amount = data.amount;

		return trs;
	}

	this.calculateFee = function (trs) {
		return parseInt(trs.amount / 100 * library.logic.block.calculateFee());
	}

	this.verify = function (trs, sender, cb) {
		var isAddress = /^[0-9]+[C|c]$/g;
		if (!isAddress.test(trs.recipientId.toLowerCase())) {
			return cb(errorCode("TRANSACTIONS.INVALID_RECIPIENT", trs));
		}

		if (trs.amount <= 0) {
			return cb(errorCode("TRANSACTIONS.INVALID_AMOUNT", trs));
		}

		cb(null, trs);
	}

	this.getBytes = function (trs) {
		return null;
	}

	this.apply = function (trs, sender) {
		var recipient = modules.accounts.getAccountOrCreateByAddress(trs.recipientId);

		recipient.addToUnconfirmedBalance(trs.amount);
		recipient.addToBalance(trs.amount);

		return true;
	}

	this.undo = function (trs, sender) {
		var recipient = modules.accounts.getAccountOrCreateByAddress(trs.recipientId);

		recipient.addToUnconfirmedBalance(-trs.amount);
		recipient.addToBalance(-trs.amount);

		return true;
	}

	this.applyUnconfirmed = function (trs, sender, cb) {
		setImmediate(cb);
	}

	this.undoUnconfirmed = function (trs, sender) {
		return true;
	}

	this.objectNormalize = function (trs) {
		return trs;
	}

	this.dbRead = function (raw) {
		return null;
	}

	this.dbSave = function (dbLite, trs, cb) {
		setImmediate(cb);
	}

	this.ready = function (trs) {
		return true;
	}
}

//constructor
function Transactions(cb, scope) {
	library = scope;
	self = this;
	self.__private = private;
	attachApi();

	library.logic.transaction.attachAssetType(TransactionTypes.SEND, new Transfer());

	setImmediate(cb, null, self);
}

//private methods
function attachApi() {
	var router = new Router();

	router.use(function (req, res, next) {
		if (modules) return next();
		res.status(500).send({success: false, error: 'loading'});
	});

	router.get('/', function (req, res) {
		req.sanitize("query", {
			blockId: "string?",
			limit: "int?",
			orderBy: "string?",
			offset: {default: 0, int: true},
			senderPublicKey: "hex?",
			senderId: "string?",
			recipientId: "string?"
		}, function (err, report, query) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			private.list(query, function (err, transactions) {
				if (err) {
					return res.json({success: false, error: errorCode("TRANSACTIONS.TRANSACTIONS_NOT_FOUND")});
				}

				res.json({success: true, transactions: transactions});
			});
		});
	});

	router.get('/get', function (req, res) {
		req.sanitize("query", {id: "string!"}, function (err, report, query) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			private.getById(query.id, function (err, transaction) {
				if (!transaction || err) {
					return res.json({success: false, error: errorCode("TRANSACTIONS.TRANSACTION_NOT_FOUND")});
				}
				res.json({success: true, transaction: transaction});
			});
		});
	});

	router.get('/unconfirmed/get', function (req, res) {
		req.sanitize("query", {id: "string!"}, function (err, report, query) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			var unconfirmedTransaction = self.getUnconfirmedTransaction(query.id);

			if (!unconfirmedTransaction) {
				return res.json({success: false, error: errorCode("TRANSACTIONS.TRANSACTION_NOT_FOUND")});
			}

			res.json({success: true, transaction: unconfirmedTransaction});
		});
	});

	router.get('/unconfirmed/', function (req, res) {
		req.sanitize("query", {
			senderPublicKey: "hex?",
			address: "string?"
		}, function (err, report, query) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			var transactions = self.getUnconfirmedTransactionList(true),
				toSend = [];

			if (query.senderPublicKey || query.address) {
				for (var i = 0; i < transactions.length; i++) {
					if (transactions[i].senderPublicKey == query.senderPublicKey || transactions[i].recipientId == query.address) {
						toSend.push(transactions[i]);
					}
				}
			} else {
				for (var i = 0; i < transactions.length; i++) {
					toSend.push(transactions[i]);
				}
			}

			res.json({success: true, transactions: toSend});
		});
	});

	router.put('/', function (req, res) {
		req.sanitize("body", {
			secret: "string!",
			amount: "int!",
			recipientId: "string!",
			publicKey: "hex?",
			secondSecret: "string?"
		}, function (err, report, body) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			var recipientId = null;
			var isAddress = /^[0-9]+[C|c]$/g;
			if (isAddress.test(body.recipientId)) {
				recipientId = body.recipientId;
			} else {
				var recipient = modules.accounts.getAccountByUsername(body.recipientId);
				if (!recipient) {
					return res.json({success: false, error: errorCode("TRANSACTIONS.RECIPIENT_NOT_FOUND")});
				}
				recipientId = recipient.address;
			}

			var hash = crypto.createHash('sha256').update(body.secret, 'utf8').digest();
			var keypair = ed.MakeKeypair(hash);

			if (body.publicKey) {
				if (keypair.publicKey.toString('hex') != body.publicKey) {
					return res.json({success: false, error: errorCode("COMMON.INVALID_SECRET_KEY")});
				}
			}

			var account = modules.accounts.getAccountByPublicKey(keypair.publicKey.toString('hex'));

			if (!account || !account.publicKey) {
				return res.json({success: false, error: errorCode("COMMON.OPEN_ACCOUNT")});
			}


			if (account.secondSignature && !body.secondSecret) {
				return res.json({success: false, error: errorCode("COMMON.SECOND_SECRET_KEY")});
			}

			var secondKeypair = null;

			if (account.secondSignature) {
				var secondHash = crypto.createHash('sha256').update(body.secondSecret, 'utf8').digest();
				secondKeypair = ed.MakeKeypair(secondHash);
			}

			var transaction = library.logic.transaction.create({
				type: TransactionTypes.SEND,
				amount: body.amount,
				sender: account,
				recipientId: recipientId,
				keypair: keypair,
				secondKeypair: secondKeypair
			});

			library.sequence.add(function (cb) {
				modules.transactions.receiveTransactions([transaction], cb);
			}, function (err) {
				if (err) {
					return res.json({success: false, error: err});
				}

				res.json({success: true, transactionId: transaction.id});
			});
		});
	});

	router.use(function (req, res, next) {
		res.status(500).send({success: false, error: 'api not found'});
	});

	library.network.app.use('/api/transactions', router);
	library.network.app.use(function (err, req, res, next) {
		if (!err) return next();
		library.logger.error(req.url, err.toString());
		res.status(500).send({success: false, error: err.toString()});
	});
}

private.list = function (filter, cb) {
	var sortFields = ['t.id', 't.blockId', 't.type', 't.timestamp', 't.senderPublicKey', 't.senderId', 't.recipientId', 't.amount', 't.fee', 't.signature', 't.signSignature', 't.confirmations'];
	var params = {}, fields = [];
	if (filter.blockId) {
		fields.push('blockId = $blockId')
		params.blockId = filter.blockId;
	}
	if (filter.senderPublicKey) {
		fields.push('lower(hex(senderPublicKey)) = $senderPublicKey')
		params.senderPublicKey = filter.senderPublicKey;
	}
	if (filter.senderId) {
		fields.push('senderId = $senderId');
		params.senderId = filter.senderId;
	}
	if (filter.recipientId) {
		fields.push('recipientId = $recipientId')
		params.recipientId = filter.recipientId;
	}
	if (filter.limit) {
		params.limit = filter.limit;
	}
	if (filter.offset) {
		params.offset = filter.offset;
	}

	if (filter.orderBy) {
		var sort = filter.orderBy.split(':');
		var sortBy = sort[0].replace(/[^\w\s]/gi, '');
		sortBy = "t." + sortBy;
		if (sort.length == 2) {
			var sortMethod = sort[1] == 'desc' ? 'desc' : 'asc'
		} else {
			sortMethod = "desc";
		}
	}

	if (sortBy) {
		if (sortFields.indexOf(sortBy) < 0) {
			return cb("Invalid field to sort");
		}
	}

	if (filter.limit > 100) {
		return cb('Maximum of limit is 100');
	}

	// need to fix 'or' or 'and' in query
	library.dbLite.query("select t.id, t.blockId, t.type, t.timestamp, lower(hex(t.senderPublicKey)), t.senderId, t.recipientId, t.amount, t.fee, lower(hex(t.signature)), lower(hex(t.signSignature)), (select max(height) + 1 from blocks) - b.height " +
	"from trs t " +
	"inner join blocks b on t.blockId = b.id " +
	(fields.length ? "where " + fields.join(' or ') : '') + " " +
	(filter.orderBy ? 'order by ' + sortBy + ' ' + sortMethod : '') + " " +
	(filter.limit ? 'limit $limit' : '') + " " +
	(filter.offset ? 'offset $offset' : ''), params, ['t_id', 't_blockId', 't_type', 't_timestamp', 't_senderPublicKey', 't_senderId', 't_recipientId', 't_amount', 't_fee', 't_signature', 't_signSignature', 'confirmations'], function (err, rows) {
		if (err) {
			return cb(err)
		}

		var transactions = [];
		for (var i = 0; i < rows.length; i++) {
			transactions.push(library.logic.transaction.dbRead(rows[i]));
		}
		cb(null, transactions);
	});
}

private.getById = function (id, cb) {
	library.dbLite.query("select t.id, t.blockId, t.type, t.timestamp, lower(hex(t.senderPublicKey)), t.senderId, t.recipientId, t.amount, t.fee, lower(hex(t.signature)), lower(hex(t.signSignature)), (select max(height) + 1 from blocks) - b.height " +
	"from trs t " +
	"inner join blocks b on t.blockId = b.id " +
	"where t.id = $id", {id: id}, ['t_id', 't_blockId', 't_type', 't_timestamp', 't_senderPublicKey', 't_senderId', 't_recipientId', 't_amount', 't_fee', 't_signature', 't_signSignature', 'confirmations'], function (err, rows) {
		if (err || !rows.length) {
			return cb(err || "Can't find transaction: " + id);
		}

		var transacton = library.logic.transaction.dbRead(rows[0]);
		cb(null, transacton);
	});
}

private.addUnconfirmedTransaction = function (transaction, cb) {
	self.applyUnconfirmed(transaction, function (err) {
		if (err) {
			self.addDoubleSpending(transaction);
			return setImmediate(cb, err);
		}

		private.unconfirmedTransactions.push(transaction);
		var index = private.unconfirmedTransactions.length - 1;
		private.unconfirmedTransactionsIdIndex[transaction.id] = index;

		setImmediate(cb);
	});
}

//public methods
Transactions.prototype.getUnconfirmedTransaction = function (id) {
	var index = private.unconfirmedTransactionsIdIndex[id];
	return private.unconfirmedTransactions[index];
}

Transactions.prototype.addDoubleSpending = function (transaction) {
	private.doubleSpendingTransactions[transaction.id] = transaction;
}

Transactions.prototype.pushHiddenTransaction = function (transaction) {
	private.hiddenTransactions.push(transaction);
}

Transactions.prototype.shiftHiddenTransaction = function () {
	return private.hiddenTransactions.shift();
}

Transactions.prototype.deleteHiddenTransaction = function () {
	private.hiddenTransactions = [];
}

Transactions.prototype.getUnconfirmedTransactionList = function (reverse) {
	var a = [];
	for (var i = 0; i < private.unconfirmedTransactions.length; i++) {
		if (private.unconfirmedTransactions[i] !== false) {
			a.push(private.unconfirmedTransactions[i]);
		}
	}

	return reverse ? a.reverse() : a;
}

Transactions.prototype.removeUnconfirmedTransaction = function (id) {
	var index = private.unconfirmedTransactionsIdIndex[id];
	delete private.unconfirmedTransactionsIdIndex[id];
	private.unconfirmedTransactions[index] = false;
}

Transactions.prototype.processUnconfirmedTransaction = function (transaction, broadcast, cb) {
	var txId = library.logic.transaction.getId(transaction);

	if (transaction.id && transaction.id != txId) {
		return cb("Invalid transaction id");
	} else {
		transaction.id = txId;
	}

	library.dbLite.query("SELECT count(id) FROM trs WHERE id=$id", {id: transaction.id}, {"count": Number}, function (err, rows) {
		if (err) {
			return cb("Internal sql error");
		}

		var res = rows.length && rows[0];

		if (res.count) {
			return cb("Can't process transaction, transaction already confirmed");
		} else {
			// check in confirmed transactions
			if (private.unconfirmedTransactionsIdIndex[transaction.id] !== undefined || private.doubleSpendingTransactions[transaction.id]) {
				return cb("This transaction already exists");
			}

			var sender = modules.accounts.getAccountByPublicKey(transaction.senderPublicKey);

			if (!sender) {
				return cb("Can't process transaction, sender not found");
			}

			transaction.senderId = sender.address;

			if (!library.logic.transaction.verifySignature(transaction, transaction.senderPublicKey, transaction.signature)) {
				return cb("Can't verify signature");
			}

			function done(err) {
				if (err) {
					return cb(err);
				}

				private.addUnconfirmedTransaction(transaction, function (err) {
					if (err) {
						return cb(err);
					}

					library.bus.message('unconfirmedTransaction', transaction, broadcast);

					cb();
				});
			}

			if (!library.logic.transaction.ready(transaction)) {
				return done();
			}

			library.logic.transaction.verify(transaction, sender, done);
		}
	});
}

Transactions.prototype.applyUnconfirmedList = function (ids, cb) {
	async.eachSeries(ids, function (id, cb) {
		var transaction = self.getUnconfirmedTransaction(id)
		self.applyUnconfirmed(transaction, function (err) {
			if (err) {
				self.removeUnconfirmedTransaction(id);
				self.addDoubleSpending(transaction);
			}
			setImmediate(cb);
		});
	}, cb);
}

Transactions.prototype.undoUnconfirmedList = function () {
	var ids = [];
	for (var i = 0; i < private.unconfirmedTransactions.length; i++) {
		if (private.unconfirmedTransactions[i] !== false) {
			ids.push(private.unconfirmedTransactions[i].id);
			self.undoUnconfirmed(private.unconfirmedTransactions[i]);
		}
	}
	return ids;
}

Transactions.prototype.apply = function (transaction) {
	var sender = modules.accounts.getAccountByPublicKey(transaction.senderPublicKey);

	return library.logic.transaction.apply(transaction, sender);
}

Transactions.prototype.undo = function (transaction) {
	var sender = modules.accounts.getAccountByPublicKey(transaction.senderPublicKey);

	return library.logic.transaction.undo(transaction, sender);
}

Transactions.prototype.applyUnconfirmed = function (transaction, cb) {
	var sender = modules.accounts.getAccountByPublicKey(transaction.senderPublicKey);

	if (!sender && transaction.blockId != genesisblock.block.id) {
		return setImmediate(cb, 'Failed account: ' + transaction.id);
	} else {
		sender = modules.accounts.getAccountOrCreateByPublicKey(transaction.senderPublicKey);
	}

	return library.logic.transaction.applyUnconfirmed(transaction, sender, cb);
}

Transactions.prototype.undoUnconfirmed = function (transaction) {
	var sender = modules.accounts.getAccountByPublicKey(transaction.senderPublicKey);

	return library.logic.transaction.undoUnconfirmed(transaction, sender);
}

Transactions.prototype.receiveTransactions = function (transactions, cb) {
	async.eachSeries(transactions, function (transaction, cb) {
		self.processUnconfirmedTransaction(transaction, true, cb);
	}, cb);
}

//events
Transactions.prototype.onBind = function (scope) {
	modules = scope;
}

//export
module.exports = Transactions;