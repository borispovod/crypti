var ed = require('ed25519'),
	ByteBuffer = require("bytebuffer"),
	crypto = require('crypto'),
	constants = require("../helpers/constants.js"),
	slots = require('../helpers/slots.js'),
	Router = require('../helpers/router.js'),
	async = require('async'),
	TransactionTypes = require('../helpers/transaction-types.js'),
	MilestoneBlocks = require("../helpers/milestoneBlocks.js"),
	errorCode = require('../helpers/errorCodes.js').error;

// private fields
var modules, library, self, private = {};

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
		if (modules.blocks.getLastBlock().height >= MilestoneBlocks.FEE_BLOCK) {
			return 5 * constants.fixedPoint;
		} else {
			return 100 * constants.fixedPoint;
		}
	}

	this.verify = function (trs, sender, cb) {
		if (!trs.asset.signature) {
			return setImmediate(cb, errorCode("SIGNATURES.INVALID_ASSET", trs))
		}

		if (trs.amount != 0) {
			return setImmediate(cb, errorCode("SIGNATURES.INVALID_AMOUNT", trs));
		}

		try {
			if (!trs.asset.signature.publicKey || new Buffer(trs.asset.signature.publicKey, 'hex').length != 32) {
				return setImmediate(cb, errorCode("SIGNATURES.INVALID_LENGTH", trs));
			}
		} catch (e) {
			return setImmediate(cb, errorCode("SIGNATURES.INVALID_HEX", trs));
		}

		setImmediate(cb, null, trs);
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

	this.apply = function (trs, sender) {
		sender.unconfirmedSignature = false;
		sender.secondSignature = true;
		sender.secondPublicKey = trs.asset.signature.publicKey;

		return true;
	}

	this.undo = function (trs, sender) {
		sender.secondSignature = false;
		sender.unconfirmedSignature = true;
		sender.secondPublicKey = null;

		return true;
	}

	this.applyUnconfirmed = function (trs, sender, cb) {
		if (sender.unconfirmedSignature || sender.secondSignature) {
			return setImmediate(cb, "Failed secondSignature: " + trs.id);
		}

		sender.unconfirmedSignature = true;

		setImmediate(cb);
	}

	this.undoUnconfirmed = function (trs, sender) {
		sender.unconfirmedSignature = false;

		return true;
	}

	this.objectNormalize = function (trs) {
		var report = library.scheme.validate(trs.asset.signature, {
			type: "object",
			properties: {
				publicKey: {
					type: 'string',
					format: 'publicKey'
				}
			},
			required: ['publicKey']
		});

		if (!report) {
			throw Error("Can't parse signature");
		}

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

	this.dbSave = function (dbLite, trs, cb) {
		try {
			var publicKey = new Buffer(trs.asset.signature.publicKey, 'hex')
		} catch (e) {
			return cb(e.toString())
		}

		dbLite.query("INSERT INTO signatures(transactionId, publicKey) VALUES($transactionId, $publicKey)", {
			transactionId: trs.id,
			publicKey: publicKey
		}, cb);
	}

	this.ready = function (trs) {
		return true;
	}
}

//constructor
function Signatures(cb, scope) {
	library = scope;
	self = this;
	self.__private = private;
	attachApi();

	library.logic.transaction.attachAssetType(TransactionTypes.SIGNATURE, new Signature());

	setImmediate(cb, null, self);
}

//private methods
function attachApi() {
	var router = new Router();

	router.use(function (req, res, next) {
		if (modules) return next();
		res.status(500).send({success: false, error: errorCode('COMMON.LOADING')});
	});

	router.get('/fee', function (req, res, next) {
		var fee = null;

		if (modules.blocks.getLastBlock().height >= MilestoneBlocks.FEE_BLOCK) {
			fee = 5 * constants.fixedPoint;
		} else {
			fee = 100 * constants.fixedPoint;
		}

		return res.json({success: true, fee: fee})
	});

	router.put('/', function (req, res, next) {
		req.sanitize(req.body, {
			type: "object",
			properties: {
				secret: {
					type: "string",
					minLength: 1
				},
				secondSecret: {
					type: "string",
					minLength: 1
				},
				publicKey: {
					type: "string",
					format: "publicKey"
				}
			},
			required: ["secret", "secondSecret"]
		}, function (err, report, body) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

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

			if (account.secondSignature || account.unconfirmedSignature) {
				return res.json({success: false, error: errorCode("COMMON.SECOND_SECRET_KEY")});
			}

			var secondHash = crypto.createHash('sha256').update(body.secondSecret, 'utf8').digest();
			var secondKeypair = ed.MakeKeypair(secondHash);

			var transaction = library.logic.transaction.create({
				type: TransactionTypes.SIGNATURE,
				sender: account,
				keypair: keypair,
				secondKeypair: secondKeypair
			});

			library.sequence.add(function (cb) {
				modules.transactions.receiveTransactions([transaction], cb);
			}, function (err) {
				if (err) {
					return res.json({success: false, error: err});
				}
				res.json({success: true, transaction: transaction});
			});
		});
	});

	router.use(function (req, res, next) {
		res.status(500).send({success: false, error: errorCode('COMMON.INVALID_API')});
	});

	library.network.app.use('/api/signatures', router);
	library.network.app.use(function (err, req, res, next) {
		if (!err) return next();
		library.logger.error(req.url, err.toString());
		res.status(500).send({success: false, error: err.toString()});
	});
}

//public methods

//events
Signatures.prototype.onBind = function (scope) {
	modules = scope;
}

module.exports = Signatures;