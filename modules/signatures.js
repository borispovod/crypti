var ed = require('ed25519'),
	ByteBuffer = require("bytebuffer"),
	crypto = require('crypto'),
	constants = require("../helpers/constants.js"),
	slots = require('../helpers/slots.js'),
	Router = require('../helpers/router.js'),
	async = require('async'),
	TransactionTypes = require('../helpers/transaction-types.js'),
	MilestoneBlocks = require("../helpers/milestoneBlocks.js"),
	errorCode = require('../helpers/errorCodes.js').error,
	sandboxHelper = require('../helpers/sandbox.js');

// private fields
var modules, library, self, private = {}, shared = {};

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
			return 5 * constants.fixedPoint;
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

	this.process = function (trs, sender, cb) {
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

	this.apply = function (trs, sender, cb) {
		modules.accounts.setAccountAndGet({
			address: sender.address,
			secondSignature: 1,
			u_secondSignature: 0,
			secondPublicKey: trs.asset.signature.publicKey
		}, cb);
	}

	this.undo = function (trs, sender, cb) {
		modules.accounts.setAccountAndGet({
			address: sender.address,
			secondSignature: 0,
			u_secondSignature: 1,
			secondPublicKey: null
		}, cb);
	}

	this.applyUnconfirmed = function (trs, sender, cb) {
		if (sender.unconfirmedSignature || sender.secondSignature) {
			return setImmediate(cb, "Failed secondSignature: " + trs.id);
		}

		modules.accounts.setAccountAndGet({address: sender.address, u_secondSignature: 1}, cb);
	}

	this.undoUnconfirmed = function (trs, sender, cb) {
		modules.accounts.setAccountAndGet({address: sender.address, u_secondSignature: 0}, cb);
	}

	this.objectNormalize = function (trs) {
		var report = library.scheme.validate(trs.asset.signature, {
			object: true,
			properties: {
				publicKey: {
					type: 'string',
					format: 'publicKey'
				}
			},
			required: ['publicKey']
		});

		if (!report) {
			throw Error("Can't parse signature: " + library.scheme.getLastError());
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

	this.dbSave = function (trs, cb) {
		try {
			var publicKey = new Buffer(trs.asset.signature.publicKey, 'hex')
		} catch (e) {
			return cb(e.toString())
		}

		library.dbLite.query("INSERT INTO signatures(transactionId, publicKey) VALUES($transactionId, $publicKey)", {
			transactionId: trs.id,
			publicKey: publicKey
		}, cb);
	}

	this.ready = function (trs, sender) {
		if (sender.multisignatures.length) {
			if (!trs.signatures) {
				return false;
			}
			return trs.signatures.length >= sender.multimin;
		} else {
			return true;
		}
	}
}

//constructor
function Signatures(cb, scope) {
	library = scope;
	self = this;
	self.__private = private;
	private.attachApi();

	library.logic.transaction.attachAssetType(TransactionTypes.SIGNATURE, new Signature());

	setImmediate(cb, null, self);
}

//private methods
private.attachApi = function () {
	var router = new Router();

	router.use(function (req, res, next) {
		if (modules) return next();
		res.status(500).send({success: false, error: errorCode('COMMON.LOADING')});
	});


	router.map(shared, {
		"get /fee": "getFee",
		"put /": "addSignature"
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
Signatures.prototype.sandboxApi = function (call, data, cb) {
	sandboxHelper.callMethod(shared, call, args, cb);
}

//events
Signatures.prototype.onBind = function (scope) {
	modules = scope;
}

//shared
shared.getFee = function (query, cb) {
	var fee = null;

	if (modules.blocks.getLastBlock().height >= MilestoneBlocks.FEE_BLOCK) {
		fee = 5 * constants.fixedPoint;
	} else {
		fee = 5 * constants.fixedPoint;
	}

	cb(null, {fee: fee})
}

shared.addSignature = function (body, cb) {
	library.scheme.validate(body, {
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
	}, function (err) {
		if (err) {
			return cb(err[0].message);
		}

		var hash = crypto.createHash('sha256').update(body.secret, 'utf8').digest();
		var keypair = ed.MakeKeypair(hash);

		if (body.publicKey) {
			if (keypair.publicKey.toString('hex') != body.publicKey) {
				return cb(errorCode("COMMON.INVALID_SECRET_KEY"));
			}
		}

		library.sequence.add(function (cb) {
			modules.accounts.getAccount({publicKey: keypair.publicKey.toString('hex')}, function (err, account) {
				if (err) {
					return cb(err.toString());
				}
				if (!account || !account.publicKey) {
					return cb(errorCode("COMMON.OPEN_ACCOUNT"));
				}

				if (account.secondSignature || account.unconfirmedSignature) {
					return cb(errorCode("COMMON.SECOND_SECRET_KEY"));
				}

				var secondHash = crypto.createHash('sha256').update(body.secondSecret, 'utf8').digest();
				var secondKeypair = ed.MakeKeypair(secondHash);

				var transaction = library.logic.transaction.create({
					type: TransactionTypes.SIGNATURE,
					sender: account,
					keypair: keypair,
					secondKeypair: secondKeypair
				});
				modules.transactions.receiveTransactions([transaction], cb);
			});
		}, function (err, transaction) {
			if (err) {
				return cb(err.toString());
			}
			cb(null, {transaction: transaction[0]});
		});

	});
}

module.exports = Signatures;