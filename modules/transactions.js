var ed = require('ed25519'),
	bignum = require('bignum'),
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
	TransactionTypes = require('../helpers/transaction-types.js');

// private fields
var modules, library, self;

var hiddenTransactions = [];
var unconfirmedTransactions = [];
var unconfirmedTransactionsIdIndex = {};
var doubleSpendingTransactions = {};

function Transfer() {
	this.create = function (data, trs) {
		trs.recipientId = data.recipientId;
		trs.amount = data.amount;

		return trs;
	}

	this.calculateFee = function (trs) {
		return trs.fee;
	}

	this.verify = function (trs, sender, cb) {
		cb(null, trs);
	}

	this.getBytes = function (trs) {
		return null;
	}

	this.objectNormalize = function (trs) {
		return trs;
	}

	this.dbRead = function (raw) {
		return null;
	}
}

//constructor
function Transactions(cb, scope) {
	library = scope;
	self = this;

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

			list(query, function (err, transactions) {
				if (err) {
					return res.json({success: false, error: "Transactions not found"});
				}

				res.json({success: true, transactions: transactions});
			});
		});
	});

	router.get('/get', function (req, res) {
		var id = RequestSanitizer.string(req.query.id);

		if (!id) {
			return res.json({success: false, error: "Provide id in url"});
		}

		getById(id, function (err, transaction) {
			if (!transaction || err) {
				return res.json({success: false, error: "Transaction not found"});
			}
			res.json({success: true, transaction: transaction});
		});
	});

	router.get('/unconfirmed/get', function (req, res) {
		var id = RequestSanitizer.string(req.query.id);

		if (!id) {
			return res.json({success: false, error: "Provide id in url"});
		}

		var unconfirmedTransaction = self.getUnconfirmedTransaction(id);

		if (!unconfirmedTransaction) {
			return res.json({success: false, error: "Transaction not found"});
		}

		res.json({success: true, transaction: unconfirmedTransaction});
	});

	router.get('/unconfirmed/', function (req, res) {
		var transactions = self.getUnconfirmedTransactionList(true),
			toSend = [];

		var senderPublicKey = RequestSanitizer.hex(req.query.senderPublicKey || null, true),
			address = RequestSanitizer.string(req.query.address, true);

		if (senderPublicKey || address) {
			for (var i = 0; i < transactions.length; i++) {
				if (transactions[i].senderPublicKey == senderPublicKey || transactions[i].recipientId == address) {
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

	router.put('/', function (req, res) {
		req.sanitize("body", {
			secret: "string!",
			amount: "int!",
			recipientId: "string?",
			publicKey: "hex?",
			username: "string?",
			secondSecret: "string?",
			input: "object?"
		}, function (err, report, body) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			var secret = body.secret,
				amount = body.amount,
				recipientId = body.recipientId,
				username = body.username,
				publicKey = body.publicKey,
				secondSecret = body.secondSecret;

			if (!recipientId && username) {

			}

			var hash = crypto.createHash('sha256').update(secret, 'utf8').digest();
			var keypair = ed.MakeKeypair(hash);

			if (publicKey) {
				if (keypair.publicKey.toString('hex') != publicKey) {
					return res.json({success: false, error: "Please, provide valid secret key of your account"});
				}
			}

			var account = modules.accounts.getAccountByPublicKey(keypair.publicKey.toString('hex'));

			if (!account) {
				return res.json({success: false, error: "Account doesn't has balance"});
			}

			if (!account.publicKey) {
				return res.json({success: false, error: "Open account to make transaction"});
			}

			if (account.secondSignature && !secondSecret) {
				return res.json({success: false, error: "Provide second secret key"});
			}

			var secondKeypair = null;

			if (account.secondSignature) {
				var secondHash = crypto.createHash('sha256').update(secondSecret, 'utf8').digest();
				secondKeypair = ed.MakeKeypair(secondHash);
			}

			var transaction = library.logic.transaction.create({
				type: TransactionTypes.SEND,
				amount: amount,
				sender: account,
				recipientId: recipientId,
				keypair: keypair,
				secondKeypair: secondKeypair
			});

			library.sequence.add(function (cb) {
				self.processUnconfirmedTransaction(transaction, true, cb);
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

	library.app.use('/api/transactions', router);
	library.app.use(function (err, req, res, next) {
		err && library.logger.error('/api/transactions', err)
		if (!err) return next();
		res.status(500).send({success: false, error: err.toString()});
	});
}

function list(filter, cb) {
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

function getById(id, cb) {
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

function addUnconfirmedTransaction(transaction) {
	unconfirmedTransactions.push(transaction);
	var index = unconfirmedTransactions.length - 1;
	unconfirmedTransactionsIdIndex[transaction.id] = index;
}

//public methods
Transactions.prototype.getUnconfirmedTransaction = function (id) {
	var index = unconfirmedTransactionsIdIndex[id];
	return unconfirmedTransactions[index];
}

Transactions.prototype.addDoubleSpending = function (transaction) {
	doubleSpendingTransactions[transaction.id] = transaction;
}

Transactions.prototype.pushHiddenTransaction = function (transaction) {
	hiddenTransactions.push(transaction);
}

Transactions.prototype.shiftHiddenTransaction = function () {
	return hiddenTransactions.shift();
}

Transactions.prototype.deleteHiddenTransaction = function () {
	hiddenTransactions = [];
}

Transactions.prototype.getUnconfirmedTransactionList = function (reverse) {
	var a = [];
	for (var i = 0; i < unconfirmedTransactions.length; i++) {
		if (unconfirmedTransactions[i] !== false) {
			a.push(unconfirmedTransactions[i]);
		}
	}

	return reverse ? a.reverse() : a;
}

Transactions.prototype.removeUnconfirmedTransaction = function (id) {
	var index = unconfirmedTransactionsIdIndex[id];
	delete unconfirmedTransactionsIdIndex[id];
	unconfirmedTransactions[index] = false;
}

Transactions.prototype.processUnconfirmedTransaction = function (transaction, broadcast, cb) {
	var txId = library.logic.transaction.getId(transaction);

	if (transaction.id && transaction.id != txId) {
		cb && cb("Invalid transaction id");
		return;
	} else {
		transaction.id = txId;
	}

	function done(err, transaction) {
		if (err) return cb && cb(err);

		if (!self.applyUnconfirmed(transaction)) {
			self.addDoubleSpending(transaction);
			return cb && cb("Can't apply transaction: " + transaction.id);
		}

		addUnconfirmedTransaction(transaction)

		library.bus.message('unconfirmedTransaction', transaction, broadcast)

		cb && cb(null, transaction.id);
	}

	library.dbLite.query("SELECT count(id) FROM trs WHERE id=$id", {id: transaction.id}, {"count": Number}, function (err, rows) {
		if (err) {
			done("Internal sql error");
			return;
		}

		var res = rows.length && rows[0];

		if (res.count) {
			return done("Can't process transaction, transaction already confirmed");
		} else {
			// check in confirmed transactions
			if (unconfirmedTransactionsIdIndex[transaction.id] !== undefined || doubleSpendingTransactions[transaction.id]) {
				return done("This transaction already exists");
			}

			var sender = modules.accounts.getAccountByPublicKey(transaction.senderPublicKey);

			if (!sender) {
				return done("Can't process transaction, sender not found");
			}

			transaction.senderId = sender.address;

			if (!library.logic.transaction.verifySignature(transaction)) {
				return done("Can't verify signature");
			}

			library.logic.transaction.verify(transaction, sender, done);
		}
	});
}

Transactions.prototype.apply = function (transaction) {
	var sender = modules.accounts.getAccountByPublicKey(transaction.senderPublicKey);
	var amount = transaction.amount + transaction.fee;

	if (sender.balance < amount && transaction.blockId != genesisblock.block.id) {
		return false;
	}

	sender.addToBalance(-amount);

	switch (transaction.type) {
		case TransactionTypes.SEND:
			var recipient = modules.accounts.getAccountOrCreateByAddress(transaction.recipientId);
			recipient.addToUnconfirmedBalance(transaction.amount);
			recipient.addToBalance(transaction.amount);
			break;
		case TransactionTypes.SIGNATURE:
			sender.unconfirmedSignature = false;
			sender.secondSignature = true;
			sender.secondPublicKey = transaction.asset.signature.publicKey;
			break;
		case TransactionTypes.DELEGATE:
			modules.delegates.removeUnconfirmedDelegate(transaction.asset.delegate);
			modules.delegates.cache(transaction.asset.delegate);
			break;
		case TransactionTypes.VOTE:
			sender.applyDelegateList(transaction.asset.votes);
			break;
		case TransactionTypes.AVATAR:
			sender.unconfirmedAvatar = false;
			sender.avatar = true;
			break;
		case TransactionTypes.USERNAME:
			sender.applyUsername(transaction.asset.username);
			break;
	}
	return true;
}

Transactions.prototype.applyUnconfirmedList = function (ids) {
	for (var i = 0; i < ids.length; i++) {
		var transaction = self.getUnconfirmedTransaction(ids[i])
		if (!self.applyUnconfirmed(transaction)) {
			self.removeUnconfirmedTransaction(ids[i]);
			self.addDoubleSpending(transaction);
		}
	}
}

Transactions.prototype.undoUnconfirmedList = function () {
	var ids = [];
	for (var i = 0; i < unconfirmedTransactions.length; i++) {
		if (unconfirmedTransactions[i] !== false) {
			ids.push(unconfirmedTransactions[i].id);
			self.undoUnconfirmed(unconfirmedTransactions[i]);
		}
	}
	return ids;
}

Transactions.prototype.applyUnconfirmed = function (transaction) {
	var sender = modules.accounts.getAccountByPublicKey(transaction.senderPublicKey);

	if (!sender && transaction.blockId != genesisblock.block.id) {
		return false;
	} else {
		sender = modules.accounts.getAccountOrCreateByPublicKey(transaction.senderPublicKey);
	}

	if (sender.secondSignature && !transaction.signSignature) {
		return false;
	}

	switch (transaction.type) {
		case TransactionTypes.SIGNATURE:
			if (sender.unconfirmedSignature || sender.secondSignature) {
				return false;
			}

			sender.unconfirmedSignature = true;
			break;
		case TransactionTypes.DELEGATE:
			if (modules.delegates.getUnconfirmedDelegate(transaction.asset.delegate)) {
				return false;
			}

			if (modules.delegates.getUnconfirmedName(transaction.asset.delegate)) {
				return false;
			}

			modules.delegates.addUnconfirmedDelegate(transaction.asset.delegate);
			break;
		case TransactionTypes.VOTE:
			if (!sender.applyUnconfirmedDelegateList(transaction.asset.votes)) {
				return false;
			}
			break;
		case TransactionTypes.AVATAR:
			if (sender.unconfirmedAvatar || sender.avatar) {
				return false;
			}

			return true;
			break;
	}

	var amount = transaction.amount + transaction.fee;

	if (sender.unconfirmedBalance < amount && transaction.blockId != genesisblock.block.id) {
		switch (transaction.type) {
			case TransactionTypes.SIGNATURE:
				sender.unconfirmedSignature = false;
				break;
			case TransactionTypes.DELEGATE:
				modules.delegates.removeUnconfirmedDelegate(transaction.asset.delegate);
				break;
			case TransactionTypes.VOTE:
				sender.undoUnconfirmedDelegateList(transaction.asset.votes);
				break;

			case TransactionTypes.AVATAR:
				sender.unconfirmedAvatar = true;
				break;
		}

		return false;
	}

	sender.addToUnconfirmedBalance(-amount);

	return true;
}

Transactions.prototype.undoUnconfirmed = function (transaction) {
	var sender = modules.accounts.getAccountByPublicKey(transaction.senderPublicKey);
	var amount = transaction.amount + transaction.fee;

	sender.addToUnconfirmedBalance(amount);

	switch (transaction.type) {
		case TransactionTypes.SIGNATURE:
			sender.unconfirmedSignature = false;
			break;
		case TransactionTypes.DELEGATE:
			modules.delegates.removeUnconfirmedDelegate(transaction.asset.delegate);
			break;
		case TransactionTypes.VOTE:
			sender.undoUnconfirmedDelegateList(transaction.asset.votes);
			break;
		case TransactionTypes.AVATAR:
			sender.unconfirmedAvatar = false;
			break;
	}

	return true;
}

Transactions.prototype.undo = function (transaction) {
	var sender = modules.accounts.getAccountByPublicKey(transaction.senderPublicKey);
	var amount = transaction.amount + transaction.fee;

	sender.addToBalance(amount);

	switch (transaction.type) {
		case TransactionTypes.SEND:
			var recipient = modules.accounts.getAccountOrCreateByAddress(transaction.recipientId);
			recipient.addToUnconfirmedBalance(-transaction.amount);
			recipient.addToBalance(-transaction.amount);
			break;
		case TransactionTypes.SIGNATURE:
			sender.secondSignature = false;
			sender.unconfirmedSignature = true;
			sender.secondPublicKey = null;
			break;
		case TransactionTypes.DELEGATE:
			modules.delegates.uncache(transaction.asset.delegate);
			modules.delegates.addUnconfirmedDelegate(transaction.asset.delegate);
			break;
		case TransactionTypes.VOTE:
			sender.undoDelegateList(transaction.asset.votes);
			break;
		case TransactionTypes.AVATAR:
			sender.avatar = false;
			sender.unconfirmedAvatar = true;
			break;
		case TransactionTypes.USERNAME:
			sender.undoUsername(transaction.asset.username);
			break;
	}

	return true;
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