var transactionHelper = require('../helpers/transaction.js'),
	ed = require('ed25519'),
	bignum = require('bignum'),
	util = require('util'),
	ByteBuffer = require("bytebuffer"),
	crypto = require('crypto'),
	genesisblock = require('../helpers/genesisblock.js'),
	constants = require("../helpers/constants.js"),
	relational = require("../helpers/relational.js"),
	slots = require('../helpers/slots.js'),
	params = require('../helpers/params.js'),
	extend = require('extend'),
	Router = require('../helpers/router.js'),
	arrayHelper = require('../helpers/array.js'),
	async = require('async');

// private fields
var modules, library, self;

var unconfirmedTransactions = {};
var doubleSpendingTransactions = {};

//constructor
function Transactions(cb, scope) {
	library = scope;
	self = this;

	attachApi();

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
		var blockId = params.string(req.query.blockId, true);
		var limit = params.int(req.query.limit, true);
		var orderBy = params.string(req.query.orderBy, true);
		var offset = params.int(req.query.offset, true);
		var senderPublicKey = params.hex(req.query.senderPublicKey || null, true);
		var senderId = params.string(req.query.senderId, true);
		var recipientId = params.string(req.query.recipientId, true)

		list({
			blockId: blockId,
			senderPublicKey: senderPublicKey, //check null
			recipientId: recipientId,
			limit: limit || 20,
			orderBy: orderBy,
			offset: offset,
			senderId: senderId
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

		getById(id, function (err, transaction) {
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

		res.json({success: true, transaction: transaction});
	});

	router.get('/unconfirmed/', function (req, res) {
		var transactions = self.getUnconfirmedTransactions(true),
			toSend = [];

		var senderPublicKey = params.hex(req.query.senderPublicKey || null, true),
			address = params.string(req.query.address, true);

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
		var secret = params.string(req.body.secret),
			amount = params.int(req.body.amount),
			recipientId = params.string(req.body.recipientId || null, true),
			publicKey = params.hex(req.body.publicKey || null, true),
			secondSecret = params.string(req.body.secondSecret || null, true);

		var hash = crypto.createHash('sha256').update(secret, 'utf8').digest();
		var keypair = ed.MakeKeypair(hash);

		if (secret.length == 0) {
			return res.json({success: false, error: "Provide secret key"});
		}

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

		var transaction = {
			type: 0,
			amount: amount,
			recipientId: recipientId,
			senderPublicKey: account.publicKey,
			timestamp: slots.getTime(),
			asset: {}
		};

		self.sign(secret, transaction);

		if (account.secondSignature) {
			if (!secondSecret) {
				return res.json({success: false, error: "Provide second secret key"});
			}

			self.secondSign(secondSecret, transaction);
		}

		library.sequence.add(function (cb) {
			self.processUnconfirmedTransaction(transaction, true, cb);
		}, function (err) {
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
		res.status(500).send({success: false, error: err.toString()});
	});
}

function list(filter, cb) {
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
		async.mapSeries(rows, function (row, cb) {
			setImmediate(cb, null, relational.getTransaction(row));
		}, cb)
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

		var transacton = relational.getTransaction(rows[0]);
		cb(null, transacton);
	});
}

//public methods
Transactions.prototype.sign = function (secret, transaction) {
	var hash = transactionHelper.getHash(transaction);
	var passHash = crypto.createHash('sha256').update(secret, 'utf8').digest();
	var keypair = ed.MakeKeypair(passHash);
	transaction.signature = ed.Sign(hash, keypair).toString('hex');
}

Transactions.prototype.secondSign = function (secret, transaction) {
	var hash = transactionHelper.getHash(transaction);
	var passHash = crypto.createHash('sha256').update(secret, 'utf8').digest();
	var keypair = ed.MakeKeypair(passHash);
	transaction.signSignature = ed.Sign(hash, keypair).toString('hex');
}

Transactions.prototype.getUnconfirmedTransaction = function (id) {
	return unconfirmedTransactions[id];
}

Transactions.prototype.getUnconfirmedTransactions = function (sort) {
	var a = arrayHelper.hash2array(unconfirmedTransactions);

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

	function done(err, transaction) {
		if (err) return cb && cb(err);

		if (!self.applyUnconfirmed(transaction)) {
			doubleSpendingTransactions[transaction.id] = transaction;
			return cb && cb("Can't apply transaction: " + transaction.id);
		}

		unconfirmedTransactions[transaction.id] = transaction;

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
			if (unconfirmedTransactions[transaction.id] || doubleSpendingTransactions[transaction.id]) {
				return done("This transaction already exists");
			}

			var sender = modules.accounts.getAccountByPublicKey(transaction.senderPublicKey);


			if (!sender) {
				return done("Can't process transaction, sender not found");
			}

			transaction.senderId = sender.address;

			if (!self.verifySignature(transaction)) {
				return done("Can't verify signature");
			}

			if (sender.secondSignature) {
				if (!self.verifySecondSignature(transaction, sender.secondPublicKey)) {
					return done("Second secretPhrase is incorrect.");
				}
			}

			if (!sender.secondSignature && transaction.signSignature) {
				return done("Can't process transaction with second signature, sender didn't has second signature");
			}

			// check if transaction is not float and great then 0
			if (transaction.amount < 0 || transaction.amount.toString().indexOf('.') >= 0) {
				return done("Invalid transaction amount");
			}

			if (slots.getSlotNumber(transaction.timestamp) > slots.getSlotNumber()) {
				return done("Invalid transaction timestamp");
			}

			var fee = transactionHelper.getFee(transaction, modules.blocks.getFee());

			if (fee <= 0) {
				fee = 1;
			}

			transaction.fee = fee;

			if (sender.unconfirmedBalance < transaction.amount + transaction.fee) {
				var missed = (transaction.amount + transaction.fee) - sender.unconfirmedBalance;
				missed = missed / constants.fixedPoint
				return done("You are missing " + missed + " XCR");
			}

			switch (transaction.type) {
				case 0:
					if (transactionHelper.getLastChar(transaction) != "C") {
						return done("Invalid transaction recipient id");
					}
					break;


				case 1:
					if (!transaction.asset.signature) {
						return done("Empty transaction asset for signature transaction")
					}

					try {
						if (new Buffer(transaction.asset.signature.publicKey, 'hex').length != 32) {
							return done("Invalid length for signature public key");
						}
					} catch (e) {
						return done("Invalid hex in signature public key");
					}
					break;

				case 2:
					if (transaction.recipientId) {
						return cb("Invalid recipient");
					}

					if (!transaction.asset.delegate.username) {
						return done("Empty transaction asset for delegate transaction");
					}

					if (transaction.asset.delegate.username.length == 0 || transaction.asset.delegate.username.length > 20) {
						return done("Incorrect delegate username length");
					}

					if (modules.delegates.existsName(transaction.asset.delegate.username)) {
						return done("The delegate name you entered is already in use. Please try a different name.");
					}

					if (modules.delegates.existsDelegate(transaction.senderPublicKey)) {
						return done("Your account are delegate already");
					}
					break;
				case 3:
					if (transaction.recipientId != transaction.senderId) {
						return done("Incorrect recipient");
					}

					if (!modules.delegates.checkUnconfirmedDelegates(transaction.senderPublicKey, transaction.asset.votes)) {
						return done("Can't verify votes, you already voted for this delegate: " + transaction.id);
					}

					if (!modules.delegates.checkDelegates(transaction.senderPublicKey, transaction.asset.votes)) {
						return done("Can't verify votes, you already voted for this delegate: " + transaction.id);
					}

					if (transaction.asset.votes !== null && transaction.asset.votes.length > 33) {
						return done("Can't verify votes, most be less then 33 delegates");
					}
					break;
				default:
					return done("Unknown transaction type");
			}


			done(null, transaction);
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

	// process only two types of transactions
	switch (transaction.type) {
		case 0:
			var recipient = modules.accounts.getAccountOrCreateByAddress(transaction.recipientId);
			recipient.addToUnconfirmedBalance(transaction.amount);
			recipient.addToBalance(transaction.amount);
			break;
		case 1:
			sender.unconfirmedSignature = false;
			sender.secondSignature = true;
			sender.secondPublicKey = transaction.asset.signature.publicKey;
			break;
		case 2:
			modules.delegates.removeUnconfirmedDelegate(transaction.asset.delegate);
			modules.delegates.cache(transaction.asset.delegate);
			break;
		case 3:
			sender.applyDelegateList(transaction.asset.votes);
			break;
	}
	return true;
}

Transactions.prototype.applyUnconfirmedList = function (ids) {
	for (var i = 0; i < ids.length; i++) {
		var transaction = unconfirmedTransactions[ids[i]];
		if (!this.applyUnconfirmed(transaction)) {
			delete unconfirmedTransactions[ids[i]];
			doubleSpendingTransactions[ids[i]] = transaction;
		}
	}
}

Transactions.prototype.undoAllUnconfirmed = function () {
	var ids = Object.keys(unconfirmedTransactions);
	for (var i = 0; i < ids.length; i++) {
		var transaction = unconfirmedTransactions[ids[i]];
		this.undoUnconfirmed(transaction);
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

	if (transaction.type == 1) {
		if (sender.unconfirmedSignature || sender.secondSignature) {
			return false;
		}

		sender.unconfirmedSignature = true;
	} else if (transaction.type == 2) {
		if (modules.delegates.getUnconfirmedDelegate(transaction.asset.delegate)) {
			return false;
		}

		if (modules.delegates.getUnconfirmedName(transaction.asset.delegate)) {
			return false;
		}

		modules.delegates.addUnconfirmedDelegate(transaction.asset.delegate);
	} else if (transaction.type == 3) {
		sender.applyUnconfirmedDelegateList(transaction.asset.votes);
	}

	var amount = transaction.amount + transaction.fee;

	if (sender.unconfirmedBalance < amount && transaction.blockId != genesisblock.block.id) {
		if (transaction.type == 1) {
            sender.unconfirmedSignature = false;
        } else if (transaction.type == 2) {
            modules.delegates.removeUnconfirmedDelegate(transaction.asset.delegate);
        } else if (transaction.type == 3) {
			sender.undoUnconfirmedDelegateList(transaction.asset.votes);
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
		case 1:
			sender.unconfirmedSignature = false;
			break;
		case 2:
			modules.delegates.removeUnconfirmedDelegate(transaction.asset.delegate);
			break;
		case 3:
			sender.undoUnconfirmedDelegateList(transaction.asset.votes);
			break;
	}

	return true;
}

Transactions.prototype.undo = function (transaction) {
	var sender = modules.accounts.getAccountByPublicKey(transaction.senderPublicKey);
	var amount = transaction.amount + transaction.fee;

	sender.addToBalance(amount);

	switch (transaction.type) {
		case 0:
			var recipient = modules.accounts.getAccountOrCreateByAddress(transaction.recipientId);
			recipient.addToUnconfirmedBalance(-transaction.amount);
			recipient.addToBalance(-transaction.amount);
			break;
		case 1:
			sender.secondSignature = false;
			sender.unconfirmedSignature = true;
			sender.secondPublicKey = null;
			break;
		case 2:
			modules.delegates.uncache(transaction.asset.delegate);
			modules.delegates.addUnconfirmedDelegate(transaction.asset.delegate);
			break;
		case 3:
			sender.undoDelegateList(transaction.asset.votes);
			break;
	}

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

	try {
		var signatureBuffer = new Buffer(transaction.signature, 'hex');
		var senderPublicKeyBuffer = new Buffer(transaction.senderPublicKey, 'hex');
		var res = ed.Verify(hash, signatureBuffer || ' ', senderPublicKeyBuffer || ' ');
	} catch (e) {
		library.logger.info("first signature");
		library.logger.error(e, {err: e, transaction: transaction})
	}

	return res;
}

Transactions.prototype.verifySecondSignature = function (transaction, publicKey) {
	var bytes = transactionHelper.getBytes(transaction);
	var data2 = new Buffer(bytes.length - 64);

	for (var i = 0; i < data2.length; i++) {
		data2[i] = bytes[i];
	}

	var hash = crypto.createHash('sha256').update(data2).digest();

	try {
		var signSignatureBuffer = new Buffer(transaction.signSignature, 'hex');
		var publicKeyBuffer = new Buffer(publicKey, 'hex');
		var res = ed.Verify(hash, signSignatureBuffer || ' ', publicKeyBuffer || ' ');
	} catch (e) {
		library.logger.error(e, {err: e, transaction: transaction})
	}

	return res;
}

//events
Transactions.prototype.onReceiveTransaction = function (transactions) {
	if (!util.isArray(transactions)) {
		transactions = [transactions];
	}

	library.sequence.add(function (cb) {
		async.forEach(transactions, function (transaction, cb) {
			self.processUnconfirmedTransaction(transaction, true, cb);
		}, cb);
	});
}

Transactions.prototype.onBind = function (scope) {
	modules = scope;
}

//export
module.exports = Transactions;