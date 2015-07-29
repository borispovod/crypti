var encryptHelper = require('../helpers/encrypt.js'),
	TransactionTypes = require('../helpers/transaction-types.js'),
	Router = require('../helpers/router.js'),
	constants = require('../helpers/constants.js'),
	ed = require('ed25519'),
	ByteBuffer = require("bytebuffer"),
	crypto = require('crypto'),
	errorCode = require('../helpers/errorCodes.js').error;

var modules, library, self, private = {};

function Contact() {
	this.create = function (data, trs) {
		trs.recipientId = null;
		trs.amount = 0;

		trs.asset.contact = {
			address: data.contactAddress
		}

		return trs;
	}

	this.calculateFee = function (trs) {
		return 1 * constants.fixedPoint;
	}

	this.verify = function (trs, sender, cb) {
		if (!trs.asset.contact) {
			return setImmediate(cb, "Invalid asset: " + trs.id);
		}

		if (!trs.asset.contact.address) {
			return setImmediate(cb, "Empty following: " + trs.id);
		}

		var isAddress = /^[\+|\-][0-9]+[C|c]$/g;
		if (!isAddress.test(trs.asset.contact.address.toLowerCase())) {
			return setImmediate(cb, "Following is not address: " + trs.asset.contact.address);
		}

		/*
		if (!modules.accounts.getAccount(trs.asset.contact.address.slice(1))) {
			return setImmediate(cb, "Following is not exists: " + trs.id);
		}
		*/

		if (trs.amount != 0) {
			return setImmediate(cb, "Invalid amount: " + trs.id);
		}

		if (trs.recipientId) {
			return setImmediate(cb, "Invalid recipientId: " + trs.id);
		}

		setImmediate(cb, null, trs);
	}

	this.getBytes = function (trs) {
		try {
			var contactAddress = new Buffer(trs.asset.contact.address, 'utf8');

			var bb = new ByteBuffer(contactAddress.length, true);
			for (var i = 0; i < contactAddress.length; i++) {
				bb.writeByte(contactAddress[i]);
			}

			bb.flip();
		} catch (e) {
			throw Error(e.toString());
		}

		return bb.toBuffer()
	}

	this.apply = function (trs, sender) {
		return sender.applyContact(trs.asset.contact.address);
	}

	this.undo = function (trs, sender) {
		return sender.undoContact(trs.asset.contact.address);
	}

	this.applyUnconfirmed = function (trs, sender, cb) {
		library.dbLite.query("SELECT count(id) FROM trs where recipientId=$address", {
			address: trs.asset.contact.address.slice(1)
		}, ['count'], function (err, rows) {
			if (err) {
				return setImmediate(cb, "Sql error");
			}

			if (rows.length == 0 || rows[0].count == 0) {
				var account = modules.accounts.getAccount(trs.asset.contact.address.slice(1));

				if (!account || !account.publicKey) {
					return setImmediate(cb, "Can't apply contact, recipient doesn't exists");
				} else {
					if (!modules.round.accountIsDelegate(account.publicKey)) {
						return setImmediate(cb, "Can't apply contact, recipient doesn't exists");
					}
				}
			}

			var res = sender.applyUnconfirmedContact(trs.asset.contact.address);
			setImmediate(cb, !res ? "Can't apply contact: " + trs.id : null);
		});
	}

	this.undoUnconfirmed = function (trs, sender) {
		return sender.undoUnconfirmedContact(trs.asset.contact.address);
	}

	this.objectNormalize = function (trs) {
		var report = library.scheme.validate(trs.asset.contact, {
			type: "object",
			properties: {
				address: {
					type: "string",
					minLength: 1
				}
			},
			required: ["address"]
		});

		if (!report) {
			throw Error("Incorrect address in contact transaction");
		}

		return trs;
	}

	this.dbRead = function (raw) {
		if (!raw.c_address) {
			return null;
		} else {
			var contact = {
				transactionId: raw.t_id,
				address: raw.c_address
			}

			return {contact: contact};
		}
	}

	this.dbSave = function (dbLite, trs, cb) {
		dbLite.query("INSERT INTO contacts(address, transactionId) VALUES($address, $transactionId)", {
			address: trs.asset.contact.address,
			transactionId: trs.id
		}, cb);
	}

	this.ready = function (trs) {
		return true;
	}
}

function attachApi() {
	var router = new Router();

	router.use(function (req, res, next) {
		if (modules) return next();
		res.status(500).send({success: false, error: errorCode('COMMON.LOADING')});
	});

	router.get('/fee', function (req, res) {
		return res.json({success: true, fee: 1 * constants.fixedPoint})
	});

	router.get("/", function (req, res, next) {
		req.sanitize(req.query, {
			type: "object",
			properties: {
				publicKey: {
					type: "string",
					format: "publicKey"
				}
			},
			required: ["publicKey"]
		}, function (err, report, query) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			var account = modules.accounts.getAccountByPublicKey(query.publicKey);

			if (!account) {
				return res.json({success: false, error: errorCode("ACCOUNTS.ACCOUNT_DOESNT_FOUND")});
			}

			var following = [];
			var followers = [];
			if (account.following && account.following.length) {
				following = account.following.map(function (item) {
					var account = modules.accounts.getAccount(item);
					return {username: account.username, address: account.address};
				});
			}

			if (account.followers && account.followers.length) {
				followers = account.followers.map(function (item) {
					var account = modules.accounts.getAccount(item);
					return {username: account.username, address: account.address};
				});
			}

			res.json({success: true, following: following, followers: followers});
		});
	});

	router.put("/", function (req, res, next) {
		req.sanitize(req.body, {
			type: "object",
			properties: {
				secret: {
					type: "string",
					minLength: 1
				},
				secondSecret: {
					type: "string"
				},
				publicKey: {
					type: "string",
					format: "publicKey"
				},
				following: {
					type: "string",
					minLength: 1
				}
			},
			required: ["secret", "following"]
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

			if (account.secondSignature && !body.secondSecret) {
				return res.json({success: false, error: errorCode("COMMON.SECOND_SECRET_KEY")});
			}

			if (account.secondSignature && body.secondSecret) {
				var secondHash = crypto.createHash('sha256').update(body.secondSecret, 'utf8').digest();
				var secondKeypair = ed.MakeKeypair(secondHash);
			}

			var followingAddress = body.following.substring(1, body.following.length);
			var isAddress = /^[0-9]+[C|c]$/g;
			var following = null;
			if (isAddress.test(followingAddress.toLowerCase())) {
				following = modules.accounts.getAccount(followingAddress);
			} else {
				following = modules.accounts.getAccountByUsername(followingAddress);
			}
			if (!following) {
				return res.json({success: false, error: errorCode("CONTACTS.USERNAME_DOESNT_FOUND")});
			}
			if (following.address == account.address) {
				return res.json({success: false, error: errorCode("CONTACTS.SELF_FRIENDING")});
			}
			followingAddress = body.following[0] + following.address;

			var transaction = library.logic.transaction.create({
				type: TransactionTypes.FOLLOW,
				sender: account,
				keypair: keypair,
				secondKeypair: secondKeypair,
				contactAddress: followingAddress
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

	router.use(function (req, res) {
		res.status(500).send({success: false, error: errorCode('COMMON.INVALID_API')});
	});

	library.network.app.use('/api/contacts', router);
	library.network.app.use(function (err, req, res, next) {
		if (!err) return next();
		library.logger.error(req.url, err.toString());
		res.status(500).send({success: false, error: err.toString()});
	});
}

function Contacts(cb, scope) {
	library = scope;
	self = this;
	self.__private = private;
	attachApi();

	library.logic.transaction.attachAssetType(TransactionTypes.FOLLOW, new Contact());

	setImmediate(cb, null, self);
}

Contacts.prototype.onBind = function (scope) {
	modules = scope;
}

//export
module.exports = Contacts;
