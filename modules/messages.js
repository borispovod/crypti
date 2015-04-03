var encryptHelper = require('../helpers/encrypt.js'),
	TransactionTypes = require('../helpers/transaction-types.js'),
	RequestSanitizer = require('../helpers/request-sanitizer.js'),
	Router = require('../helpers/router.js');

var modules, library, self;

function Message() {
	this.create = function (data, trs) {
		trs.recipientId = data.recipientId;
		trs.amount = 0;

		if (data.encrypt) {
			var nonce = encryptHelper.getNonce();
			var message = new Buffer(encryptHelper.encrypt(new Buffer(data.message, 'utf8'), nonce, new Buffer(data.sender.publicKey, 'hex'), new Buffer(data.recipientPublicKey, 'hex'))).toString('hex');
		} else {
			var message = new Buffer(data.message, 'utf8').toString('hex');
		}

		trs.asset.message = {
			data: message,
			nonce: nonce ? nonce.toString('hex') : null,
			encrypted: data.encrypt
		};

		return trs;
	}

	this.calculateFee = function (trs) {
		return 1 * constants.fixedPoint;
	}

	this.verify = function (trs, sender, cb) {
		if (!trs.asset.message) {
			return cb("Invalid asset");
		}

		if (!trs.asset.message.data) {
			return cb("Invalid message");
		}

		if (trs.amount != 0) {
			return cb("Invalid amount");
		}

		try {
			var messageData = new Buffer(trs.asset.message.data, 'hex');
			if (messageData.length > 140 || messageData.length == 0) {
				return cb("Invalid message length");
			}
		} catch (e) {
			return cb("Invalid hex in message asset");
		}

		if (!trs.asset.message.nonce) {
			return cb("Invalid nonce");
		}

		if (!trs.asset.message.nonce && trs.asset.message.encrypted) {
			return cb("Can't encrypt with nonce");
		}

		if (trs.asset.message.nonce) {
			try {
				if (new Buffer(trs.asset.message.nonce, 'hex').length != 24) {
					return cb("Invalid nonce length");
				}
			} catch (e) {
				return cb("Invalid nonce param in message asset");
			}
		}

		if (trs.asset.message.encrypted !== false && trs.asset.message.encrypted !== true) {
			return cb("Invalid encrypted param in message asset");
		}

		return cb(null, trs);
	}

	this.getBytes = function (trs) {
		try {
			var data = new Buffer(trs.asset.message.data, 'hex');
			var nonce = new Buffer(trs.asset.message.nonce, 'hex');

			var bb = new ByteBuffer(data.length + nonce.length + 1, true);

			for (var i = 0; i < data.length; i++) {
				bb.writeByte(data[i]);
			}

			for (var i = 0; i < nonce.length; i++) {
				bb.writeByte(nonce[i]);
			}

			bb.writeByte(trs.asset.message.encrypted);

			bb.flip();
		} catch (e) {
			throw Error(e.toString());
		}

		return bb.toBuffer()
	}

	this.apply = function (trs, sender) {
		return true;
	}

	this.undo = function (trs, sender) {
		return true;
	}

	this.applyUnconfirmed = function (trs, sender) {
		return true;
	}

	this.undoUnconfirmed = function (trs, sender) {
		return true;
	}

	this.objectNormalize = function (trs) {
		trs.asset.message = RequestSanitizer.validate(trs.asset.message, {
			object: true,
			properties: {
				data: "hex!",
				nonce: "hex!",
				encrypted: "boolean!"
			}
		}).value;

		return trs;
	}

	this.dbRead = function (raw) {
		if (!raw.m_data) {
			return null;
		} else {
			var message = {
				transactionId: raw.t_id,
				data: raw.m_data,
				nonce: raw.m_nonce,
				encrypted: raw.m_encrypted
			}

			return {message: message};
		}
	}

	this.dbSave = function (dbLite, trs, cb) {
		dbLite.query("INSERT INTO messages(data, nonce, encrypted, transactionId) VALUES($data, $nonce, $encrypted, $transactionId)", {
			data: new Buffer(trs.asset.message.data, 'hex'),
			nonce: new Buffer(trs.asset.message.nonce, 'hex'),
			encrypted: trs.asset.message.encrypted ? 1 : 0,
			transactionId: trs.id
		}, cb);
	}
}

function attachApi() {
	var router = new Router();

	router.use(function (req, res, next) {
		if (modules) return next();
		res.status(500).send({success: false, error: 'loading'});
	});

	router.post("/decrypt", function (req, res) {
		req.sanitize("body", {
			secret: "string!",
			messageId: "string!"
		}, function (err, report, body) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			var secret = body.secret;
			var hash = crypto.createHash('sha256').update(secret, 'utf8').digest();
			var keypair = ed.MakeKeypair(hash);

			library.dbLite.query("SELECT lower(hex(data)), lower(hex(nonce)), encrypted FROM messa", function (err, rows) {
				if (err || rows.length == 0) {
					return res.json({success: false, error: err ? "Internal error" : "Can't find message"});
				}

				var message = rows[0];

				try {
					var text = encryptHelper.decrypt(new Buffer(message.data, 'hex'), new Buffer(message.nonce, 'hex'), new Buffer(message.senderPublicKey, 'hex'), keypair.privateKey);
				} catch (e) {
					return res.json({success: false, error: "Can't decrypt message"});
				}

				return res.json({success: false, message: text});
			});
		});
	});

	router.put('/', function (req, res) {
		req.sanitize("body", {
			secret: "string!",
			secondSecret: "string?",
			recipientId: "string?",
			encrypt: "boolean!",
			recipientPublicKey: "hex?",
			message: "string!",
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

			if (account.secondSignature && !secondSecret) {
				return res.json({success: false, error: "Provide second secret key"});
			}


			if (body.encrypt) {
				if (!body.recipientPublicKey) {
					return res.json({success: false, error: "Provide recipient public key to open encrypt message"});
				} else {
					try {
						if (new Buffer(body.recipientPublicKey, 'hex').length != 32) {
							return res.json({success: false, error: "Invalid recipient public key length"});
						}
					} catch (e) {
						return res.json({success: false, error: "Can't parse recipient public key, incorrect format!"});
					}
				}
			}

			if (body.message.length == 0 || body.message.length > 140) {
				return res.json({
					success: false,
					error: "Incorrect message length, message length from 0 to 140 characters"
				});
			}

			if (account.secondSignature && secondSecret) {
				var secondHash = crypto.createHash('sha256').update(secondSecret, 'utf8').digest();
				var secondKeypair = ed.MakeKeypair(secondHash);
			}

			var transaction = library.logic.transaction.create({
				type: TransactionTypes.MESSAGE,
				sender: account,
				keypair: keypair,
				secondKeypair: secondKeypair,
				recipientPublicKey: body.recipientPublicKey,
				encrypt: body.encrypt,
				message: body.message
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

	router.use(function (req, res) {
		res.status(500).send({success: false, error: 'api not found'});
	});

	library.app.use('/api/messages', router);
	library.app.use(function (err, req, res, next) {
		err && library.logger.error('/api/messages', err)
		if (!err) return next();
		res.status(500).send({success: false, error: err.toString()});
	});
}

function Messages(cb, scope) {
	library = scope;
	self = this;

	attachApi();

	library.logic.transaction.attachAssetType(TransactionTypes.MESSAGE, new Message());

	setImmediate(cb, null, self);
}


Messages.prototype.onBind = function (scope) {
	modules = scope;
}

//export
module.exports = Messages;