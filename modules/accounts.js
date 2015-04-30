var crypto = require('crypto'),
	bignum = require('../helpers/bignum.js'),
	ed = require('ed25519'),
	slots = require('../helpers/slots.js'),
	Router = require('../helpers/router.js'),
	util = require('util'),
	constants = require('../helpers/constants.js'),
	RequestSanitizer = require('../helpers/request-sanitizer.js'),
	TransactionTypes = require('../helpers/transaction-types.js'),
	errorCode = require('../helpers/errorCodes.js').error;

//private
var modules, library, self, private = {};

private.accounts = {};
private.username2address = {};

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
	this.following = [];
	this.unconfirmedFollowing = [];
	this.isDAppAccount = false;
	this.isUnconfirmedDAppAccount = false;
}

function accountApplyDiff(account, diff) {
	var tmp = account.delegates ? account.delegates.slice() : null

	for (var i = 0; i < diff.length; i++) {
		var math = diff[i][0];
		var publicKey = diff[i].slice(1);

		if (math == "+") {
			account.delegates = account.delegates || [];

			var index = -1;
			if (account.delegates) {
				index = account.delegates.indexOf(publicKey);
			}
			if (index != -1) {
				account.delegates = tmp;
				return false;
			}

			if (account.delegates && account.delegates.length >= 101) {
				account.delegates = tmp;
				return false;
			}

			account.delegates.push(publicKey);
		}
		if (math == "-") {
			var index = -1;
			if (account.delegates) {
				index = account.delegates.indexOf(publicKey);
			}
			if (index == -1) {
				account.delegates = tmp;
				return false;
			}
			account.delegates.splice(index, 1);
			if (!account.delegates.length) {
				account.delegates = null;
			}
		}
	}
	return true;
}

function accountApplyUnconfirmedDiff(account, diff) {
	var tmp = account.unconfirmedDelegates ? account.unconfirmedDelegates.slice() : null

	for (var i = 0; i < diff.length; i++) {
		var math = diff[i][0];
		var publicKey = diff[i].slice(1);

		if (math == "+") {
			account.unconfirmedDelegates = account.unconfirmedDelegates || [];

			var index = -1;
			if (account.unconfirmedDelegates) {
				index = account.unconfirmedDelegates.indexOf(publicKey);
			}
			if (index != -1) {
				account.unconfirmedDelegates = tmp;
				return false;
			}

			if (account.unconfirmedDelegates && account.unconfirmedDelegates.length >= 101) {
				account.unconfirmedDelegates = tmp;
				return false;
			}

			account.unconfirmedDelegates.push(publicKey);
		}
		if (math == "-") {
			var index = -1;
			if (account.unconfirmedDelegates) {
				index = account.unconfirmedDelegates.indexOf(publicKey);
			}
			if (index == -1) {
				account.unconfirmedDelegates = tmp;
				return false;
			}
			account.unconfirmedDelegates.splice(index, 1);
			if (!account.unconfirmedDelegates.length) {
				account.unconfirmedDelegates = null;
			}
		}
	}
	return true;
}

Account.prototype.setUnconfirmedSignature = function (unconfirmedSignature) {
	this.unconfirmedSignature = unconfirmedSignature;
}

Account.prototype.setSecondSignature = function (secondSignature) {
	this.secondSignature = secondSignature;
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
	var isValid = accountApplyUnconfirmedDiff(this, diff);

	isValid && library.bus.message('changeUnconfirmedDelegates', this.balance, diff);

	return isValid;
}

Account.prototype.undoUnconfirmedDelegateList = function (diff) {
	if (diff === null) return;
	var copyDiff = diff.slice();
	for (var i = 0; i < copyDiff.length; i++) {
		var math = copyDiff[i][0] == '-' ? '+' : '-';
		copyDiff[i] = math + copyDiff[i].slice(1);
	}

	var isValid = accountApplyUnconfirmedDiff(this, copyDiff);

	isValid && library.bus.message('changeUnconfirmedDelegates', this.balance, copyDiff);

	return isValid;
}

Account.prototype.applyDelegateList = function (diff) {
	if (diff === null) return;
	var isValid = accountApplyDiff(this, diff);

	isValid && library.bus.message('changeDelegates', this.balance, diff);

	return isValid;
}

Account.prototype.undoDelegateList = function (diff) {
	if (diff === null) return;
	var copyDiff = diff.slice();
	for (var i = 0; i < copyDiff.length; i++) {
		var math = copyDiff[i][0] == '-' ? '+' : '-';
		copyDiff[i] = math + copyDiff[i].slice(1);
	}

	var isValid = accountApplyDiff(this, copyDiff);

	isValid && library.bus.message('changeDelegates', this.balance, copyDiff);

	return isValid;
}

Account.prototype.applyUsername = function (username) {
	private.username2address[username.toLowerCase()] = this.address;
}

Account.prototype.undoUsername = function (username) {
	delete private.username2address[username.toLowerCase()];
}

Account.prototype.applyContact = function (address) {
	var index = this.following.indexOf(address);
	if (index != -1) {
		return false;
	}
	this.following.push(address);
	return true;
}

Account.prototype.undoContact = function (address) {
	var index = this.following.indexOf(address);
	if (index == -1) {
		return false;
	}
	this.following.splice(index, 1);
}

Account.prototype.applyUnconfirmedContact = function (address) {
	var index = this.unconfirmedFollowing.indexOf(address);
	if (index != -1) {
		return false;
	}
	this.unconfirmedFollowing.push(address);
	return true;
}

Account.prototype.undoUnconfirmedContact = function (address) {
	var index = this.unconfirmedFollowing.indexOf(address);
	if (index == -1) {
		return false;
	}
	this.unconfirmedFollowing.splice(index, 1);
}

function Vote() {
	this.create = function (data, trs) {
		trs.recipientId = data.sender.address;
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

		if (trs.asset.votes && trs.asset.votes.length > 33) {
			return setImmediate(cb, errorCode("VOTES.MAXIMUM_DELEGATES_VOTE", trs));
		}

		if (!modules.delegates.checkUnconfirmedDelegates(trs.senderPublicKey, trs.asset.votes)) {
			return setImmediate(cb, errorCode("VOTES.ALREADY_VOTED_UNCONFIRMED", trs));
		}

		if (!modules.delegates.checkDelegates(trs.senderPublicKey, trs.asset.votes)) {
			return setImmediate(cb, errorCode("VOTES.ALREADY_VOTED_CONFIRMED", trs));
		}

		setImmediate(cb, null, trs);
	}

	this.getBytes = function (trs) {
		return trs.asset.votes ? new Buffer(trs.asset.votes.join(''), 'utf8') : null;
	}

	this.apply = function (trs, sender) {
		sender.applyDelegateList(trs.asset.votes);

		return true;
	}

	this.undo = function (trs, sender) {
		sender.undoDelegateList(trs.asset.votes);

		return true;
	}

	this.applyUnconfirmed = function (trs, sender, cb) {
		var res = sender.applyUnconfirmedDelegateList(trs.asset.votes);

		setImmediate(cb, !res ? "Can't apply delegates: " + trs.id : null);
	}

	this.undoUnconfirmed = function (trs, sender) {
		return sender.undoUnconfirmedDelegateList(trs.asset.votes);
	}

	this.objectNormalize = function (trs) {
		trs.asset.votes = RequestSanitizer.array(trs.asset.votes, true);

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

		//if (trs.asset.username.alias.search(/(admin|genesis|delegate|crypti)/i) > -1) {
		//	return cb("username containing the words Admin, Genesis, Delegate or Crypti cannot be claimed");
		//}

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

		setImmediate(cb, null, trs);
	}

	this.getBytes = function (trs) {
		return new Buffer(trs.asset.username.alias, 'utf8');
	}

	this.apply = function (trs, sender) {
		sender.applyUsername(trs.asset.username);

		return true;
	}

	this.undo = function (trs, sender) {
		sender.undoUsername(trs.asset.username);

		return true;
	}

	this.applyUnconfirmed = function (trs, sender, cb) {
		sender.applyUnconfirmedUsername(trs.asset.username);

		setImmediate(cb);
	}

	this.undoUnconfirmed = function (trs, sender) {
		sender.undoUnconfirmedUsername(trs.asset.username);

		return true;
	}

	this.objectNormalize = function (trs) {
		var report = RequestSanitizer.validate(trs.asset.username, {
			object: true,
			properties: {
				alias: "string!",
				publicKey: "hex!"
			}
		});

		if (!report.isValid) {
			throw Error(report.issues);
		}

		trs.asset.delegate = report.value;

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
			secret: "string!"
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

	router.get('/getBalance', function (req, res) {
		req.sanitize("query", {
			address: "string!"
		}, function (err, report, query) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

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

	router.get('/getPublicKey', function (req, res) {
		req.sanitize("query", {
			address: "string!"
		}, function (err, report, query) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			var account = self.getAccount(query.address);

			if (!account || !account.publicKey) {
				return res.json({success: false, error: errorCode("ACCOUNTS.ACCOUNT_PUBLIC_KEY_NOT_FOUND", {address: query.address})});
			}

			return res.json({success: true, publicKey: account.publicKey});
		});
	});

	router.post("/generatePublicKey", function (req, res, next) {
		req.sanitize("body", {
			secret: "string!"
		}, function (err, report, query) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			var account = private.openAccount(query.secret);
			return res.json({success: true, publicKey: account.publicKey});
		});

	});

	router.get("/delegates", function (req, res, next) {
		req.sanitize("query", {
			address: "string!"
		}, function (err, report, query) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});


			var account = self.getAccount(query.address);

			if (!account) {
				return res.json({success: false, error: errorCode("ACCOUNTS.ACCOUNT_DOESNT_FOUND", {address: query.address})});
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

	router.put("/delegates", function (req, res, next) {
		req.sanitize("body", {
			secret: "string!",
			publicKey: "hex?",
			secondSecret: "string?",
			delegates: "array?"
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

	router.put("/username", function (req, res, next) {
		req.sanitize("body", {
			secret: "string!",
			publicKey: "hex?",
			secondSecret: "string?",
			username: "string!"
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
		req.sanitize("query", {
			address: "string!"
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
	return private.accounts[id];
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

	return this.getAccount(address);
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

var sandboxApi = {
	'test' : function (message, cb) {
		console.log(message);
		setImmediate(cb);
	}
}

Accounts.prototype.sandbox = function (message, callback) {
	var data = message.data || [];
	data.push(callback);

	return sandboxHelper.applySandboxApi(message, sandboxApi, callback);
}

//events
Accounts.prototype.onBind = function (scope) {
	modules = scope;
}

//export
module.exports = Accounts;