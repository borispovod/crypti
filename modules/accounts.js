var crypto = require('crypto'),
	bignum = require('../helpers/bignum.js'),
	ed = require('ed25519'),
	slots = require('../helpers/slots.js'),
	Router = require('../helpers/router.js'),
	util = require('util'),
	constants = require('../helpers/constants.js'),
	TransactionTypes = require('../helpers/transaction-types.js'),
	Diff = require('../helpers/diff.js'),
	errorCode = require('../helpers/errorCodes.js').error,
	extend = require('extend'),
	sandboxHelper = require('../helpers/sandbox.js');

//private fields
var modules, library, self, private = {}, shared = {};

function Vote() {
	this.create = function (data, trs) {
		trs.recipientId = data.sender.address;
		trs.recipientUsername = data.sender.username;
		trs.asset.votes = data.votes;

		return trs;
	}

	this.calculateFee = function (trs) {
		return 1 * constants.fixedPoint;
	}

	this.verify = function (trs, sender, cb) {
		if (trs.recipientId != trs.senderId) {
			return setImmediate(cb, errorCode("VOTES.INCORRECT_RECIPIENT", trs));
		}

		if (!trs.asset.votes || !trs.asset.votes.length) {
			return setImmediate(cb, errorCode("VOTES.EMPTY_VOTES", trs));
		}

		if (trs.asset.votes && trs.asset.votes.length > 33) {
			return setImmediate(cb, errorCode("VOTES.MAXIMUM_DELEGATES_VOTE", trs));
		}

		modules.delegates.checkDelegates(trs.senderPublicKey, trs.asset.votes, function (err) {
			setImmediate(cb, err, trs);
		});
	}

	this.process = function (trs, sender, cb) {
		setImmediate(cb, null, trs);
	}

	this.getBytes = function (trs) {
		try {
			var buf = trs.asset.votes ? new Buffer(trs.asset.votes.join(''), 'utf8') : null;
		} catch (e) {
			throw Error(e.toString());
		}

		return buf;
	}

	this.apply = function (trs, sender, cb) {
		this.scope.account.merge(sender.address, {delegates: trs.asset.votes}, cb);
	}

	this.undo = function (trs, sender, cb) {
		if (trs.asset.votes === null) return cb();

		var votesInvert = Diff.reverse(trs.asset.votes);

		this.scope.account.merge(sender.address, {delegates: votesInvert}, cb);
	}

	this.applyUnconfirmed = function (trs, sender, cb) {
		modules.delegates.checkUnconfirmedDelegates(trs.senderPublicKey, trs.asset.votes, function (err) {
			if (err) {
				return setImmediate(cb, errorCode("VOTES.ALREADY_VOTED_UNCONFIRMED", trs));
			}

			this.scope.account.merge(sender.address, {u_delegates: trs.asset.votes}, cb);
		}.bind(this));
	}

	this.undoUnconfirmed = function (trs, sender, cb) {
		if (trs.asset.votes === null) return cb();

		var votesInvert = Diff.reverse(trs.asset.votes);

		this.scope.account.merge(sender.address, {u_delegates: votesInvert}, cb);
	}

	this.objectNormalize = function (trs) {
		var report = library.scheme.validate(trs.asset.votes, {
			type: "array",
			minLength: 1,
			maxLength: 32,
			uniqueItems: true
		});

		if (!report) {
			throw new Error("Incorrect votes in transactions: " + library.scheme.getLastError());
		}

		return trs;
	}

	this.dbRead = function (raw) {
		if (!raw.v_votes) {
			return null
		} else {
			var votes = raw.v_votes.split(',');

			return {votes: votes};
		}
	}

	this.dbSave = function (trs, cb) {
		library.dbLite.query("INSERT INTO votes(votes, transactionId) VALUES($votes, $transactionId)", {
			votes: util.isArray(trs.asset.votes) ? trs.asset.votes.join(',') : null,
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

function Username() {
	this.create = function (data, trs) {
		trs.recipientId = null;
		trs.amount = 0;
		trs.asset.username = {
			alias: data.username,
			publicKey: data.sender.publicKey
		};

		return trs;
	}

	this.calculateFee = function (trs) {
		return 1 * constants.fixedPoint;
	}

	this.verify = function (trs, sender, cb) {
		if (trs.recipientId) {
			return setImmediate(cb, errorCode("USERNAMES.INCORRECT_RECIPIENT", trs));
		}

		if (trs.amount != 0) {
			return setImmediate(cb, errorCode("USERNAMES.INVALID_AMOUNT", trs));
		}

		if (!trs.asset.username.alias) {
			return setImmediate(cb, errorCode("USERNAMES.EMPTY_ASSET", trs));
		}

		var allowSymbols = /^[a-z0-9!@$&_.]+$/g;
		if (!allowSymbols.test(trs.asset.username.alias.toLowerCase())) {
			return setImmediate(cb, errorCode("USERNAMES.ALLOW_CHARS", trs));
		}

		var isAddress = /^[0-9]+[C|c]$/g;
		if (isAddress.test(trs.asset.username.alias.toLowerCase())) {
			return setImmediate(cb, errorCode("USERNAMES.USERNAME_LIKE_ADDRESS", trs));
		}

		if (trs.asset.username.alias.length == 0 || trs.asset.username.alias.length > 20) {
			return setImmediate(cb, errorCode("USERNAMES.INCORRECT_USERNAME_LENGTH", trs));
		}

		self.getAccount({
			$or: {
				username: trs.asset.username.alias,
				u_username: trs.asset.username.alias
			}
		}, function (err, account) {
			if (err) {
				return cb(err);
			}
			if (account && account.username == trs.asset.username.alias) {
				return cb(errorCode("DELEGATES.EXISTS_USERNAME", trs));
			}
			if (sender.username && sender.username != trs.asset.username.alias) {
				return cb(errorCode("DELEGATES.WRONG_USERNAME"));
			}
			if (sender.u_username && sender.u_username != trs.asset.username.alias) {
				return cb(errorCode("USERNAMES.ALREADY_HAVE_USERNAME", trs));
			}

			cb(null, trs);
		});
	}

	this.process = function (trs, sender, cb) {
		setImmediate(cb, null, trs);
	}

	this.getBytes = function (trs) {
		try {
			var buf = new Buffer(trs.asset.username.alias, 'utf8');
		} catch (e) {
			throw Error(e.toString());
		}

		return buf;
	}

	this.apply = function (trs, sender, cb) {
		self.setAccountAndGet({address: sender.address, u_username: null, username: trs.asset.username.alias}, cb);
	}

	this.undo = function (trs, sender, cb) {
		self.setAccountAndGet({address: sender.address, username: null, u_username: trs.asset.username.alias}, cb);
	}

	this.applyUnconfirmed = function (trs, sender, cb) {
		if (sender.username || sender.u_username) {
			return setImmediate(cb, errorCode("USERNAMES.ALREADY_HAVE_USERNAME", trs));
		}

		var address = modules.accounts.generateAddressByPublicKey(trs.senderPublicKey);

		self.getAccount({
			$or: {
				u_username: trs.asset.username.alias,
				address: address
			}
		}, function (err, account) {
			if (err) {
				return cb(err);
			}
			if (account && account.u_username) {
				return cb(errorCode("USERNAMES.EXISTS_USERNAME", trs));
			}

			self.setAccountAndGet({address: sender.address, u_username: trs.asset.username.alias}, cb);
		});
	}

	this.undoUnconfirmed = function (trs, sender, cb) {
		self.setAccountAndGet({address: sender.address, u_username: null}, cb);
	}

	this.objectNormalize = function (trs) {
		var report = library.scheme.validate(trs.asset.username, {
			type: "object",
			properties: {
				alias: {
					type: "string",
					minLength: 1,
					maxLength: 20
				},
				publicKey: {
					type: 'string',
					format: 'publicKey'
				}
			},
			required: ['alias', 'publicKey']
		});

		if (!report) {
			throw Error(library.scheme.getLastError());
		}

		return trs;
	}

	this.dbRead = function (raw) {
		if (!raw.u_alias) {
			return null
		} else {
			var username = {
				alias: raw.u_alias,
				publicKey: raw.t_senderPublicKey
			}

			return {username: username};
		}
	}

	this.dbSave = function (trs, cb) {
		library.dbLite.query("INSERT INTO usernames(username, transactionId) VALUES($username, $transactionId)", {
			username: trs.asset.username.alias,
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
function Accounts(cb, scope) {
	library = scope;
	self = this;
	self.__private = private;
	private.attachApi();

	library.logic.transaction.attachAssetType(TransactionTypes.VOTE, new Vote());
	library.logic.transaction.attachAssetType(TransactionTypes.USERNAME, new Username());

	setImmediate(cb, null, self);
}

//private methods
private.attachApi = function () {
	var router = new Router();

	router.use(function (req, res, next) {
		if (modules) return next();
		res.status(500).send({success: false, error: errorCode('COMMON.LOADING')});
	});

	router.post('/open', function (req, res, next) {
		shared.open(req.body, function (err, response) {
			if (err) {
				res.json({success: false, error: err});
			} else {
				return res.json(extend({}, {success: true}, response));
			}
		});
	});

	router.get('/getBalance', function (req, res, next) {
		shared.getBalance(req.query, function (err, response) {
			if (err) {
				res.json({success: false, error: err});
			} else {
				return res.json(extend({}, {success: true}, response));
			}
		});
	});

	if (process.env.DEBUG && process.env.DEBUG.toUpperCase() == "TRUE") {
		// for sebastian
		router.get('/getAllAccounts', function (req, res) {
			return res.json({success: true, accounts: private.accounts});
		});
	}

	// надо тут поправить
	if (process.env.TOP && process.env.TOP.toUpperCase() == "TRUE") {
		router.get('/top', function (req, res) {
			var arr = Object.keys(private.accounts).map(function (key) {
				return private.accounts[key]
			});

			arr.sort(function (a, b) {
				if (a.balance > b.balance)
					return -1;
				if (a.balance < b.balance)
					return 1;
				return 0;
			});

			arr = arr.slice(0, 30);
			return res.json({success: true, accounts: arr});
		});
	}

	router.get('/getPublicKey', function (req, res, next) {
		shared.getPublickey(req.query, function (err, response) {
			if (err) {
				res.json({success: false, error: err});
			} else {
				return res.json(extend({}, {success: true}, response));
			}
		});
	});

	router.post("/generatePublicKey", function (req, res, next) {
		req.sanitize(req.body, {
			type: "object",
			properties: {
				secret: {
					type: "string",
					minLength: 1
				}
			},
			required: ["secret"]
		}, function (err, report, query) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			private.openAccount(query.secret, function (err, account) {
				var publicKey = null;
				if (!err) {
					publicKey = account.publicKey;
				}
				res.json({
					success: !err,
					publicKey: account.publicKey
				});
			});
		});

	});

	router.get("/delegates", function (req, res, next) {
		req.sanitize(req.query, {
			type: "object",
			properties: {
				address: {
					type: "string",
					minLength: 1
				}
			},
			required: ["address"]
		}, function (err, report, query) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			self.getAccount({address: query.address}, function (err, account) {
				if (err) {
					return res.json({success: false, error: err.toString()});
				}
				if (!account) {
					return res.json({
						success: false,
						error: errorCode("ACCOUNTS.ACCOUNT_DOESNT_FOUND", {address: query.address})
					});
				}

				if (account.delegates) {
					var stat = modules.delegates.getStats();

					var delegates = account.delegates.map(function (delegate) {
						return self.generateAddressByPublicKey(delegate);
					});
					self.getAccounts({address: {$in: delegates}}, ["username", "address", "publicKey", "rate", "vote"], function (err, delegates) {
						if (err) {
							return res.json({success: false, error: err.toString()});
						}

						for (var i = 0; i < delegates.length; i++) {
							delegates[i].vote = stat.votes[delegates[i].publicKey];
							delegates[i].rate = stat.rates[delegates[i].publicKey];
							delegates[i].productivity = stat.productivities[delegates[i].publicKey];
						}

						res.json({success: true, delegates: delegates});

					});
				} else {
					res.json({success: true, delegates: []});
				}
			});
		});
	});

	router.get("/delegates/fee", function (req, res) {
		return res.json({success: true, fee: 1 * constants.fixedPoint});
	});

	router.put("/delegates", function (req, res, next) {
		req.sanitize(req.body, {
			type: "object",
			properties: {
				secret: {
					type: 'string',
					minLength: 1
				},
				publicKey: {
					type: 'string',
					format: 'publicKey'
				},
				secondSecret: {
					type: 'string',
					minLength: 1
				}
			}
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

			library.sequence.add(function (cb) {
				self.getAccount({publicKey: keypair.publicKey.toString('hex')}, function (err, account) {
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

					var transaction = library.logic.transaction.create({
						type: TransactionTypes.VOTE,
						votes: body.delegates,
						sender: account,
						keypair: keypair,
						secondKeypair: secondKeypair
					});
					modules.transactions.receiveTransactions([transaction], cb);
				});
			}, function (err, transaction) {
				if (err) {
					return res.json({success: false, error: err.toString()});
				}

				res.json({success: true, transaction: transaction[0]});
			});
		});
	});

	router.get('/username/fee', function (req, res) {
		return res.json({success: true, fee: 1 * constants.fixedPoint});
	});

	router.put("/username", function (req, res, next) {
		req.sanitize(req.body, {
			type: "object",
			properties: {
				secret: {
					type: "string",
					minLength: 1
				},
				publicKey: {
					type: "string",
					format: "publicKey"
				},
				secondSecret: {
					type: "string",
					minLength: 1
				},
				username: {
					type: "string",
					minLength: 1
				}
			},
			required: ['secret', 'username']
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

			library.sequence.add(function (cb) {
				self.getAccount({publicKey: keypair.publicKey.toString('hex')}, function (err, account) {
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

					var transaction = library.logic.transaction.create({
						type: TransactionTypes.USERNAME,
						username: body.username,
						sender: account,
						keypair: keypair,
						secondKeypair: secondKeypair
					});
					modules.transactions.receiveTransactions([transaction], cb);
				});
			}, function (err, transaction) {
				if (err) {
					return res.json({success: false, error: err.toString()});
				}

				res.json({success: true, transaction: transaction[0]});
			});
		});
	});

	router.get("/", function (req, res, next) {
		req.sanitize(req.query, {
			type: "object",
			properties: {
				address: {
					type: "string",
					minLength: 1
				}
			},
			required: ["address"]
		}, function (err, report, query) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});


			self.getAccount({address: query.address}, function (err, account) {
				if (err) {
					return res.json({success: false, error: err.toString()});
				}
				if (!account) {
					return res.json({success: false, error: errorCode("ACCOUNTS.ACCOUNT_DOESNT_FOUND")});
				}

				return res.json({
					success: true,
					account: {
						address: account.address,
						username: account.username,
						unconfirmedBalance: account.u_balance,
						balance: account.balance,
						publicKey: account.publicKey,
						unconfirmedSignature: account.unconfirmedSignature,
						secondSignature: account.secondSignature,
						secondPublicKey: account.secondPublicKey
					}
				});
			});
		});
	});

	router.use(function (req, res, next) {
		res.status(500).send({success: false, error: errorCode('COMMON.INVALID_API')});
	});

	library.network.app.use('/api/accounts', router);
	library.network.app.use(function (err, req, res, next) {
		if (!err) return next();
		library.logger.error(req.url, err.toString());
		res.status(500).send({success: false, error: err.toString()});
	});
}

private.openAccount = function (secret, cb) {
	var hash = crypto.createHash('sha256').update(secret, 'utf8').digest();
	var keypair = ed.MakeKeypair(hash);

	self.setAccountAndGet({publicKey: keypair.publicKey.toString('hex')}, cb);
}

//public methods
Accounts.prototype.generateAddressByPublicKey = function (publicKey) {
	var publicKeyHash = crypto.createHash('sha256').update(publicKey, 'hex').digest();
	var temp = new Buffer(8);
	for (var i = 0; i < 8; i++) {
		temp[i] = publicKeyHash[7 - i];
	}

	var address = bignum.fromBuffer(temp).toString() + "C";
	return address;
}

Accounts.prototype.getAccount = function (filter, fields, cb) {
	if (filter.publicKey) {
		filter.address = self.generateAddressByPublicKey(filter.publicKey);
		delete filter.publicKey;
	}
	library.logic.account.get(filter, fields, cb);
}

Accounts.prototype.getAccounts = function (filter, fields, cb) {
	library.logic.account.getAll(filter, fields, cb);
}

Accounts.prototype.setAccountAndGet = function (data, cb) {
	var address = data.address || null;
	if (address === null) {
		if (data.publicKey) {
			address = self.generateAddressByPublicKey(data.publicKey);
		} else {
			cb("must provide address or publicKey");
		}
	}
	library.logic.account.set(address, data, function (err) {
		if (err) {
			return cb(err);
		}
		library.logic.account.get({address: address}, cb);
	});
}

Accounts.prototype.mergeAccountAndGet = function (data, cb) {
	var address = data.address || null;
	if (address === null) {
		if (data.publicKey) {
			address = self.generateAddressByPublicKey(data.publicKey);
		} else {
			cb("must provide address or publicKey");
		}
	}
	library.logic.account.merge(address, data, cb);
}

Accounts.prototype.sandboxApi = function (call, args, cb) {
	sandboxHelper.callMethod(private, call, args, cb);
}

//events
Accounts.prototype.onBind = function (scope) {
	modules = scope;
}

//shared
shared.open = function (body, cb) {
	library.scheme.validate(body, {
		type: "object",
		properties: {
			secret: {
				type: "string",
				minLength: 1,
				maxLength: 100
			}
		},
		required: ["secret"]
	}, function (err) {
		if (err) {
			return cb(err[0].message);
		}

		private.openAccount(body.secret, function (err, account) {
			var accountData = null;
			if (!err) {
				accountData = {
					address: account.address,
					unconfirmedBalance: account.u_balance,
					balance: account.balance,
					publicKey: account.publicKey,
					unconfirmedSignature: account.unconfirmedSignature,
					secondSignature: account.secondSignature,
					secondPublicKey: account.secondPublicKey
				};

				return cb(null, {account: accountData});
			} else {
				return cb(err);
			}
		});
	});
}

shared.getBalance = function (query, cb) {
	library.scheme.validate(query, {
		type: "object",
		properties: {
			address: {
				type: "string",
				minLength: 1
			}
		},
		required: ["address"]
	}, function (err) {
		if (err) {
			return cb(err[0].message);
		}

		var isAddress = /^[0-9]+c$/g;
		if (!isAddress.test(query.address.toLowerCase())) {
			return cb(errorCode("ACCOUNTS.INVALID_ADDRESS", {address: query.address}))
		}

		self.getAccount({address: query.address}, function (err, account) {
			if (err) {
				return cb(err.toString());
			}
			var balance = account ? account.balance : 0;
			var unconfirmedBalance = account ? account.u_balance : 0;

			cb(null, {balance: balance, unconfirmedBalance: unconfirmedBalance});
		});
	});
}

shared.getPublickey = function (query, cb) {
	library.scheme.validate(query, {
		type: "object",
		properties: {
			address: {
				type: "string",
				minLength: 1
			}
		},
		required: ["address"]
	}, function (err) {
		if (err) {
			return cb(err[0].message);
		}

		self.getAccount({address: query.address}, function (err, account) {
			if (err) {
				return res.json({success: false, error: err.toString()});
			}
			if (!account || !account.publicKey) {
				return res.json({
					success: false,
					error: errorCode("ACCOUNTS.ACCOUNT_PUBLIC_KEY_NOT_FOUND", {address: query.address})
				});
			}

			res.json({success: true, publicKey: account.publicKey});
		});
	});
}

//export
module.exports = Accounts;