var encryptHelper = require('../helpers/encrypt.js'),
	TransactionTypes = require('../helpers/transaction-types.js'),
	RequestSanitizer = require('../helpers/request-sanitizer.js'),
	Router = require('../helpers/router.js'),
	constants = require('../helpers/constants.js');

var modules, library, self, private = {};

function Contact() {
	this.create = function (data, trs) {
		trs.recipientId = null;
		trs.amount = 0;

		trs.asset.contact = {
			address: trs.contactAddress
		}

		return trs;
	}

	this.calculateFee = function (trs) {
		return 1 * constants.fixedPoint;
	}

	this.verify = function (trs, sender, cb) {
		if (!trs.asset.contact) {
			return cb("Invalid asset: " + trs.id);
		}

		if (!trs.asset.contact.address) {
			return cb("Invalid following: " + trs.id);
		}

		var isAddress = /^[0-9]+[C|c]$/g;
		if (!isAddress.test(trs.asset.contact.address.toLowerCase())) {
			return cb("Invalid following: " + trs.id);
		}

		if (trs.amount != 0) {
			return cb("Invalid amount: " + trs.id);
		}

		if (trs.recipientId != trs.senderId) {
			return cb("Invalid recipient id: " + trs.id);
		}

		return cb(null, trs);
	}

	this.getBytes = function (trs) {
		try {
			var contactAddress = new Buffer(trs.asset.contact.address, 'hex');

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

	this.applyUnconfirmed = function (trs, sender) {
		return sender.applyUnconfirmedContact(trs.asset.contact.address);
	}

	this.undoUnconfirmed = function (trs, sender) {
		return sender.undoUnconfirmedContact(trs.asset.contact.address);
	}

	this.objectNormalize = function (trs) {
		trs.asset.contact = RequestSanitizer.validate(trs.asset.contact, {
			object: true,
			properties: {
				address: "string!"
			}
		}).value;

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
}

function attachApi() {
	var router = new Router();

	router.use(function (req, res, next) {
		if (modules) return next();
		res.status(500).send({success: false, error: 'loading'});
	});

	router.get("/", function (req, res) {
		req.sanitize("query", {
			secret: "string!",
			secondSecret: "string?",
			publicKey: "hex?"
		}, function (err, report, query) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			var hash = crypto.createHash('sha256').update(query.secret, 'utf8').digest();
			var keypair = ed.MakeKeypair(hash);

			if (query.publicKey) {
				if (keypair.publicKey.toString('hex') != query.publicKey) {
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

			res.json({success: true, following: account.following});
		});
	});

	router.put("/", function (req, res) {
		req.sanitize("body", {
			secret: "string!",
			secondSecret: "string?",
			publicKey: "hex?",
			following: "string!"
		}, function (err, report, body) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

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

			if (account.secondSignature && body.secondSecret) {
				var secondHash = crypto.createHash('sha256').update(body.secondSecret, 'utf8').digest();
				var secondKeypair = ed.MakeKeypair(secondHash);
			}

			var followingAddress = null;
			var isAddress = /^[0-9]+[C|c]$/g;
			if (isAddress.test(body.following.toLowerCase())) {
				followingAddress = body.following;
			} else {
				var following = modules.accounts.getAccountByUsername(body.following);
				if (!following) {
					return res.json({success: false, error: "Invalid following"});
				}
				followingAddress = following.address;
			}

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
		res.status(500).send({success: false, error: 'api not found'});
	});

	library.app.use('/api/contacts', router);
	library.app.use(function (err, req, res, next) {
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