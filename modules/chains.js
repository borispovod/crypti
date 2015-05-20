var ed = require('ed25519'),
	ByteBuffer = require("bytebuffer"),
	crypto = require('crypto'),
	constants = require("../helpers/constants.js"),
	slots = require('../helpers/slots.js'),
	RequestSanitizer = require('../helpers/request-sanitizer.js'),
	Router = require('../helpers/router.js'),
	async = require('async'),
	TransactionTypes = require('../helpers/transaction-types.js'),
	errorCode = require('../helpers/errorCodes.js').error;

// private fields
var modules, library, self, private = {};

function Chain() {
	this.create = function (data, trs) {
		trs.recipientId = null;
		trs.amount = 0;
		trs.asset.chain = {
			hash: data.hash,
			previousHashId: data.previousHashId
		};

		return trs;
	}

	this.calculateFee = function (trs) {
		return 1 * constants.fixedPoint;; // not discussed now
	}

	this.verify = function (trs, sender, cb) {
		if (!trs.asset.chain) {
			return setImmediate(cb, errorCode("CHAINS.INCORRECT_ASSET", trs));
		}

		if (trs.amount != 0) {
			return setImmediate(cb, errorCode("CHAINS.INCORRECT_AMOUNT", trs));
		}


		try {
			if (new Buffer(trs.asset.chain.hash, 'hex').length != 32) {
				return setImmediate(cb, errorCode("CHAINS.INCORRECT_CHAIN", trs));
			}
		} catch (e) {
			return setImmediate(cb, errorCode("CHAINS.INCORRECT_CHAIN", trs));
		}

		setImmediate(cb, null, trs);
	}

	this.process = function (dbLite, trs, sender, cb) {
		// check that sender is dapp
		if (!sender.isDAppAccount) {
			return setImmediate(cb, errorCode("CHAINS.SENDER_IS_NOT_DAPP", sender));
		}

		if (trs.asset.chain.previousHashId) {
			// search previous hash
			dbLite.query("select c.transactionId, t.senderPublicKey from chains where transactionId=$previousHashId as c left outer join trs as t on t.id=c.transactionId",
				{previousHashId: trs.asset.chain.previousHashId},['c_transactionId', 't_senderPublicKey'], function (err, rows) {
					if (err || rows.length == 0) {
						return setImmediate(cb, errorCode("CHAINS.INCORRECT_CHAIN_PREVIOUS_HASH", trs));
					} else {
						var senderPublicKey = rows[0]['t_senderPublicKey'];

						// check previous hash owner
						if (sender.publicKey != senderPublicKey) {
							return setImmediate(cb, errorCode("CHAINS.INCORRECT_ACCESS_TO_CHAIN", trs));
						}

						return setImmediate(cb, null, trs);
					}
				});
		} else {
			// search that it first hash
			dbLite.query("select count(id) from trs where senderId=$senderId and type=$type", {
				senderId: sender.address,
				type: TransactionTypes.CHAIN
			}, ['count'], function (err, rows) {
				if (err || rows.length == 0) {
				} else {
					var count = parseInt(rows[0]['count']);

					if (count > 0) {
						return setImmediate(cb, errorCode("CHAINS.INCORRECT_CHAIN_PREVIOUS_HASH", trs));
					} else {
						return setImmediate(cb, null, trs);
					}
				}
			});
		}
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
		return true;
	}

	this.undo = function (trs, sender) {
		return true;
	}

	this.applyUnconfirmed = function (trs, sender, cb) {
		return setImmediate(cb);
	}

	this.undoUnconfirmed = function (trs, sender) {
		return true;
	}

	this.objectNormalize = function (trs) {
		var report = RequestSanitizer.validate(trs.asset.chain, {
			object: true,
			properties: {
				hash: "hex!",
				previousHashId: "string"
			}
		});

		if (!report.isValid) {
			throw Error(report.issues);
		}

		trs.asset.chain = report.value;

		return trs;
	}

	this.dbRead = function (raw) {
		if (!raw.ch_hash) {
			return null
		} else {
			var chain = {
				transactionId: raw.t_id,
				hash: raw.ch_hash,
				previousHashId: raw.ch_previousHashId? raw.ch_previousHashId : null
			}

			return {chain: chain};
		}
	}

	this.dbSave = function (dbLite, trs, cb) {
		dbLite.query("INSERT INTO chains(transactionId, hash, previousHashId) VALUES($transactionId, $hash, $previousHashId)", {
			transactionId: trs.id,
			hash: new Buffer(trs.asset.chain.hash, 'hex'),
			previousHashId: trs.asset.chain.previousHashId? trs.asset.chain.previousHashId : null
		}, cb);
	}

	this.ready = function (trs) {
		if (sender.multisignatures) {
			return trs.signatures.length >= trs.asset.multisignature.min;
		} else {
			return true;
		}
	}
}

//constructor
function Chains(cb, scope) {
	library = scope;
	self = this;
	self.__private = private;
	attachApi();

	library.logic.transaction.attachAssetType(TransactionTypes.Chain, new Chain());

	setImmediate(cb, null, self);
}

//private methods
function attachApi() {
	var router = new Router();

	router.use(function (req, res, next) {
		if (modules) return next();
		res.status(500).send({success: false, error: errorCode('COMMON.LOADING')});
	});

	router.put('/', function (req, res) {
		return res.json({success: true});
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
Chains.prototype.onBind = function (scope) {
	modules = scope;
}

module.exports = Chains;