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
	errorCode = require('../helpers/errorCodes.js').error,
	sandboxHelper = require('../helpers/sandbox.js');

var modules, library, self, private = {}, shared = {};

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

		self.checkContacts(trs.senderPublicKey, [trs.asset.contact.address], function (err) {
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
		library.dbLite.query("SELECT count(id) FROM trs where recipientId=$address", {
			address: trs.asset.contact.address.slice(1)
		}, ['count'], function (err, rows) {
			if (err) {
				return setImmediate(cb, "Sql error");
			}

			if (rows.length == 0 || rows[0].count == 0) {
				return setImmediate(cb, "Can't apply contact, recipient doesn't exists");
			}

			self.checkUnconfirmedContacts(trs.senderPublicKey, [trs.asset.contact.address], function (err) {
				if (err) {
					return setImmediate(cb, errorCode("CONTACTS.ALREADY_ADDED_UNCONFIRMED", trs));
				}

				this.scope.account.merge(sender.address, {u_contacts: [trs.asset.contact.address]}, cb);
			}.bind(this));
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

//constructor
function Contacts(cb, scope) {
	library = scope;
	self = this;
	self.__private = private;
	private.attachApi();

	library.logic.transaction.attachAssetType(TransactionTypes.FOLLOW, new Contact());

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
		"get /": "getContacts",
		"put /": "addContact",
		"get /fee": "getFee"
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

//public methods
Contacts.prototype.checkContacts = function (publicKey, contacts, cb) {
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
				var contactAddress = contacts[i].slice(1);

				if (math == "+" && (account.contacts !== null && account.contacts.indexOf(contactAddress) != -1)) {
					return cb("Can't verify contacts, you already added this contact");
				}
				if (math == "-" && (account.contacts === null || account.contacts.indexOf(contactAddress) === -1)) {
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
	var selfAddress = modules.accounts.generateAddressByPublicKey(publicKey);

	if (util.isArray(contacts)) {
		modules.accounts.getAccount({address: selfAddress}, function (err, account) {
			if (err) {
				return cb(err);
			}
			if (!account) {
				return cb("Account not found");
			}

			for (var i = 0; i < contacts.length; i++) {
				var math = contacts[i][0];
				var contactAddress = contacts[i].slice(1);

				if (contactAddress == selfAddress) {
					return cb(errorCode("CONTACTS.SELF_FRIENDING"));
				}

				if (math == "+" && (account.u_delegates !== null && account.u_delegates.indexOf(contactAddress) != -1)) {
					return cb("Can't verify contacts, you already voted for this delegate");
				}
				if (math == "-" && (account.u_delegates === null || account.u_delegates.indexOf(contactAddress) === -1)) {
					return cb("Can't verify contacts, you had no contacts for this delegate");
				}
			}

			cb();
		});
	} else {
		return setImmediate(cb, "Provide array of contacts");
	}
}

Contacts.prototype.sandboxApi = function (call, args, cb) {
	sandboxHelper.callMethod(shared, call, args, cb);
}

//events
Contacts.prototype.onBind = function (scope) {
	modules = scope;
}

//shared
shared.getContacts = function (req, cb) {
	var query = req.body;
	library.scheme.validate(query, {
		type: "object",
		properties: {
			publicKey: {
				type: "string",
				format: "publicKey"
			}
		},
		required: ["publicKey"]
	}, function (err) {
		if (err) {
			return cb(err[0].message);
		}

		modules.accounts.getAccount({address: query.address}, function (err, account) {
			if (err) {
				return cb(err.toString());
			}
			if (!account) {
				return cb(errorCode("ACCOUNTS.ACCOUNT_DOESNT_FOUND", {address: query.address}));
			}

			async.series({
				contacts: function (cb) {
					if (!account.contacts.length) {
						return cb(null, []);
					}
					modules.accounts.getAccounts({address: {$in: account.contacts}} ["address", "username"], cb);
				},
				followers: function (cb) {
					if (!account.followers.length) {
						return cb(null, []);
					}
					modules.accounts.getAccounts({address: {$in: account.followers}} ["address", "username"], cb);
				}
			}, function (err, res) {
				if (err) {
					return cb(err.toString());
				}
				cb(null, {following: res.contacts, followers: res.followers});
			});
		});
	});
}

shared.addContact = function (req, cb) {
	var body = req.body;
	library.scheme.validate(body, {
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

		var query = {};

		var followingAddress = body.following.substring(1, body.following.length);
		var isAddress = /^[0-9]+[C|c]$/g;
		if (isAddress.test(followingAddress)) {
			query.address = body.recipientId;
		} else {
			query.username = body.recipientId;
		}

		library.sequence.add(function (cb) {
			modules.accounts.getAccount(query, function (err, following) {
				if (err) {
					return cb(err.toString());
				}
				if (!following) {
					return cb(errorCode("CONTACTS.USERNAME_DOESNT_FOUND"));
				}
				followingAddress = body.following[0] + following.address;

				modules.accounts.getAccount({publicKey: keypair.publicKey.toString('hex')}, function (err, account) {
					if (err) {
						return cb(err.toString());
					}
					if (!account) {
						return cb(errorCode("COMMON.OPEN_ACCOUNT"));
					}

					if (account.secondSignature && !body.secondSecret) {
						return cb(errorCode("COMMON.SECOND_SECRET_KEY"));
					}

					if (account.secondSignature && body.secondSecret) {
						var secondHash = crypto.createHash('sha256').update(body.secondSecret, 'utf8').digest();
						var secondKeypair = ed.MakeKeypair(secondHash);
					}

					var transaction = library.logic.transaction.create({
						type: TransactionTypes.FOLLOW,
						sender: account,
						keypair: keypair,
						secondKeypair: secondKeypair,
						contactAddress: followingAddress
					});

					modules.transactions.receiveTransactions([transaction], cb);
				});
			});
		}, function (err, transaction) {
			if (err) {
				return cb(err.toString());
			}

			cb(null, {transaction: transaction[0]});
		});
	});
}

shared.getFee = function (req, cb) {
	var query = req.body;
	cb(null, {fee: 1 * constants.fixedPoint})
}

//export
module.exports = Contacts;