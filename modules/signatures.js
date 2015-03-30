var ed = require('ed25519'),
	bignum = require('bignum'),
	ByteBuffer = require("bytebuffer"),
	crypto = require('crypto'),
	constants = require("../helpers/constants.js"),
	slots = require('../helpers/slots.js'),
	RequestSanitizer = require('../helpers/request-sanitizer.js'),
	Router = require('../helpers/router.js'),
	async = require('async'),
	TransactionTypes = require('../helpers/transaction-types.js');

// private fields
var modules, library, self;

function Signature() {
	this.create = function (data, trs) {
		trs.recipientId = null;
		trs.amount = 0;
		trs.asset.signature = {
			publicKey: data.secondKeypair.publicKey.toString('hex')
		};

		return trs;
	}

	this.calculateFee = function (trs) {
		return 100 * constants.fixedPoint;
	}

	this.verify = function (trs, sender, cb) {
		if (!trs.asset.signature) {
			return cb("Empty transaction asset for signature transaction")
		}

		if (trs.amount != 0) {
			return cb("Invalid amount");
		}

		try {
			if (new Buffer(trs.asset.signature.publicKey, 'hex').length != 32) {
				return cb("Invalid length for signature public key");
			}
		} catch (e) {
			return cb("Invalid hex in signature public key");
		}

		return cb(null, trs);
	}

	this.getBytes = function (trs) {
		try {
			var bb = new ByteBuffer(32, true);
			var publicKeyBuffer = new Buffer(trs.asset.signature.publicKey, 'hex');

			for (var i = 0; i < publicKeyBuffer.length; i++) {
				bb.writeByte(publicKeyBuffer[i]);
			}

			bb.flip();
		} catch (e) {
			throw Error(e.toString());
		}
		return bb.toBuffer();
	}

	this.objectNormalize = function (trs) {
		trs.asset.signature = RequestSanitizer.validate(trs.asset.signature, {
			object: true,
			properties: {
				publicKey: "hex!"
			}
		}).value;

		return trs;
	}

	this.dbRead = function (raw) {
		if (!raw.s_publicKey) {
			return null
		} else {
			var signature = {
				transactionId: raw.t_id,
				publicKey: raw.s_publicKey
			}

			return {signature: signature};
		}
	}
}

//constructor
function Signatures(cb, scope) {
	library = scope;
	self = this;

	attachApi();

	library.logic.transaction.attachAssetType(TransactionTypes.SIGNATURE, new Signature());

	setImmediate(cb, null, self);
}

//private methods
function attachApi() {
	var router = new Router();

	router.use(function (req, res, next) {
		if (modules) return next();
		res.status(500).send({success: false, error: 'loading'});
	});

	router.put('/', function (req, res) {
		req.sanitize("body", {
			secret: "string!",
			secondSecret: "string?",
			publicKey: "hex?"
		}, function (err, report, body) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			var secret = body.secret,
				secondSecret = body.secondSecret,
				publicKey = body.publicKey;

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

			if (account.secondSignature || account.unconfirmedSignature) {
				return res.json({success: false, error: "Second signature already enabled"});
			}

			var secondHash = crypto.createHash('sha256').update(secondSecret, 'utf8').digest();
			var secondKeypair = ed.MakeKeypair(secondHash);

			var transaction = library.logic.transaction.create({
				type: TransactionTypes.SIGNATURE,
				sender: account,
				keypair: keypair,
				secondKeypair: secondKeypair
			});

			library.sequence.add(function (cb) {
				modules.transactions.processUnconfirmedTransaction(transaction, true, cb);
			}, function (err) {
				if (err) {
					return res.json({success: false, error: err});
				}
				res.json({success: true, transaction: transaction});
			});
		});
	});

	router.use(function (req, res, next) {
		res.status(500).send({success: false, error: 'api not found'});
	});

	library.app.use('/api/signatures', router);
	library.app.use(function (err, req, res, next) {
		err && library.logger.error('/api/signatures', err)
		if (!err) return next();
		res.status(500).send({success: false, error: err.toString()});
	});
}

//public methods

//events
Signatures.prototype.onBind = function (scope) {
	modules = scope;
}

module.exports = Signatures;