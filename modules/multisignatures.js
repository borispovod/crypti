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
var modules, library, self, private = {};

private.hiddenTransactions = [];
private.unconfirmedTransactions = [];
private.unconfirmedTransactionsIdIndex = {};
private.doubleSpendingTransactions = {};

function Multisignature() {
	this.create = function (data, trs) {
		trs.recipientId = null;
		trs.amount = 0;
		trs.asset.multisignature = {
			min: data.min,
			dependence: data.dependence,
			lifetime: data.lifetime,
			signatures: []
		};

		return trs;
	}

	this.calculateFee = function (trs) {
		return 1 * constants.fixedPoint;
	}

	this.verify = function (trs, sender, cb) {
		if (trs.recipientId) {
			return cb("Invalid recipient: " + trs.id);
		}

		if (trs.amount != 0) {
			return cb("Invalid amount: " + trs.id);
		}

		if (!util.isArray(trs.asset.multisignature.dependence)) {
			return cb("Wrong transaction asset for multisignature transaction: " + trs.id);
		}

		if (!util.isArray(trs.asset.multisignature.signatures)) {
			return cb("Wrong transaction asset for multisignature transaction: " + trs.id);
		}

		if (trs.asset.multisignature.min < 2 || trs.asset.multisignature.min > trs.asset.multisignature.dependence.length) {
			return cb("Min should be less dependence keys and more then 1");
		}

		if (trs.asset.multisignature.lifetime < 1 || trs.asset.multisignature.lifetime > 72) {
			return cb("lifetime should be less 72h keys and more then 1h");
		}

		if (trs.asset.multisignature.signatures.length < trs.asset.multisignature.min){
			return cb("Count signatures less min");
		}

		cb(null, trs);
	}

	this.getBytes = function (trs) {
		var dependenceBuffer = new Buffer(trs.asset.multisignature.dependence.join(''), 'utf8');

		var bb = new ByteBuffer(1 + 1 + dependenceBuffer.length, true);
		bb.writeByte(trs.asset.multisignature.min);
		bb.writeByte(trs.asset.multisignature.lifetime);
		for (var i = 0; i < dependenceBuffer.length; i++) {
			bb.writeByte(dependenceBuffer[i]);
		}
		bb.flip();

		return bb.toBuffer();
	}

	this.apply = function (trs, sender) {
		if (trs.asset.multisignature.signatures.length < trs.asset.multisignature.min) {
			return false
		}

		var recipient = modules.accounts.getAccountOrCreateByAddress(trs.recipientId);

		recipient.addToUnconfirmedBalance(trs.amount);
		recipient.addToBalance(trs.amount);

		return true;
	}

	this.undo = function (trs, sender) {
		if (trs.asset.multisignature.signatures.length < trs.asset.multisignature.min) {
			return false
		}

		var recipient = modules.accounts.getAccountOrCreateByAddress(trs.recipientId);

		recipient.addToUnconfirmedBalance(-trs.amount);
		recipient.addToBalance(-trs.amount);

		return true;
	}

	this.applyUnconfirmed = function (trs, sender) {
		return true;
	}

	this.undoUnconfirmed = function (trs, sender) {
		return true;
	}

	this.objectNormalize = function (trs) {
		trs.asset.multisignature = RequestSanitizer.validate(trs.asset.multisignature, {
			object: true,
			properties: {
				min: "int!",
				dependence: {
					required: true,
					array: true,
					minLength: 2,
					maxLength: 10
				},
				lifetime: "int!",
				signatures: {
					required: true,
					array: true,
					minLength: 2,
					maxLength: 10
				}
			}
		}).value;

		return trs;
	}

	this.dbRead = function (raw) {
		if (!raw.m_dependence) {
			return null
		} else {
			var multisignature = {
				min: raw.m_min,
				lifetime: raw.m_lifetime,
				dependence: raw.m_dependence.split(','),
				signatures: raw.m_signatures.split(',')
			}

			return {multisignature: multisignature};
		}
	}

	this.dbSave = function (dbLite, trs, cb) {
		dbLite.query("INSERT INTO multisignatures(min, lifetime, dependence, signatures, transactionId) VALUES($min, $lifetime, $dependence, $signatures, $transactionId)", {
			min: trs.asset.multisignature.min,
			lifetime: trs.asset.multisignature.lifetime,
			dependence: trs.asset.multisignature.dependence.join(','),
			signatures: trs.asset.multisignature.signatures.join(','),
			transactionId: trs.id
		}, cb);
	}

	this.ready = function (trs) {
		return trs.asset.multisignature.signatures.length >= trs.asset.multisignature.min;
	}
}

//constructor
function Multisignatures(cb, scope) {
	library = scope;
	self = this;
	self.__private = private;
	attachApi();

	library.logic.transaction.attachAssetType(TransactionTypes.MULTI, new Multisignature());

	setImmediate(cb, null, self);
}

//private methods
function attachApi() {
	var router = new Router();

	router.use(function (req, res, next) {
		if (modules) return next();
		res.status(500).send({success: false, error: 'loading'});
	});

	router.post('/sign/', function (req, res) {
		req.sanitize("body", {
			secret: "string!",
			publicKey: "hex!",
			transactionId: "string!"
		}, function (err, report, body) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			var transaction = modules.transactions.getUnconfirmedTransaction(body.transactionId);

			if (!transaction) {
				return res.json({success: false, error: "Transaction not found"});
			}

			var hash = crypto.createHash('sha256').update(body.secret, 'utf8').digest();
			var keypair = ed.MakeKeypair(hash);

			if (body.publicKey) {
				if (keypair.publicKey.toString('hex') != body.publicKey) {
					return res.json({success: false, error: "Please, provide valid secret key of your account"});
				}
			}

			if (transaction.asset.multisignature.dependence.indexOf(body.publicKey) == -1 || transaction.asset.multisignature.signatures.indexOf(body.publicKey) != -1) {
				return res.json({success: false, error: "You can't sign this transaction"});
			}

			var account = modules.accounts.getAccountByPublicKey(keypair.publicKey.toString('hex'));

			if (!account) {
				return res.json({success: false, error: "Account doesn't has balance"});
			}

			if (!account.publicKey) {
				return res.json({success: false, error: "Open account to make transaction"});
			}

			library.sequence.add(function (cb) {
				private.sign(keypair, transaction, cb);
			}, function (err) {
				if (err) {
					return res.json({success: false, error: err});
				}

				res.json({success: true, transactionId: transaction.id});
			});
		});
	});

	router.put('/', function (req, res) {
		req.sanitize("body", {
			secret: "string!",
			amount: "int!",
			recipientId: "string!",
			publicKey: "hex?",
			secondSecret: "string?",
			min: "int!",
			lifetime: "int!",
			dependence: {
				required: true,
				array: true,
				minLength: 2,
				maxLength: 10
			}
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
					return res.json({success: false, error: "Recipient is not found"});
				}
				recipientId = recipient.address;
			}

			var hash = crypto.createHash('sha256').update(body.secret, 'utf8').digest();
			var keypair = ed.MakeKeypair(hash);

			if (body.publicKey) {
				if (keypair.publicKey.toString('hex') != body.publicKey) {
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

			if (account.secondSignature && !body.secondSecret) {
				return res.json({success: false, error: "Provide second secret key"});
			}

			var secondKeypair = null;

			if (account.secondSignature) {
				var secondHash = crypto.createHash('sha256').update(body.secondSecret, 'utf8').digest();
				secondKeypair = ed.MakeKeypair(secondHash);
			}

			var transaction = library.logic.transaction.create({
				type: TransactionTypes.MULTI,
				amount: body.amount,
				sender: account,
				recipientId: recipientId,
				keypair: keypair,
				secondKeypair: secondKeypair,
				min: body.min,
				dependence: body.dependence,
				lifetime: body.lifetime
			});

			library.sequence.add(function (cb) {
				modules.transactions.addUnconfirmedTransaction(transaction, true, cb);
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

	library.network.app.use('/api/multisignatures', router);
	library.network.app.use(function (err, req, res, next) {
		if (!err) return next();
		library.logger.error(req.url, err.toString());
		res.status(500).send({success: false, error: err.toString()});
	});
}

private.sign = function (keypair, transaction, cb) {
	var sign = library.logic.transaction.sign(keypair, transaction);
	transaction.asset.multisignature.signatures.push(sign);
	cb();
}


//public methods

//events
Multisignatures.prototype.onBind = function (scope) {
	modules = scope;
}

//export
module.exports = Multisignatures;