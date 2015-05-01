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

function Multisignature() {
	this.create = function (data, trs) {
		trs.recipientId = data.recipientId;
		trs.amount = data.amount;
		trs.asset.multisignature = {
			min: data.min,
			keysgroup: data.keysgroup,
			lifetime: data.lifetime
		};

		return trs;
	}

	this.calculateFee = function (trs) {
		return 1 * constants.fixedPoint;
	}

	this.verify = function (trs, sender, cb) {
		var isAddress = /^[0-9]+[C|c]$/g;
		if (!isAddress.test(trs.recipientId.toLowerCase())) {
			return setImmediate(cb, "Invalid recipientId: " + trs.id);
		}

		if (trs.amount <= 0) {
			return setImmediate(cb, "Invalid transaction amount: " + trs.id);
		}

		if (!util.isArray(trs.asset.multisignature.keysgroup)) {
			return setImmediate(cb, "Wrong transaction asset for multisignature transaction: " + trs.id);
		}

		if (!trs.asset.multisignature.min) {
			return setImmediate(cb, "Wrong transaction asset for multisignature transaction: " + trs.id);
		}

		if (!trs.asset.multisignature.lifetime) {
			return setImmediate(cb, "Wrong transaction asset for multisignature transaction: " + trs.id);
		}

		setImmediate(cb, null, trs);
	}

	this.process = function (dbLite, trs, sender, cb) {
		setImmediate(cb, null, trs);
	}

	this.getBytes = function (trs, skip) {
		var keysgroupBuffer = new Buffer(trs.asset.multisignature.keysgroup.join(''), 'utf8');

		var bb = new ByteBuffer(1 + 1 + keysgroupBuffer.length, true);
		bb.writeByte(trs.asset.multisignature.min);
		bb.writeByte(trs.asset.multisignature.lifetime);
		for (var i = 0; i < keysgroupBuffer.length; i++) {
			bb.writeByte(keysgroupBuffer[i]);
		}
		bb.flip();

		return bb.toBuffer();
	}

	this.apply = function (trs, sender) {
		sender.multisignature = trs.asset.multisignature;

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

	this.applyUnconfirmed = function (trs, sender, cb) {
		sender.unconfirmedMultisignature = trs.asset.multisignature.signatures;
		 setImmediate(cb);
	}

	this.undoUnconfirmed = function (trs, sender) {
		return true;
	}

	this.objectNormalize = function (trs) {
		var report = RequestSanitizer.validate(trs.asset.multisignature, {
			object: true,
			properties: {
				min: "int!",
				dependence: {
					required: true,
					array: true,
					minLength: 2,
					maxLength: 10
				},
				lifetime: "int!"
			}
		});

		if (!report.isValid) {
			throw Error(report.issues);
		}

		trs.asset.multisignature = report.value;

		return trs;
	}

	this.dbRead = function (raw) {
		if (!raw.m_dependence) {
			return null
		} else {
			var multisignature = {
				min: raw.m_min,
				lifetime: raw.m_lifetime,
				keysgroup: raw.m_keysgroup.split(',')
			}

			return {multisignature: multisignature};
		}
	}

	this.dbSave = function (dbLite, trs, cb) {
		dbLite.query("INSERT INTO multisignatures(min, lifetime, keysgroup, transactionId) VALUES($min, $lifetime, $keysgroup, $transactionId)", {
			min: trs.asset.multisignature.min,
			lifetime: trs.asset.multisignature.lifetime,
			keysgroup: trs.asset.multisignature.keysgroup.join(','),
			transactionId: trs.id
		}, cb);
	}

	this.ready = function (trs) {
		return true;
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
		res.status(500).send({success: false, error: errorCode('COMMON.LOADING')});
	});

	router.post('/sign/', function (req, res) {
		req.sanitize("body", {
			secret: "string!",
			publicKey: "hex?",
			transactionId: "string!"
		}, function (err, report, body) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			var transaction = modules.transactions.getUnconfirmedTransaction(body.transactionId);

			if (!transaction) {
				return res.json({success: false, error: errorCode("TRANSACTIONS.TRANSACTION_NOT_FOUND")});
			}

			var hash = crypto.createHash('sha256').update(body.secret, 'utf8').digest();
			var keypair = ed.MakeKeypair(hash);

			if (body.publicKey) {
				if (keypair.publicKey.toString('hex') != body.publicKey) {
					return res.json({success: false, error: errorCode("COMMON.INVALID_SECRET_KEY")});
				}
			}

			var sign = library.logic.transaction.sign(keypair, transaction);
			if (transaction.type != TransactionTypes.MULTI || transaction.asset.multisignature.dependence.indexOf(keypair.publicKey.toString('hex')) == -1 || transaction.asset.multisignature.signatures.indexOf(sign) != -1) {
				return res.json({success: false, error: errorCode("MULTISIGNATURES.SIGN_NOT_ALLOWED", transaction)});
			}

			var account = modules.accounts.getAccountByPublicKey(keypair.publicKey.toString('hex'));

			if (!account || !account.publicKey) {
				return res.json({success: false, error: errorCode("COMMON.OPEN_ACCOUNT")});
			}

			library.sequence.add(function (cb) {
				var transaction = modules.transactions.getUnconfirmedTransaction(body.transactionId);
				if (!transaction) {
					return cb("Transaction not found");
				}
				transaction.asset.multisignature.signatures.push(sign);
				cb();
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
			keysgroup: {
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

			if (body.dependence.indexOf(keypair.publicKey.toString('hex')) != -1){
				return res.json({success: false, error: errorCode("MULTISIGNATURES.SELF_SIGN")});
			}

			var dependence = body.dependence.reduce(function (p, c) {
				if (p.indexOf(c) < 0) p.push(c);
				return p;
			}, []);

			if (dependence.length != body.dependence.length) {
				return res.json({success: false, error: errorCode("MULTISIGNATURES.NOT_UNIQUE_SET")});
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
				type: TransactionTypes.MULTI,
				sender: account,
				keypair: keypair,
				secondKeypair: secondKeypair,
				min: body.min,
				keysgroup: body.keysgroup,
				lifetime: body.lifetime
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
		res.status(500).send({success: false, error: errorCode('COMMON.INVALID_API')});
	});

	library.network.app.use('/api/multisignatures', router);
	library.network.app.use(function (err, req, res, next) {
		if (!err) return next();
		library.logger.error(req.url, err.toString());
		res.status(500).send({success: false, error: err.toString()});
	});
}

//public methods

//events
Multisignatures.prototype.onBind = function (scope) {
	modules = scope;
}

//export
module.exports = Multisignatures;