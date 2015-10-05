var crypto = require('crypto'),
	bignum = require('../helpers/bignum.js'),
	ed = require('ed25519'),
	slots = require('../helpers/slots.js'),
	Router = require('../helpers/router.js'),
	util = require('util'),
	constants = require('../helpers/constants.js'),
	TransactionTypes = require('../helpers/transaction-types.js'),
	errorCode = require('../helpers/errorCodes.js').error;

//private
var modules, library, self, private = {};

private.accounts = {};
private.username2address = {};
private.unconfirmedNames = {};

function Account(address, publicKey, balance, unconfirmedBalance) {
	this.address = address;
	this.publicKey = publicKey || null;
	this.balance = balance || 0;
	this.unconfirmedBalance = unconfirmedBalance || 0;
	this.unconfirmedSignature = false;
	this.secondSignature = false;
	this.secondPublicKey = null;
	this.delegates = null;
	this.unconfirmedDelegates = null;
	this.unconfirmedAvatar = false;
	this.avatar = false;
	this.username = null;
	this.unconfirmedUsername = null;
	this.following = [];
	this.unconfirmedFollowing = [];
	this.followers = [];
}

function reverseDiff(diff) {
	var copyDiff = diff.slice();
	for (var i = 0; i < copyDiff.length; i++) {
		var math = copyDiff[i][0] == '-' ? '+' : '-';
		copyDiff[i] = math + copyDiff[i].slice(1);
	}
	return copyDiff;
}

function applyDiff(source, diff, dismissMin) {
	var res = source ? source.slice() : [];

	for (var i = 0; i < diff.length; i++) {
		var math = diff[i][0];
		var publicKey = diff[i].slice(1);

		if (math == "+") {
			res = res || [];

			var index = -1;
			if (res) {
				index = res.indexOf(publicKey);
			}
			if (index != -1) {
				return false;
			}

			res.push(publicKey);
		}

		if (math == "-") {
			if (dismissMin) {
				return false;
			}

			var index = -1;
			if (res) {
				index = res.indexOf(publicKey);
			}
			if (index == -1) {
				return false;
			}
			res.splice(index, 1);
			if (!res.length) {
				res = null;
			}
		}
	}

	return res;
}

Account.prototype.addToBalance = function (amount) {
	this.balance += amount;
	var delegate = this.delegates ? this.delegates.slice() : null
	library.bus.message('changeBalance', delegate, amount);
}

Account.prototype.addToUnconfirmedBalance = function (amount) {
	this.unconfirmedBalance += amount;

	var unconfirmedDelegate = this.unconfirmedDelegates ? this.unconfirmedDelegates.slice() : null
	library.bus.message('changeUnconfirmedBalance', unconfirmedDelegate, amount);
}

Account.prototype.applyUnconfirmedDelegateList = function (diff) {
	if (diff === null) return;

	var dest = applyDiff(this.unconfirmedDelegates, diff);

	if (dest !== false) {
		if (dest && dest.length > 105) {
			console.log(dest);
			console.log(dest.length);
			return false;
		}

		this.unconfirmedDelegates = dest;
		library.bus.message('changeUnconfirmedDelegates', this.balance, diff);
		return true;
	}

	return false;
}

Account.prototype.undoUnconfirmedDelegateList = function (diff) {
	if (diff === null) return;

	var copyDiff = reverseDiff(diff);

	var dest = applyDiff(this.unconfirmedDelegates, copyDiff);

	if (dest !== false) {
		/*if (dest && dest.length > 101) {
			return false;
		}*/

		this.unconfirmedDelegates = dest;
		library.bus.message('changeUnconfirmedDelegates', this.balance, copyDiff);
		return true;
	}

	return false;
}

Account.prototype.applyDelegateList = function (diff) {
	if (diff === null) return;

	var dest = applyDiff(this.delegates, diff);

	if (dest !== false) {
		if (dest && dest.length > 105) {
			console.log(this.unconfirmedDelegates);
			console.log(this.delegates);
			return false;
		}

		this.delegates = dest;
		library.bus.message('changeDelegates', this.balance, diff);
		return true;
	}

	return false;
}

Account.prototype.undoDelegateList = function (diff) {
	if (diff === null) return;

	var copyDiff = reverseDiff(diff);

	var dest = applyDiff(this.delegates, copyDiff);

	if (dest !== false) {
		/*if (dest && dest.length > 101) {
			return false;
		}*/

		this.delegates = dest;
		library.bus.message('changeDelegates', this.balance, copyDiff);
		return true;
	}

	return false;
}

Account.prototype.applyContact = function (diff) {
	if (diff === null) return;

	var dest = applyDiff(this.following, [diff], true);

	if (dest !== false) {
		var math = diff[0];
		var address = diff.slice(1);
		var friend = modules.accounts.getAccount(address);

		if (math == "+") { //follow
			if (friend.following.indexOf(this.address) == -1) { //if I´m not his friend
				friend.addPending(this.address); //will send request for a friendship
			} else { //if we are friends (I confirmed request)
				this.deletePending(address); //remove his request
			}
		} else { //unfollow
			if (friend.following.indexOf(this.address) == -1) { //if I´m not his friend
				friend.deletePending(this.address); //remove my request
			} else { //if we are friends
				this.addPending(address); // back his request to me
			}
		}
		this.following = dest || [];
		library.network.io.sockets.emit('followers/change', {address: address});
		library.network.io.sockets.emit('contacts/change', {address: this.address});
		return true;
	}

	return false;
}

Account.prototype.undoContact = function (diff) {
	if (diff === null) return;

	var copyDiff = reverseDiff([diff]);

	var dest = applyDiff(this.following, copyDiff, true);

	if (dest !== false) {
		var math = diff[0];
		var address = diff.slice(1);
		var friend = modules.accounts.getAccount(address);

		if (math == "+") { //follow
			if (friend.following.indexOf(this.address) == -1) { //if I´m not his friend
				friend.deletePending(this.address); //will send request for a friendship
			} else { //if we are friends (I confirmed request)
				this.addPending(address); //remove his request
			}
		} else { //unfollow
			if (friend.following.indexOf(this.address) == -1) { //if I´m not his friend
				friend.addPending(this.address); //remove my request
			} else { //if we are friends
				this.deletePending(address); // back his request to me
			}
		}
		this.following = dest || [];
		library.network.io.sockets.emit('followers/change', {address: address});
		library.network.io.sockets.emit('contacts/change', {address: this.address});
		return true;
	}

	return false;
}

Account.prototype.applyUnconfirmedContact = function (diff) {
	if (diff === null) return;

	var dest = applyDiff(this.unconfirmedFollowing, [diff], true);

	if (dest !== false) {
		this.unconfirmedFollowing = dest || [];
		return true;
	}

	return false;
}

Account.prototype.undoUnconfirmedContact = function (diff) {
	if (diff === null) return;

	var copyDiff = reverseDiff([diff]);

	var dest = applyDiff(this.unconfirmedFollowing, copyDiff, true);

	if (dest !== false) {
		this.unconfirmedFollowing = dest || [];
		return true;
	}

	return false;
}

Account.prototype.addPending = function (address) {
	var index = this.followers.indexOf(address);
	if (index != -1) {
		return false;
	}
	this.followers.push(address);
	return true;
}

Account.prototype.deletePending = function (address) {
	var index = this.followers.indexOf(address);
	if (index == -1) {
		return false;
	}
	this.followers.splice(index, 1);
	return true;
}

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

		if (!modules.delegates.checkDelegates(trs.senderPublicKey, trs.asset.votes)) {
			return setImmediate(cb, errorCode("VOTES.ALREADY_VOTED_CONFIRMED", trs));
		}

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

	this.apply = function (trs, sender) {
		return sender.applyDelegateList(trs.asset.votes);
	}

	this.undo = function (trs, sender) {
		sender.undoDelegateList(trs.asset.votes);
		return true;
	}

	this.applyUnconfirmed = function (trs, sender, cb) {
		if (!modules.delegates.checkUnconfirmedDelegates(trs.senderPublicKey, trs.asset.votes)) {
			return setImmediate(cb, errorCode("VOTES.ALREADY_VOTED_UNCONFIRMED", trs));
		}

		var res = sender.applyUnconfirmedDelegateList(trs.asset.votes);

		setImmediate(cb, !res ? "Can't apply unconfirmed delegates: " + trs.id : null);
	}

	this.undoUnconfirmed = function (trs, sender) {
		return sender.undoUnconfirmedDelegateList(trs.asset.votes);
	}

	this.objectNormalize = function (trs) {
		var report = library.scheme.validate(trs.asset, {
			type: "object",
			properties: {
				votes: {
					type: "array",
					minLength: 1,
					maxLength: 33,
					uniqueItems: true
				}
			},
			required: ['votes']
		});

		if (!report) {
			throw new Error("Incorrect votes in transactions");
		}

		trs.asset.votes = trs.asset.votes;
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

	this.dbSave = function (dbLite, trs, cb) {
		dbLite.query("INSERT INTO votes(votes, transactionId) VALUES($votes, $transactionId)", {
			votes: util.isArray(trs.asset.votes) ? trs.asset.votes.join(',') : null,
			transactionId: trs.id
		}, cb);
	}

	this.ready = function (trs) {
		return true;
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
		return 100 * constants.fixedPoint;
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

		if (modules.delegates.existsName(trs.asset.username.alias)) {
			return setImmediate(cb, errorCode("USERNAMES.EXISTS_USERNAME", trs));
		}

		if (self.existsUsername(trs.asset.username.alias)) {
			return setImmediate(cb, errorCode("USERNAMES.EXISTS_USERNAME", trs));
		}

		if (modules.delegates.existsDelegate(trs.senderPublicKey)) {
			return setImmediate(cb, errorCode("USERNAMES.EXISTS_USERNAME", trs));
		}

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

	this.apply = function (trs, sender) {
		delete private.unconfirmedNames[trs.asset.username.alias.toLowerCase()]
		private.username2address[trs.asset.username.alias.toLowerCase()] = sender.address;
		sender.username = trs.asset.username.alias;

		return true;
	}

	this.undo = function (trs, sender) {
		private.unconfirmedNames[trs.asset.username.alias.toLowerCase()] = true;
		delete private.username2address[trs.asset.username.alias.toLowerCase()];
		sender.username = null;

		return true;
	}

	this.applyUnconfirmed = function (trs, sender, cb) {
		if (modules.delegates.existsUnconfirmedDelegate(trs.senderPublicKey)) {
			return setImmediate(cb, errorCode("USERNAMES.EXISTS_USERNAME", trs));
		}

		if (modules.delegates.existsUnconfirmedName(trs.asset.username.alias)) {
			return setImmediate(cb, errorCode("USERNAMES.EXISTS_USERNAME", trs));
		}

		if (self.existsUnconfirmedUsername(trs.asset.username.alias)) {
			return setImmediate(cb, errorCode("USERNAMES.EXISTS_USERNAME", trs));
		}

		if (sender.username || sender.unconfirmedUsername) {
			return setImmediate(cb, errorCode("USERNAMES.ALREADY_HAVE_USERNAME", trs));
		}

		sender.unconfirmedUsername = trs.asset.username.alias;
		private.unconfirmedNames[trs.asset.username.alias.toLowerCase()] = true;

		setImmediate(cb);
	}

	this.undoUnconfirmed = function (trs, sender) {
		sender.unconfirmedUsername = null;
		delete private.unconfirmedNames[trs.asset.username.alias.toLowerCase()];

		return true;
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
			throw Error("Alias of username transaction incorrect.");
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

	this.dbSave = function (dbLite, trs, cb) {
		dbLite.query("INSERT INTO usernames(username, transactionId) VALUES($username, $transactionId)", {
			username: trs.asset.username.alias,
			transactionId: trs.id
		}, cb);
	}

	this.ready = function (trs) {
		return true;
	}
}

//constructor
function Accounts(cb, scope) {
	library = scope;
	self = this;
	self.__private = private;
	attachApi();

	library.logic.transaction.attachAssetType(TransactionTypes.VOTE, new Vote());
	library.logic.transaction.attachAssetType(TransactionTypes.USERNAME, new Username());

	setImmediate(cb, null, self);
}

//private methods
function attachApi() {
	var router = new Router();

	router.use(function (req, res, next) {
		if (modules) return next();
		res.status(500).send({success: false, error: errorCode('COMMON.LOADING')});
	});

	router.post('/open', function (req, res, next) {
		req.sanitize(req.body, {
			type: "object",
			properties: {
				secret: {
					type: "string",
					minLength: 1,
					maxLength: 100
				}
			},
			required: ["secret"]
		}, function (err, report, body) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			var account = private.openAccount(body.secret);

			res.json({
				success: true,
				account: {
					address: account.address,
					unconfirmedBalance: account.unconfirmedBalance,
					balance: account.balance,
					publicKey: account.publicKey,
					unconfirmedSignature: account.unconfirmedSignature,
					secondSignature: account.secondSignature,
					secondPublicKey: account.secondPublicKey
				}
			});
		});
	});

	router.get('/getBalance', function (req, res, next) {
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

			var isAddress = /^[0-9]+c$/g;
			if (!isAddress.test(query.address.toLowerCase())) {
				return res.json({
					success: false,
					error: errorCode("ACCOUNTS.INVALID_ADDRESS", {address: query.address})
				});
			}

			var account = self.getAccount(query.address);
			var balance = account ? account.balance : 0;
			var unconfirmedBalance = account ? account.unconfirmedBalance : 0;

			return res.json({success: true, balance: balance, unconfirmedBalance: unconfirmedBalance});
		});
	});

	if (process.env.DEBUG && process.env.DEBUG.toUpperCase() == "TRUE") {
		// for sebastian
		router.get('/getAllAccounts', function (req, res) {
			return res.json({success: true, accounts: private.accounts});
		});
	}

	if (process.env.TOP && process.env.TOP.toUpperCase() == "TRUE") {
		router.get('/top', function (req, res) {
			req.sanitize(req.query, {
				type: "object",
				properties: {
					limit: {
						type: "integer",
						minimum: 0,
						maximum: 100
					},
					offset: {
						type: "integer",
						minimum: 0
					}
				}
			}, function (err, report, query) {
				if (err) return next(err);
				if (!report.isValid) return res.json({success: false, error: report.issues});

				var limit = req.query.limit,
					offset = req.query.offset;

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

				arr = arr.slice(offset, offset + limit);
				return res.json({success: true, accounts: arr});
			});
		});

		router.get('/top_sum', function (req, res) {
			var s = bignum("0");
			for (var i in private.accounts) {
				var a = private.accounts[i];
				if (a.balance > 0) {
					s = s.add(a.balance.toString());
				}
			}

			return res.json({success: true, balance: s.toString()});
		});
	}

	router.get('/getPublicKey', function (req, res, next) {
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

			var account = self.getAccount(query.address);

			if (!account || !account.publicKey) {
				return res.json({
					success: false,
					error: errorCode("ACCOUNTS.ACCOUNT_PUBLIC_KEY_NOT_FOUND", {address: query.address})
				});
			}

			return res.json({success: true, publicKey: account.publicKey});
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

			var account = private.openAccount(query.secret);
			return res.json({success: true, publicKey: account.publicKey});
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


			var account = self.getAccount(query.address);

			if (!account) {
				return res.json({
					success: false,
					error: errorCode("ACCOUNTS.ACCOUNT_DOESNT_FOUND", {address: query.address})
				});
			}

			var delegates = null;

			if (account.delegates) {
				delegates = account.delegates.map(function (publicKey) {
					return modules.delegates.getDelegateByPublicKey(publicKey);
				});
			}

			return res.json({success: true, delegates: delegates});
		});
	});

	router.get("/username/get", function (req, res, next) {
		req.sanitize(req.query, {
			type: "object",
			properties: {
				username: {
					type: "string",
					minLength: 1
				}
			}
		}, function (err, report, query) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			var address = private.username2address[query.username.toLowerCase()];
			var account = null;

			if (!address) {
				var delegate = modules.delegates.getDelegateByUsername(query.username.toLowerCase());

				if (!delegate) {
					return res.json({success: false, error: errorCode("ACCOUNTS.ACCOUNT_DOESNT_FOUND")});
				}

				account = self.getAccount(delegate.address);
			} else {
				account = self.getAccount(address);
			}

			if (!account) {
				return res.json({success: false, error: errorCode("ACCOUNTS.ACCOUNT_DOESNT_FOUND")});
			}

			return res.json({
				success: true,
				account: {
					address: account.address,
					username: account.username,
					unconfirmedBalance: account.unconfirmedBalance,
					balance: account.balance,
					publicKey: account.publicKey,
					unconfirmedSignature: account.unconfirmedSignature,
					secondSignature: account.secondSignature,
					secondPublicKey: account.secondPublicKey
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

			var account = self.getAccountByPublicKey(keypair.publicKey.toString('hex'));

			if (!account || !account.publicKey) {
				return res.json({success: false, error: errorCode("COMMON.OPEN_ACCOUNT")});
			}

			if (account.secondSignature && !body.secondSecret) {
				return res.json({success: false, error: errorCode("COMMON.SECOND_SECRET_KEY")});
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

	router.get('/username/fee', function (req, res) {
		return res.json({success: true, fee: 100 * constants.fixedPoint});
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

			var account = self.getAccountByPublicKey(keypair.publicKey.toString('hex'));

			if (!account || !account.publicKey) {
				return res.json({success: false, error: errorCode("COMMON.OPEN_ACCOUNT")});
			}

			if (account.secondSignature && !body.secondSecret) {
				return res.json({success: false, error: errorCode("COMMON.SECOND_SECRET_KEY")});
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


			var account = self.getAccount(query.address);

			if (!account) {
				return res.json({success: false, error: errorCode("ACCOUNTS.ACCOUNT_DOESNT_FOUND")});
			}

			return res.json({
				success: true,
				account: {
					address: account.address,
					username: account.username,
					unconfirmedBalance: account.unconfirmedBalance,
					balance: account.balance,
					publicKey: account.publicKey,
					unconfirmedSignature: account.unconfirmedSignature,
					secondSignature: account.secondSignature,
					secondPublicKey: account.secondPublicKey
				}
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

private.addAccount = function (account) {
	if (!private.accounts[account.address]) {
		private.accounts[account.address] = account;
	}
}

private.openAccount = function (secret) {
	var hash = crypto.createHash('sha256').update(secret, 'utf8').digest();
	var keypair = ed.MakeKeypair(hash);

	return self.getAccountOrCreateByPublicKey(keypair.publicKey.toString('hex'));
}

//public methods
Accounts.prototype.getAccount = function (id) {
	return private.accounts[id.toString().toUpperCase()];
}

Accounts.prototype.getAccountByPublicKey = function (publicKey) {
	var address = self.getAddressByPublicKey(publicKey);
	var account = self.getAccount(address);

	if (account && !account.publicKey) {
		account.publicKey = publicKey;
	}

	return account;
}

Accounts.prototype.getAddressByPublicKey = function (publicKey) {
	var publicKeyHash = crypto.createHash('sha256').update(publicKey, 'hex').digest();
	var temp = new Buffer(8);
	for (var i = 0; i < 8; i++) {
		temp[i] = publicKeyHash[7 - i];
	}

	var address = bignum.fromBuffer(temp).toString() + "C";
	return address;
}

Accounts.prototype.getAccountByUsername = function (username) {
	var address = private.username2address[username.toLowerCase()];
	if (!address) {
		var delegate = modules.delegates.getDelegateByUsername(username.toLowerCase())
		if (delegate) {
			address = self.getAddressByPublicKey(delegate.publicKey);
		}
	}

	return address && this.getAccount(address);
}

Accounts.prototype.getAccountOrCreateByPublicKey = function (publicKey) {
	var address = self.getAddressByPublicKey(publicKey);
	var account = self.getAccount(address);

	if (account && !account.publicKey) {
		account.publicKey = publicKey;
	}

	if (!account) {
		account = new Account(address, publicKey);
		private.addAccount(account);
	}
	return account;
}

Accounts.prototype.getAccountOrCreateByAddress = function (address) {
	var account = self.getAccount(address);

	if (!account) {
		account = new Account(address);
		private.addAccount(account);
	}

	return account;
}

Accounts.prototype.getAllAccounts = function () {
	return private.accounts;
}

Accounts.prototype.getDelegates = function (publicKey) {
	var account = self.getAccountByPublicKey(publicKey);
	return account.delegates;
}

Accounts.prototype.existsUnconfirmedUsername = function (username) {
	return !!private.unconfirmedNames[username.toLowerCase()];
}

Accounts.prototype.existsUsername = function (username) {
	return !!private.username2address[username.toLowerCase()];
}


//events
Accounts.prototype.onBind = function (scope) {
	modules = scope;
}

//export
module.exports = Accounts;