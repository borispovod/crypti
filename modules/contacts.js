var encryptHelper = require('../helpers/encrypt.js'),
	TransactionTypes = require('../helpers/transaction-types.js'),
	Router = require('../helpers/router.js'),
	constants = require('../helpers/constants.js'),
	ed = require('ed25519'),
	ByteBuffer = require("bytebuffer"),
	crypto = require('crypto'),
	Diff = require('../helpers/diff.js'),
	async = require('async'),
	util = require('util'),
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

		if (trs.amount != 0) {
			return setImmediate(cb, "Invalid amount: " + trs.id);
		}

		if (trs.recipientId) {
			return setImmediate(cb, "Invalid recipientId: " + trs.id);
		}

		modules.contacts.checkContacts(trs.senderPublicKey, [trs.asset.contact.address], function (err) {
			if (err) {
				return setImmediate(cb, errorCode("CONTACTS.ALREADY_ADDED_CONFIRMED", trs));
			}
			setImmediate(cb, err, trs);
		});
	}

	this.process = function (trs, sender, cb) {
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

	this.apply = function (trs, sender, cb) {
		this.scope.account.merge(sender.address, {contacts: [trs.asset.contact.address]}, cb);
	}

	this.undo = function (trs, sender, cb) {
		var contactsInvert = Diff.reverse([trs.asset.contact.address]);

		this.scope.account.merge(sender.address, {contacts: contactsInvert}, cb);
	}

	this.applyUnconfirmed = function (trs, sender, cb) {
		modules.delegates.checkUnconfirmedDelegates(trs.senderPublicKey, [trs.asset.contact.address], function (err) {
			if (err) {
				return setImmediate(cb, errorCode("CONTACTS.ALREADY_ADDED_UNCONFIRMED", trs));
			}

			this.scope.account.merge(sender.address, {u_contacts: [trs.asset.contact.address]}, cb);
		}.bind(this));
	}

	this.undoUnconfirmed = function (trs, sender, cb) {
		var contactsInvert = Diff.reverse([trs.asset.contact.address]);

		this.scope.account.merge(sender.address, {u_contacts: contactsInvert}, cb);
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
			throw Error("Incorrect address in contact transaction: " + library.scheme.getLastError());
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

	this.dbSave = function (trs, cb) {
		library.dbLite.query("INSERT INTO contacts(address, transactionId) VALUES($address, $transactionId)", {
			address: trs.asset.contact.address,
			transactionId: trs.id
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

			modules.accounts.getAccount({address: query.address}, function (err, account) {
				if (err) {
					return res.json({success: false, error: err.toString()});
				}
				if (!account) {
					return res.json({
						success: false,
						error: errorCode("ACCOUNTS.ACCOUNT_DOESNT_FOUND", {address: query.address})
					});
				}

				async.series({
					contacts: function (cb) {
						if (!account.contacts.length) {
							return cb(null, []);
						}
						modules.accounts.getAccounts({publicKey: {$in: account.contacts}} ["address", "username"], cbº);
					},
					followers: function (cb) {
						if (!account.followers.length) {
							return cb(null, []);
						}
						modules.accounts.getAccounts({publicKey: {$in: account.followers}} ["address", "username"], cb);
					}
				}, function (err, res) {
					if (err) {
						return res.json({success: false, error: err.toString()});
					}
					res.json({success: true, following: res.contacts, followers: res.followers});
				});
			});
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

			modules.accounts.getAccount({publicKey: keypair.publicKey.toString('hex')}, function (err, account) {
				if (err) {
					return res.json({success: false, error: err.toString()});
				}
				if (!account) {
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
				var query = {};

				var isAddress = /^[0-9]+[C|c]$/g;
				if (isAddress.test(followingAddress)) {
					query.address = body.recipientId;
				} else {
					query.username = body.recipientId;
				}

				modules.accounts.getAccount(query, function (err, following) {
					if (err) {
						return res.json({success: false, error: err.toString()});
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
							return res.json({success: false, error: err.toString()});
						}

						res.json({success: true, transaction: transaction});
					});
				});
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

Contacts.prototype.checkContacts = function (publicKey, contacts, cb) {
	if (contacts === null) {
		return setImmediate(cb);
	}

	if (util.isArray(contacts)) {
		modules.accounts.getAccount({publicKey: publicKey}, function (err, account) {
			if (err) {
				return cb(err);
			}
			if (!account) {
				return cb("Account not found");
			}

			for (var i = 0; i < contacts.length; i++) {
				var math = contacts[i][0];
				var publicKey = contacts[i].slice(1);

				if (math == "+" && (account.contacts !== null && account.contacts.indexOf(publicKey) != -1)) {
					return cb("Can't verify contacts, you already added this contact");
				}
				if (math == "-" && (account.contacts === null || account.contacts.indexOf(publicKey) === -1)) {
					return cb("Can't verify contacts, you had no this contact for removing");
				}
			}

			cb();
		});
	} else {
		setImmediate(cb, "Provide array of contacts");
	}
}

Contacts.prototype.checkUnconfirmedContacts = function (publicKey, contacts, cb) {
	if (util.isArray(contacts)) {
		modules.accounts.getAccount({publicKey: publicKey}, function (err, account) {
			if (err) {
				return cb(err);
			}
			if (!account) {
				return cb("Account not found");
			}

			for (var i = 0; i < contacts.length; i++) {
				var math = contacts[i][0];
				var publicKey = contacts[i].slice(1);

				if (private.unconfirmedVotes[publicKey] === undefined) {
					return cb("Your delegate not found");
				}

				if (math == "+" && (account.u_delegates !== null && account.u_delegates.indexOf(publicKey) != -1)) {
					return cb("Can't verify contacts, you already voted for this delegate");
				}
				if (math == "-" && (account.u_delegates === null || account.u_delegates.indexOf(publicKey) === -1)) {
					return cb("Can't verify contacts, you had no contacts for this delegate");
				}
			}

			cb();
		});
	} else {
		return setImmediate(cb, "Provide array of contacts");
	}
}

Contacts.prototype.onBind = function (scope) {
	modules = scope;
}

//export
module.exports = Contacts;