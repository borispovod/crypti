var crypto = require('crypto'),
	bignum = require('bignum'),
	ed = require('ed25519'),
	params = require('../helpers/params.js');

var Router = require('../helpers/router.js');

//private
var modules, library, self;
var accounts;

//public
function Account(address, publicKey, balance, unconfirmedBalance) {
	this.address = address;
	this.publicKey = publicKey;
	this.balance = balance || 0;
	this.unconfirmedBalance = unconfirmedBalance || 0;
	this.unconfirmedSignature = false;
	this.secondSignature = false;
	this.secondPublicKey = false;
}

Account.prototype.setUnconfirmedSignature = function (unconfirmedSignature) {
	this.unconfirmedSignature = unconfirmedSignature;
}

Account.prototype.setSecondSignature = function (secondSignature) {
	this.secondSignature = secondSignature;
}

Account.prototype.addToBalance = function (amount) {
	this.balance += amount;
}

Account.prototype.addToUnconfirmedBalance = function (amount) {
	this.unconfirmedBalance += amount;
}

Account.prototype.setBalance = function (balance) {
	this.balance = balance;
}

Account.prototype.setUnconfirmedBalance = function (unconfirmedBalance) {
	this.unconfirmedBalance = unconfirmedBalance;
}

function Accounts(cb, scope) {
	self = this;
	library = scope;
	accounts = {};

	var router = new Router();

	router.use(function (req, res, next) {
		if (modules) return next();
		res.status(500).send({success: false, error: 'loading'});
	});

	router.post('/open', function (req, res) {
		if (!req.body.secret || req.body.secret.length == 0) {
			return res.json({success: false, error: "Provide secret key of account"});
		}

		var account = self.openAccount(req.body.secret);

		return res.json({
			success: true, account: {
				address: account.address,
				unconfirmedBalance: account.unconfirmedBalance,
				balance: account.balance,
				publicKey: account.publicKey.toString('hex'),
				unconfirmedSignature : account.unconfirmedSignature,
				secondSignature : account.secondSignature,
				secondPublicKey : account.secondPublicKey? account.secondPublicKey.toString('hex') : null
			}
		});
	});

	router.get('/getBalance', function (req, res) {
		if (!req.query.address) {
			return res.json({success: false, error: "Provide address in url"});
		}

		var account = self.getAccount(req.query.address);
		var balance = account ? account.balance : 0;
		var unconfirmedBalance = account ? account.unconfirmedBalance : 0;

		return res.json({success: true, balance: balance, unconfirmedBalance: unconfirmedBalance});
	});

	router.get('/getPublicKey', function (req, res) {
		if (!req.query.address) {
			return res.json({success: false, error: "Provide address in url"});
		}

		var account = self.getAccount(req.query.address);

		if (!account || !account.publicKey) {
			return res.json({success: false, error: "Account public key can't be found "});
		}

		return res.json({success: true, publicKey: account.publicKey});
	});

	router.post("/generatePublicKey", function (req, res) {
		if (!req.body.secret) {
			return res.json({success: false, error: "Provide secret key to generate public key"});
		}

		var account = self.openAccount(req.body.secret);
		return res.json({success: true, publicKey: account.publicKey});
	});

	router.get("/", function (req, res) {
		var address = req.query.address;

		if (!address) {
			return res.json({success: false, error: "Provide address in url"});
		}

		var account = self.getAccount(req.query.address);

		if (!account) {
			return res.json({ success : false, error : "Account not found" });
		}

		return res.json({
			success: true, account: {
				address: account.address,
				unconfirmedBalance: account.unconfirmedBalance,
				balance: account.balance,
				publicKey: account.publicKey? account.publicKey.toString('hex') : null,
				unconfirmedSignature : account.unconfirmedSignature,
				secondSignature : account.secondSignature,
				secondPublicKey : account.secondPublicKey? account.secondPublicKey.toString('hex') : null
			}
		});
	})

	router.use(function (req, res, next) {
		res.status(500).send({success: false, error: 'api not found'});
	});

	library.app.use('/api/accounts', router);
	library.app.use(function (err, req, res, next) {
		library.logger.error('/api/accounts', err)
		if (!err) return next();
		res.status(500).send({success: false, error: err});
	});

	setImmediate(cb, null, self);
}

Accounts.prototype.addAccount = function (account) {
	if (!accounts[account.address]) {
		accounts[account.address] = account;
	}
}

Accounts.prototype.getAccount = function (id) {
	return accounts[id];
}

Accounts.prototype.getAccountByPublicKey = function (publicKey) {
	var address = this.getAddressByPublicKey(publicKey);
	return this.getAccount(address);
}

Accounts.prototype.getAddressByPublicKey = function (publicKey) {
	var publicKeyHash = crypto.createHash('sha256').update(publicKey).digest();
	var temp = new Buffer(8);
	for (var i = 0; i < 8; i++) {
		temp[i] = publicKeyHash[7 - i];
	}

	var address = bignum.fromBuffer(temp).toString() + "C";
	return address;
}

Accounts.prototype.getAccountOrCreate = function (addressOrPublicKey) {
	var account, address, publicKey;

	if (typeof(addressOrPublicKey) == 'string') {
		address = addressOrPublicKey;
		account = this.getAccount(address);
	} else {
		publicKey = addressOrPublicKey;
		address = this.getAddressByPublicKey(publicKey);
		account = this.getAccount(address);

		if (account && !account.publicKey) {
			account.publicKey = publicKey;
		}
	}

	if (!account) {
		account = new Account(address, publicKey);
		this.addAccount(account);
		return account;
	} else {
		return account;
	}
}

Accounts.prototype.getAllAccounts = function () {
	return accounts;
}

Accounts.prototype.openAccount = function (secret) {
	var hash = crypto.createHash('sha256').update(secret, 'utf8').digest();
	var keypair = ed.MakeKeypair(hash);

	return this.getAccountOrCreate(keypair.publicKey);
}

Accounts.prototype.run = function (scope) {
	modules = scope;
}

module.exports = Accounts;