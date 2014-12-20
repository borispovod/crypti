var ed = require('ed25519'),
	bignum = require('bignum'),
	ByteBuffer = require("bytebuffer"),
	crypto = require('crypto'),
	genesisblock = require('../helpers/genesisblock.js'),
	constants = require("../helpers/constants.js"),
	blockHelper = require("../helpers/block.js"),
	timeHelper = require("../helpers/time.js"),
	signatureHelper = require("../helpers/signature.js"),
	transactionHelper = require("../helpers/transaction.js");

var Router = require('../helpers/router.js');
var async = require('async');

// private
var modules, library, self;

function Signatures(cb, scope) {
	library = scope;
	self = this;

	var router = new Router();

	router.use(function (req, res, next) {
		if (modules) return next();
		res.status(500).send({success: false, error: 'loading'});
	});

	router.get('/get', function (req, res) {
		if (!req.query.id) {
			return res.json({success: false, error: "Provide id in url"});
		}
		self.get(req.query.id, function (err, signature) {
			if (!signature || err) {
				return res.json({success: false, error: "Signature not found"});
			}
			return res.json({success: true, signature: signature});
		});
	});

	router.put('/', function (req, res) {
		var secret = req.body.secret,
			secondSecret = req.body.secondSecret || req.body.secondSecret || null,
			publicKey = new Buffer(req.body.publicKey, 'hex');

		var hash = crypto.createHash('sha256').update(secret, 'utf8').digest();
		var keypair = ed.MakeKeypair(hash);

		if (publicKey) {
			if (keypair.publicKey.toString('hex') != new Buffer(publicKey).toString('hex')) {
				return res.json({success: false, error: "Please, provide valid secret key of your account"});
			}
		}

		var account = modules.accounts.getAccountByPublicKey(keypair.publicKey);

		if (!account) {
			return res.json({success: false, error: "Account doesn't has balance"});
		}

		if (!account.publicKey) {
			return res.json({success: false, error: "Open account to make transaction"});
		}

		if (account.secondSignature) {
			return res.json({success: false, error: "Second signature already enabled"});
		}

		var transaction = {
			type : 2,
			subtype : 0,
			amount : 0,
			recipientId : null,
			senderPublicKey : account.publicKey,
			timestamp: timeHelper.getNow()
		}

		var signature = self.newSignature(secret, secondSecret);
		transaction.asset = signature;

		modules.transaction.sign(secret, transaction);

		transaction.id = transactionHelper.getId(transaction);

		self.processUnconfirmedTransaction(transaction, true, function (err) {
			if (err) {
				return res.json({success: false, error: err});
			} else {
				return res.json({success: true, transaction: transaction});
			}
		});
	});

	router.use(function (req, res, next) {
		res.status(500).send({success: false, error: 'api not found'});
	});

	library.app.use('/api/signatures', router);
	library.app.use(function (err, req, res, next) {
		library.logger.error('/api/signatures', err)
		if (!err) return next();
		res.status(500).send({success: false, error: err});
	});

	setImmediate(cb, null, self);
}

Signatures.prototype.newSignature = function (secert, secondSecret) {
	var hash1 = crypto.createHash('sha256').update(secret, 'utf8').digest();
	var keypair1 = ed.MakeKeypair(hash1);

	var hash2 = crypto.createHash('sha256').update(secondSecret, 'utf8').digest();
	var keypair2 = ed.MakeKeypair(hash2);

	var signature = {
		timestamp : timeHelper.getNow(),
		publicKey : keypair2.publicKey,
		generatorPublicKey : keypair1.publicKey
	}

	signature.signature = s.sign(signature, secondSecretPhrase);
	signature.generationSignature = s.signGeneration(signature, secretPhrase);
	signature.id = signatureHelper.getId(signature);

	return s;
}

Signatures.prototype.sign = function (signature, secondSecret) {
	var hash = signatureHelper.getHash(signature);
	var passHash = crypto.createHash('sha256').update(secondSecret, 'utf8').digest();
	var keypair = ed.MakeKeypair(passHash);
	return ed.Sign(hash, keypair);
}

Signatures.prototype.secondSignature = function (signature, secret) {
	var hash = signatureHelper.getHash(signature);
	var passHash = crypto.createHash('sha256').update(secret, 'utf8').digest();
	var keypair = ed.MakeKeypair(passHash);
	return ed.Sign(hash, keypair);
}

Signatures.prototype.parseSignature = function (signature) {
	signature.publicKey = new Buffer(signature.publicKey);
	signature.generatorPublicKey = new Buffer(signature.generatorPublicKey);
	signature.signature = new Buffer(signature.signature);
	signature.generationSignature = new Buffer(signature.generationSignature);

	return signature;
}

Signatures.prototype.get = function (id, cb) {
	var stmt = library.db.prepare("select s.id s_id, s.transactionId s_transactionId, s.timestamp s_timestamp, s.publicKey s_publicKey, s.generatorPublicKey s_generatorPublicKey, s.signature s_signature, s.generationSignature s_generationSignature " +
	"from signatures s " +
	"where s.id = ?");

	stmt.bind(id);

	stmt.get(function (err, row) {
		var signature = row && blockHelper.getSignature(row);
		cb(err, signature);
	});
}

Signatures.prototype.run = function (scope) {
	modules = scope;
}

module.exports = Signatures;