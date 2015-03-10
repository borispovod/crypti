var crypto = require('crypto'),
	bignum = require('bignum'),
	ed = require('ed25519'),
	params = require('../helpers/params.js'),
	slots = require('../helpers/slots.js'),
	Router = require('../helpers/router.js');

//private
var modules, library, self;

var accounts = {};

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
}

function accountApplyDiff(account, diff) {
	for (var i = 0; i < diff.length; i++) {
		var math = diff[i][0];
		var publicKey = diff[i].slice(1);

		if (math == "+") {
			account.delegates = account.delegates || [];

			var index = account.delegates.indexOf(publicKey);
			if (index != -1) {
				throw "delegate already added";
			}

			account.delegates.push(publicKey);
		}
		if (math == "-") {
			var index = account.delegates.indexOf(publicKey);
			if (index == -1) {
				throw "delegate not found";
			}
			account.delegates.splice(index, 1);
			if (!account.delegates.length) {
				account.delegates = null;
			}
		}
	}
}

function accountApplyUnconfirmedDiff(account, diff) {
	for (var i = 0; i < diff.length; i++) {
		var math = diff[i][0];
		var publicKey = diff[i].slice(1);

		if (math == "+") {
			account.unconfirmedDelegates = account.unconfirmedDelegates || [];

			var index = account.unconfirmedDelegates.indexOf(publicKey);
			if (index != -1) {
				throw "delegate already added";
			}

			account.unconfirmedDelegates.push(publicKey);
		}
		if (math == "-") {
			var index = account.unconfirmedDelegates.indexOf(publicKey);
			if (index == -1) {
				throw "delegate not found";
			}
			account.unconfirmedDelegates.splice(index, 1);
			if (!account.unconfirmedDelegates.length) {
				account.unconfirmedDelegates = null;
			}
		}
	}
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
	accountApplyUnconfirmedDiff(this, diff);

	// what we most do here?
	library.bus.message('changeUnconfirmedDelegates', this.balance, diff);
}

Account.prototype.undoUnconfirmedDelegateList = function (diff) {
	if (diff === null) return;
	var copyDiff = diff.slice();
	for (var i = 0; i < copyDiff.length; i++) {
		var math = copyDiff[i][0] == '-' ? '+' : '-';
		copyDiff[i] = math + copyDiff[i].slice(1);
	}

	accountApplyUnconfirmedDiff(this, copyDiff);

	// and here?
	library.bus.message('changeUnconfirmedDelegates', this.balance, copyDiff);
}

Account.prototype.applyDelegateList = function (diff) {
	if (diff === null) return;
	accountApplyDiff(this, diff);

	library.bus.message('changeDelegates', this.balance, diff);
}

Account.prototype.undoDelegateList = function (diff) {
	if (diff === null) return;
	var copyDiff = diff.slice();
	for (var i = 0; i < copyDiff.length; i++) {
		var math = copyDiff[i][0] == '-' ? '+' : '-';
		copyDiff[i] = math + copyDiff[i].slice(1);
	}

	accountApplyDiff(this, copyDiff);

	library.bus.message('changeDelegates', this.balance, copyDiff);
}

//constructor
function Accounts(cb, scope) {
	library = scope;
	self = this;

	attachApi();

	setImmediate(cb, null, self);
}

//private methods
function attachApi() {
	var router = new Router();

	router.use(function (req, res, next) {
		if (modules) return next();
		res.status(500).send({success: false, error: 'loading'});
	});

	router.post('/open', function (req, res) {
		var secret = params.string(req.body.secret);

		if (!secret) {
			return res.json({success: false, error: "Provide secret key of account"});
		}

		var account = openAccount(secret);

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

	router.get('/getBalance', function (req, res) {
		var address = params.string(req.query.address);

		if (!address) {
			return res.json({success: false, error: "Provide address in url"});
		}

		var account = self.getAccount(address);
		var balance = account ? account.balance : 0;
		var unconfirmedBalance = account ? account.unconfirmedBalance : 0;

		return res.json({success: true, balance: balance, unconfirmedBalance: unconfirmedBalance});
	});

	if (process.env.DEBUG && process.env.DEBUG.toUpperCase() == "TRUE") {
		// for sebastian
		router.get('/getAllAccounts', function (req, res) {
			return res.json({success: true, accounts: accounts});
		});
	}


	if (process.env.TOP && process.env.TOP.toUpperCase() == "TRUE") {
		router.get('/top', function (req, res) {
			var arr = Object.keys(accounts).map(function (key) {
				return accounts[key]
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
		var address = params.string(req.query.address);

		if (!address) {
			return res.json({success: false, error: "Provide address in url"});
		}

		var account = self.getAccount(address);

		if (!account || !account.publicKey) {
			return res.json({success: false, error: "Account public key can't be found "});
		}

		return res.json({success: true, publicKey: account.publicKey});
	});

	router.post("/generatePublicKey", function (req, res) {
		var secret = params.string(req.body.secret);

		if (!secret) {
			return res.json({success: false, error: "Provide secret key to generate public key"});
		}

		var account = openAccount(secret);
		return res.json({success: true, publicKey: account.publicKey});
	});

	router.get("/delegates", function (req, res) {
		var address = params.string(req.query.address);

		if (!address) {
			return res.json({success: false, error: "Provide address in url"});
		}

		var account = self.getAccount(address);

		if (!account) {
			return res.json({success: false, error: "Account doesn't found"});
		}

		var delegates = null;

		if (account.delegates) {
			delegates = account.delegates.map(function(publicKey){
				return modules.delegates.getDelegateByPublicKey(publicKey);
			});
		}

		return res.json({success: true, delegates: delegates});
	});

	router.put("/delegates", function (req, res) {
		var secret = params.string(req.body.secret),
			publicKey = params.hex(req.body.publicKey || null, true),
			secondSecret = params.string(req.body.secondSecret, true),
			delegates = params.array(req.body.delegates, true);

		var hash = crypto.createHash('sha256').update(secret, 'utf8').digest();
		var keypair = ed.MakeKeypair(hash);

		if (publicKey) {
			if (keypair.publicKey.toString('hex') != publicKey) {
				return res.json({success: false, error: "Please, provide valid secret key of your account"});
			}
		}

		if (delegates && delegates.length > 33) {
			return res.json({success: false, error: "Please, provide less 33 delegates"});
		}

		var account = self.getAccountByPublicKey(keypair.publicKey.toString('hex'));

		if (!account) {
			return res.json({success: false, error: "Account doesn't has balance"});
		}

		if (!account.publicKey) {
			return res.json({success: false, error: "Open account to make transaction"});
		}

		var transaction = {
			type: 3,
			amount: 0,
			recipientId: account.address,
			senderPublicKey: account.publicKey,
			timestamp: slots.getTime(),
			asset: {
				votes: delegates
			}
		};

		modules.transactions.sign(secret, transaction);

		if (account.secondSignature) {
			if (!secondSecret) {
				return res.json({success: false, error: "Provide second secret key"});
			}

			modules.transactions.secondSign(secondSecret, transaction);
		}

		library.sequence.add(function (cb) {
			modules.transactions.processUnconfirmedTransaction(transaction, true, cb);
		}, function (err) {
			if (err) {
				return res.json({success: false, error: err});
			}

			res.json({success: true, transaction: transaction});
		});
	});

	router.get("/", function (req, res) {
		var address = params.string(req.query.address);

		if (!address) {
			return res.json({success: false, error: "Provide address in url"});
		}

		var account = self.getAccount(address);

		if (!account) {
			return res.json({success: false, error: "Account not found"});
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
	})

	router.use(function (req, res, next) {
		res.status(500).send({success: false, error: 'api not found'});
	});

	library.app.use('/api/accounts', router);
	library.app.use(function (err, req, res, next) {
		if (!err) return next();
		library.logger.error('/api/accounts', err)
		res.status(500).send({success: false, error: err.toString()});
	});
}

function addAccount(account) {
	if (!accounts[account.address]) {
		accounts[account.address] = account;
	}
}

function openAccount(secret) {
	var hash = crypto.createHash('sha256').update(secret, 'utf8').digest();
	var keypair = ed.MakeKeypair(hash);

	return self.getAccountOrCreateByPublicKey(keypair.publicKey.toString('hex'));
}

//public methods
Accounts.prototype.getAccount = function (id) {
	return accounts[id];
}

Accounts.prototype.getAccountByPublicKey = function (publicKey) {
	var address = self.getAddressByPublicKey(publicKey);
	return self.getAccount(address);
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

Accounts.prototype.getAccountOrCreateByPublicKey = function (publicKey) {
	var address = self.getAddressByPublicKey(publicKey);
	var account = self.getAccount(address);

	if (account && !account.publicKey) {
		account.publicKey = publicKey;
	}

	if (!account) {
		account = new Account(address, publicKey);
		addAccount(account);
	}
	return account;
}

Accounts.prototype.getAccountOrCreateByAddress = function (address) {
	var account = self.getAccount(address);

	if (!account) {
		account = new Account(address);
		addAccount(account);
	}
	return account;
}

Accounts.prototype.getAllAccounts = function () {
	return accounts;
}

Accounts.prototype.getDelegates = function (publicKey) {
	var account = self.getAccountByPublicKey(publicKey);
	return account.delegates;

}

//events
Accounts.prototype.onBind = function (scope) {
	modules = scope;
}

//export
module.exports = Accounts;