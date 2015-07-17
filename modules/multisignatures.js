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
	Diff = require('../helpers/diff.js'),
	errorCode = require('../helpers/errorCodes.js').error,
	sandboxHelper = require('../helpers/sandbox.js');

// private fields
var modules, library, self, private = {}, shared = {};

function Multisignature() {
	this.create = function (data, trs) {
		trs.recipientId = null;
		trs.amount = 0;
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
		if (!trs.asset.multisignature) {
			return setImmediate(cb, "Invalid asset: " + trs.id);
		}

		if (!util.isArray(trs.asset.multisignature.keysgroup)) {
			return setImmediate(cb, "Wrong transaction asset for multisignature transaction: " + trs.id);
		}

		if (!trs.asset.multisignature.min < 1 || trs.asset.multisignature.min > 10) {
			return setImmediate(cb, "Wrong transaction asset for multisignature transaction: " + trs.id);
		}

		if (trs.asset.multisignature.lifetime < 1 || trs.asset.multisignature.lifetime > 72) {
			return setImmediate(cb, "Wrong transaction asset for multisignature transaction: " + trs.id);
		}

		try {
			for (var s = 0; s < trs.asset.multisignature.keysgroup.length; s++) {
				var verify = false;
				if (trs.signatures) {
					for (var d = 0; d < trs.signatures.length && !verify; d++) {
						if (library.logic.transaction.verifySignature(trs, sender.multisignatures[s], trs.signatures[d])) {
							verify = true;
						}
					}
				}
				if (!verify) {
					return setImmediate(cb, "Failed multisignature: " + trs.id);
				}
			}
		} catch (e) {
			return setImmediate(cb, "Failed multisignature: " + trs.id);
		}

		if (trs.asset.multisignature.keysgroup.indexOf(sender.publicKey) != -1) {
			return setImmediate(cb, errorCode("MULTISIGNATURES.SELF_SIGN"));
		}

		var keysgroup = trs.asset.multisignature.keysgroup.reduce(function (p, c) {
			if (p.indexOf(c) < 0) p.push(c);
			return p;
		}, []);

		if (keysgroup.length != trs.asset.multisignature.keysgroup.length) {
			return setImmediate(cb, errorCode("MULTISIGNATURES.NOT_UNIQUE_SET"));
		}

		setImmediate(cb, null, trs);
	}

	this.process = function (trs, sender, cb) {
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

	this.apply = function (trs, sender, cb) {
		this.scope.account.merge(sender.address, {
			multisignatures: trs.asset.multisignature.keysgroup,
			multimin: trs.asset.multisignature.min,
			multilifetime: trs.asset.multisignature.lifetime
		}, cb);
	}

	this.undo = function (trs, sender, cb) {
		var multiInvert = Diff.reverse(trs.asset.multisignature.keysgroup);

		this.scope.account.merge(sender.address, {
			multisignatures: multiInvert,
			multimin: -trs.asset.multisignature.min,
			multilifetime: -trs.asset.multisignature.lifetime
		}, cb);
	}

	this.applyUnconfirmed = function (trs, sender, cb) {
		this.scope.account.merge(sender.address, {
			u_multisignatures: trs.asset.multisignature.keysgroup,
			u_multimin: trs.asset.multisignature.min,
			u_multilifetime: trs.asset.multisignature.lifetime
		}, cb);
	}

	this.undoUnconfirmed = function (trs, sender, cb) {
		var multiInvert = Diff.reverse(trs.asset.multisignature.keysgroup);

		this.scope.account.merge(sender.address, {
			u_multisignatures: multiInvert,
			u_multimin: -trs.asset.multisignature.min,
			u_multilifetime: -trs.asset.multisignature.lifetime
		}, cb);
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

	this.dbSave = function (trs, cb) {
		library.dbLite.query("INSERT INTO multisignatures(min, lifetime, keysgroup, transactionId) VALUES($min, $lifetime, $keysgroup, $transactionId)", {
			min: trs.asset.multisignature.min,
			lifetime: trs.asset.multisignature.lifetime,
			keysgroup: trs.asset.multisignature.keysgroup.join(','),
			transactionId: trs.id
		}, cb);
	}

	this.ready = function (trs, sender) {
		if (!trs.signatures) {
			return false;
		}
		if (!sender.multisignatures.length) {
			return trs.signatures.length == trs.asset.multisignature.keysgroup.length;
		} else {
			return trs.signatures.length >= sender.multimin;
		}
	}
}

//constructor
function Multisignatures(cb, scope) {
	library = scope;
	self = this;
	self.__private = private;
	private.attachApi();

	library.logic.transaction.attachAssetType(TransactionTypes.MULTI, new Multisignature());

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
		"get /pending": "pending",
		"post /sign": "sign",
		"put /": "addMultisignature"
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
Multisignatures.prototype.sandboxApi = function (call, args, cb) {
	sandboxHelper.callMethod(shared, call, args, cb);
}

//events
Multisignatures.prototype.onBind = function (scope) {
	modules = scope;
}

//shared
shared.pending = function (req, cb) {
	var query = req.body;
	library.scheme.validate(query, {
		publicKey: "hex!"
	}, function (err) {
		if (err) {
			return cb(err[0].message);
		}

		var transactions = modules.transactions.getUnconfirmedTransactionList();

		var pendings = [];
		async.forEach(transactions, function (item, cb) {
			if (item.type != TransactionTypes.MULTI) {
				return setImmediate(cb);
			}

			var signature = item.signatures.find(function (signature) {
				return signature.publicKey == query.publicKey;
			});

			if (signature) {
				return setImmediate(cb);
			}

			if (item.multisignature.keysgroup.indexOf("+" + publicKey) >= 0) {
				pendings.push(item);
			}

			setImmediate(cb);
		}, function () {
			return cb(null, {transactions: pendings});
		});
	});
}

shared.sign = function (req, cb) {
	var body = req.body;
	library.scheme.validate(body, {
		secret: "string!",
		publicKey: "hex?",
		transactionId: "string!"
	}, function (err) {
		if (err) {
			return cb(err[0].message);
		}

		var transaction = modules.transactions.getUnconfirmedTransaction(body.transactionId);

		if (!transaction) {
			return cb(errorCode("TRANSACTIONS.TRANSACTION_NOT_FOUND"));
		}

		var hash = crypto.createHash('sha256').update(body.secret, 'utf8').digest();
		var keypair = ed.MakeKeypair(hash);

		if (body.publicKey) {
			if (keypair.publicKey.toString('hex') != body.publicKey) {
				return cb(errorCode("COMMON.INVALID_SECRET_KEY"));
			}
		}

		var sign = library.logic.transaction.sign(keypair, transaction);
		if (transaction.type != TransactionTypes.MULTI || transaction.asset.multisignature.dependence.indexOf(keypair.publicKey.toString('hex')) == -1 || transaction.asset.multisignature.signatures.indexOf(sign) != -1) {
			return cb(errorCode("MULTISIGNATURES.SIGN_NOT_ALLOWED", transaction));
		}

		modules.accounts.getAccount({publicKey: keypair.publicKey.toString('hex')}, function (err, account) {
			if (err) {
				return cb(err.toString());
			}
			if (!account || !account.publicKey) {
				return cb(errorCode("COMMON.OPEN_ACCOUNT"));
			}

			library.sequence.add(function (cb) {
				var transaction = modules.transactions.getUnconfirmedTransaction(body.transactionId);
				if (!transaction) {
					return cb("Transaction not found");
				}
				transaction.signatures = transaction.signatures || [];
				transaction.signatures.push(sign);
				cb();
			}, function (err) {
				if (err) {
					return cb(err.toString());
				}

				cb(null, {transactionId: transaction.id});
			});
		});
	});
}

shared.addMultisignature = function (req, cb) {
	var body = req.body;
	library.scheme.validate(body, {
		secret: "string!",
		publicKey: "hex?",
		secondSecret: "string?",
		min: "int!",
		lifetime: "int!",
		keysgroup: {
			required: true,
			array: true,
			minLength: 1,
			maxLength: 10
		}
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

				if (account.secondSignature && !body.secondSecret) {
					return cb(errorCode("COMMON.SECOND_SECRET_KEY"));
				}

				var secondKeypair = null;

				if (account.secondSignature) {
					var secondHash = crypto.createHash('sha256').update(body.secondSecret, 'utf8').digest();
					secondKeypair = ed.MakeKeypair(secondHash);
				}

				try {
					var transaction = library.logic.transaction.create({
						type: TransactionTypes.MULTI,
						sender: account,
						keypair: keypair,
						secondKeypair: secondKeypair,
						min: body.min,
						keysgroup: body.keysgroup,
						lifetime: body.lifetime
					});
				} catch (e) {
					return cb(e.toString());
				}

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


//export
module.exports = Multisignatures;