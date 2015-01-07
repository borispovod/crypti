var ed = require('ed25519'),
	bignum = require('bignum'),
	ByteBuffer = require("bytebuffer"),
	crypto = require('crypto'),
	genesisblock = require('../helpers/genesisblock.js'),
	constants = require("../helpers/constants.js"),
	blockHelper = require("../helpers/block.js"),
	timeHelper = require("../helpers/time.js"),
	signatureHelper = require("../helpers/signature.js"),
	transactionHelper = require("../helpers/transaction.js"),
	params = require('../helpers/params.js')

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
		var id = params.string(req.query.id);

		if (!id || id.length == 0) {
			return res.json({success: false, error: "Provide id in url"});
		}

		self.get(id, function (err, signature) {
			if (!signature || err) {
				return res.json({success: false, error: "Signature not found"});
			}

			return res.json({success: true, signature: signature});
		});
	});

	router.put('/', function (req, res) {
		var secret = params.string(req.body.secret),
			secondSecret = params.string(req.body.secondSecret),
			publicKey = params.buffer(req.body.publicKey, 'hex');

		var hash = crypto.createHash('sha256').update(secret, 'utf8').digest();
		var keypair = ed.MakeKeypair(hash);

		if (secret.length == 0) {
			return res.json({success: false, error: "Provide secret key"});
		}

		if (secondSecret.length == 0) {
			return res.json({success: false, error: "Provide second secret key"});
		}

		if (publicKey.length > 0) {
			if (keypair.publicKey.toString('hex') != publicKey.toString('hex')) {
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

		if (account.secondSignature || account.unconfirmedSignature) {
			return res.json({success: false, error: "Second signature already enabled"});
		}

		var signature = self.newSignature(secret, secondSecret);
		var transaction = {
			type: 2,
			subtype: 0,
			amount: 0,
			recipientId: null,
			senderPublicKey: account.publicKey,
			timestamp: timeHelper.getNow(),
			asset: {
				signature: signature
			}
		};

		modules.transactions.sign(secret, transaction);

		transaction.id = transactionHelper.getId(transaction);

		modules.transactions.processUnconfirmedTransaction(transaction, true, function (err) {
			if (err) {
				return res.json({success: false, error: err});
			}
			res.json({success: true, transactionId: transaction.id, publicKey: transaction.asset.signature.publicKey.toString('hex') });
		});
	});

	router.use(function (req, res, next) {
		res.status(500).send({success: false, error: 'api not found'});
	});

	library.app.use('/api/signatures', router);
	library.app.use(function (err, req, res, next) {
		err && library.logger.error('/api/signatures', err)
		if (!err) return next();
		res.status(500).send({success: false, error: err});
	});

	setImmediate(cb, null, self);
}

Signatures.prototype.newSignature = function (secret, secondSecret) {
	var hash1 = crypto.createHash('sha256').update(secret, 'utf8').digest();
	var keypair1 = ed.MakeKeypair(hash1);

	var hash2 = crypto.createHash('sha256').update(secondSecret, 'utf8').digest();
	var keypair2 = ed.MakeKeypair(hash2);

	var signature = {
		timestamp: timeHelper.getNow(),
		publicKey: keypair2.publicKey,
		generatorPublicKey: keypair1.publicKey
	}

	signature.signature = this.sign(signature, secondSecret);
	signature.generationSignature = this.secondSignature(signature, secret);
	signature.id = signatureHelper.getId(signature);

	return signature;
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
	signature.id = params.string(signature.id);
	signature.transactionId = params.string(signature.transactionId);
	signature.timestamp = params.int(signature.timestamp);
	signature.publicKey = params.buffer(signature.publicKey);
	signature.generatorPublicKey = params.buffer(signature.generatorPublicKey);
	signature.signature = params.buffer(signature.signature);
	signature.generationSignature = params.buffer(signature.generationSignature);

	return signature;
}

Signatures.prototype.get = function (id, cb) {
	var stmt = library.db.prepare("select s.id s_id, s.transactionId s_transactionId, s.timestamp s_timestamp, s.publicKey s_publicKey, s.generatorPublicKey s_generatorPublicKey, s.signature s_signature, s.generationSignature s_generationSignature " +
	"from signatures s " +
	"where s.id = $id");

	stmt.bind({
		$id : id
	});

	stmt.get(function (err, row) {
		if (err || !row) {
			return cb(err || "Can't find signature: " + id);
		}

		var signature = blockHelper.getSignature(row,false, true);
		cb(null, signature);
	});
}

Signatures.prototype.run = function (scope) {
	modules = scope;
}

module.exports = Signatures;