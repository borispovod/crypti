var transactionHelper = require('../helpers/transaction.js'),
	scriptHelper = require('../helpers/script.js'),
	ed = require('ed25519'),
	bignum = require('bignum'),
	util = require('util'),
	ByteBuffer = require("bytebuffer"),
	crypto = require('crypto'),
	genesisblock = require('../helpers/genesisblock.js'),
	constants = require("../helpers/constants.js"),
	relational = require("../helpers/relational.js"),
	slots = require('../helpers/slots.js'),
	extend = require('extend'),
	Router = require('../helpers/router.js'),
	arrayHelper = require('../helpers/array.js'),
	async = require('async'),
	RequestSanitizer = require('../helpers/request-sanitizer.js'),
	JsonSchema = require('../helpers/json-schema'),
	esprima = require('esprima');

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
		req.sanitize("query", {
			blockId : "string?",
			limit : "int?",
			orderBy: "string?",
			offset : {default:0,int:true},
			senderPublicKey:"hex?",
			senderId:"string",
			recipientId:"string?"
		}, function(err, report, query){
			if (err) return next(err);
			if (! report.isValid) return res.json({success:false, error:report.issues});

			list(query, function(err, transactions){
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

		var senderPublicKey = RequestSanitizer.hex(req.query.senderPublicKey || null, true),
			address = RequestSanitizer.string(req.query.address, true);

		if (senderPublicKey || address) {
			for (var i = 0; i < transactions.length; i++) {
				if (transactions[i].senderPublicKey == senderPublicKey || transactions[i].recipientId == address) {
					var transaction = extend(true, {}, transactions[i]);

					delete transaction.asset;

					toSend.push(transaction);
				}
			}
		} else {
			for (var i = 0; i < transactions.length; i++) {
				var transaction = extend(true, {}, transactions[i]);

				delete transaction.asset;

				toSend.push(transaction);
			}
		}

		res.json({success: true, transactions: toSend});
	});

	router.put('/', function (req, res) {
		req.sanitize("body", {
			secret : {
				string:true,
				minLength : 1
			},
			amount : "int",
			recipientId : "string?",
			publicKey : "hex?",
			secondSecret : "string?",
			scriptId : "string?",
			input : "object?"
		}, function(err, report, body) {
			if (err) return next(err);
			if (! report.isValid) return res.json({success: false, error: report.issues});

			var secret = body.secret,
				amount = body.amount,
				recipientId = body.recipientId,
				publicKey = body.publicKey,
				secondSecret = body.secondSecret,
				scriptId = body.scriptId,
				input = body.input;

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

			var type = 0,
				asset = {};

			if (scriptId) {
				type = 5;

				asset.input = {
					data: new Buffer(JSON.stringify(input), 'utf8').toString('hex'),
					scriptId : scriptId
				};
			}

			var transaction = {
				type: type,
				amount: amount,
				recipientId: recipientId,
				senderPublicKey: account.publicKey,
				timestamp: slots.getTime(),
				asset: asset
			};

			self.sign(secret, transaction);

			if (account.secondSignature) {
				if (!secondSecret) {
					return res.json({success: false, error: "Provide second secret key"});
				}

				self.secondSign(secondSecret, transaction);
			}

			self.processUnconfirmedTransaction(transaction, true, function (err) {
				if (err) return res.json({success: false, error: err});

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

/**
 * Remove transaction from list of unconfirmed transactions by it's id.
 * @param {string} id Transaction id
 */
Transactions.prototype.removeUnconfirmedTransaction = function (id) {
	if (unconfirmedTransactions[id]) {
		delete unconfirmedTransactions[id];
	}
}

/**
 * Process unconfirmed transaction
 * @param {object} transaction
 * @param {boolean} broadcast Broadcast transaction confirmation
 * @param {function(err,transaction=)} cb Result callback.
 */
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

			self.validateTransaction(transaction, done);
		}
	});
}

/**
 * Validate unconfirmed transaction
 *
 * @param {object} transaction Transaction object
 * @param {function(err:Error|string,transaction:object=)} done Result callback
 * @returns {*}
 */
Transactions.prototype.validateTransaction = function(transaction, done) {
	var sender = modules.accounts.getAccountByPublicKey(transaction.senderPublicKey);

	if (!modules.transactions.verifySignature(transaction)) {
		return done("Can't verify transaction signature: " + transaction.id);
	}

	if (sender.secondSignature) {
		if (!modules.transactions.verifySecondSignature(transaction, sender.secondPublicKey)) {
			return done("Can't verify second signature: " + transaction.id);
		}
	}

	transaction.fee = transactionHelper.getTransactionFee(transaction);

	if (transaction.fee === false) {
		return done("Invalid transaction type/fee: " + transaction.id);
	}

	if (transaction.amount < 0 || String(transaction.amount).indexOf('.') >= 0) {
		return done("Invalid transaction amount: " + transaction.id);
	}

	if (slots.getSlotNumber(transaction.timestamp) > slots.getSlotNumber()) {
		return done("Invalid transaction timestamp");
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
			if (!transaction.asset.delegate.username) {
				return done("Empty transaction asset for delegate transaction");
			}

			if (transaction.asset.delegate.username.length == 0 || transaction.asset.delegate.username.length > 20) {
				return done("Incorrect delegate username length");
			}

			if (modules.delegates.existsName(transaction.asset.delegate.username)) {
				return done("Delegate with this name is already exists");
			}

			if (modules.delegates.existsDelegate(transaction.senderPublicKey)) {
				return done("This account already delegate");
			}
			break;
		case 3:
			if (transaction.recipientId != transaction.senderId) {
				return done("Incorrect recipient");
			}

			if (!modules.delegates.checkDelegates(transaction.senderPublicKey, transaction.asset.votes)) {
				return done("Can't verify votes, vote for not exists delegate found: " + transaction.id);
			}
			break;
		case 4:
			if (transaction.recipientId != null) {
				return done("Incorrect recipient");
			}

			if (!transaction.asset.script) {
				return done("Transaction script not set");
			}

			self.validateTransactionScript(transaction.asset.script, function(err){
				if (err) return done(err);

				if (!transaction.asset.script.name || transaction.asset.script.name.length == 0 || transaction.asset.script.name.length > 16) {
					return done("Incorrect name length");
				}

				if (transaction.asset.script.description && transaction.asset.script.description.length > 140) {
					return done("Incorrect description length");
				}

				done(null, transaction);
			});

			break;
		case 5:
			if (!transaction.asset.input) {
				return done("Empty asset");
			}

			// verify input
			if (!transaction.asset.input.scriptId) {
				return done("Empty script id in transaction");
			}

			if (!transaction.asset.input.scriptId) {
				return done("Empty input in transaction");
			}

			// need to rewrite this part async
			modules.scripts.getScript(transaction.asset.input.scriptId, function (err, script) {
				if (err || !script) {
					return done(err || ("Script not found: " + transaction.asset.input.scriptId));
				}

				transaction.asset.script = script;

				self.validateTransactionScript(script, function(err, script){
					if (err) return done(err);

					try {
						var input = JSON.parse(new Buffer(transaction.asset.input.data, 'hex'));
					} catch (err) {
						return done(err);
					}

					transaction.asset.script.code = new Buffer(transaction.asset.script.code, 'hex').toString('utf8');
					transaction.asset.script.parameters = new Buffer(transaction.asset.script.parameters, 'hex').toString('utf8');

					JsonSchema.validate(input, script.parameters, function(err, report){
						if (err) return done(err);
						if (! report.isValid) return done(report.issues);

						done(null, transaction);
					});
				});
			});

			break;
		default:
			return done("Unknown transaction type");
	}
}

/**
 * Validate transaction script.
 * @param {{code:string,parameters:string}} script Script object.
 * @param {function(err:Error|string, script:{code:string,parameters:{}}=)} callback Result callback
 * @returns {*}
 */
Transactions.prototype.validateTransactionScript = function (script, cb) {


	if (!script.code) {
		return cb("Transaction script code not exists");
	}

	var code = null, parameters = null;

	try {
		code = new Buffer(script.code, 'hex');
		parameters = new Buffer(script.parameters, 'hex');
	} catch (e) {
		return cb("Can't parse code/parameters from hex to strings in script transaction.");
	}


	if (code.length > 4 * 1024) {
		return cb("Incorrect script code length");
	}

	try {
		esprima.parse(code.toString('utf8'));
	} catch (err) {
		return cb("Transaction script code is not valid");
	}

	if (parameters.length > 4 * 1024) {
		return cb("Incorrect script parameters length");
	}

	try {
		parameters = JSON.parse(parameters.toString('utf8'));
	} catch (e) {
		return cb("Incorrect script parameters json");
	}

	cb(null, {
		code : code,
		parameters : parameters
	});
}

Transactions.prototype.apply = function (transaction) {
	var sender = modules.accounts.getAccountByPublicKey(transaction.senderPublicKey);
	var amount = transaction.amount + transaction.fee;

	if (sender.balance < amount && transaction.blockId != genesisblock.blockId) {
		return false;
	}

	// process only two types of transactions
	switch (transaction.type) {
		case 0:
			sender.addToBalance(-amount);

			var recipient = modules.accounts.getAccountOrCreateByAddress(transaction.recipientId);
			recipient.addToUnconfirmedBalance(transaction.amount);
			recipient.addToBalance(transaction.amount);
			break;
		case 1:
			sender.addToBalance(-amount);

			sender.unconfirmedSignature = false;
			sender.secondSignature = true;
			sender.secondPublicKey = transaction.asset.signature.publicKey;
			break;
		case 2:
			sender.addToBalance(-amount);

			modules.delegates.removeUnconfirmedDelegate(transaction.asset.delegate);
			modules.delegates.cache(transaction.asset.delegate);
			break;
		case 3:
			sender.addToBalance(-amount);

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

	if (!sender && transaction.blockId != genesisblock.blockId) {
		return false;
	} else {
		sender = modules.accounts.getAccountOrCreateByPublicKey(transaction.senderPublicKey);
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

	if (transaction.type == 1) {
		sender.unconfirmedSignature = false;
	} else if (transaction.type == 2) {
		modules.delegates.removeUnconfirmedDelegate(transaction.asset.delegate);
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

	async.forEach(transactions, function (transaction, cb) {
		self.processUnconfirmedTransaction(transaction, true, cb);
	});
}

Transactions.prototype.onBind = function (scope) {
	modules = scope;
}

//export
module.exports = Transactions;