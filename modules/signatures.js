var ed = require('ed25519'),
	bignum = require('bignum'),
	ByteBuffer = require("bytebuffer"),
	crypto = require('crypto'),
	genesisblock = require('../helpers/genesisblock.js'),
	constants = require("../helpers/constants.js"),
	relational = require("../helpers/relational.js"),
	slots = require('../helpers/slots.js'),
	signatureHelper = require("../helpers/signature.js"),
	transactionHelper = require("../helpers/transaction.js"),
	params = require('../helpers/params.js'),
	Router = require('../helpers/router.js'),
	async = require('async');

// private fields
var modules, library, self;

//constructor
function Signatures(cb, scope) {
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
			publicKey = params.string(req.body.publicKey);

		var hash = crypto.createHash('sha256').update(secret, 'utf8').digest();
		var keypair = ed.MakeKeypair(hash);

		if (secret.length == 0) {
			return res.json({success: false, error: "Provide secret key"});
		}

		if (secondSecret.length == 0) {
			return res.json({success: false, error: "Provide second secret key"});
		}

		if (publicKey.length > 0) {
			if (keypair.publicKey.toString('hex') != publicKey) {
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

		if (account.secondSignature || account.unconfirmedSignature) {
			return res.json({success: false, error: "Second signature already enabled"});
		}

		var signature = self.newSignature(secret, secondSecret);
		var transaction = {
			type: 1,
			amount: 0,
			recipientId: null,
			senderPublicKey: account.publicKey,
			timestamp: slots.getTime(),
			asset: {
				signature: signature,
				votes: modules.delegates.getVotesByType(2)
			}
		};

		modules.transactions.sign(secret, transaction);

		transaction.id = transactionHelper.getId(transaction);

		modules.transactions.processUnconfirmedTransaction(transaction, true, function (err) {
			if (err) {
				return res.json({success: false, error: err});
			}
			res.json({success: true, transaction: transaction});
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
}

function newSignature(secret, secondSecret) {
	var hash1 = crypto.createHash('sha256').update(secret, 'utf8').digest();
	var keypair1 = ed.MakeKeypair(hash1);

	var hash2 = crypto.createHash('sha256').update(secondSecret, 'utf8').digest();
	var keypair2 = ed.MakeKeypair(hash2);

	var signature = {
		timestamp: slots.getTime(),
		publicKey: keypair2.publicKey.toString('hex'),
		generatorPublicKey: keypair1.publicKey.toString('hex')
	}

	signature.signature = sign(signature, secondSecret);
	signature.generationSignature = secondSignature(signature, secret);
	signature.id = signatureHelper.getId(signature);

	return signature;
}

function sign(signature, secondSecret) {
	var hash = signatureHelper.getHash(signature);
	var passHash = crypto.createHash('sha256').update(secondSecret, 'utf8').digest();
	var keypair = ed.MakeKeypair(passHash);
	return ed.Sign(hash, keypair).toString('hex');
}

function secondSignature(signature, secret) {
	var hash = signatureHelper.getHash(signature);
	var passHash = crypto.createHash('sha256').update(secret, 'utf8').digest();
	var keypair = ed.MakeKeypair(passHash);
	return ed.Sign(hash, keypair).toString('hex');
}

//public methods
Signatures.prototype.get = function (id, cb) {
	var stmt = library.db.prepare("select s.id s_id, s.transactionId s_transactionId, s.timestamp s_timestamp, s.publicKey s_publicKey, s.generatorPublicKey s_generatorPublicKey, s.signature s_signature, s.generationSignature s_generationSignature " +
	"from signatures s " +
	"where s.id = $id");

	stmt.bind({
		$id: id
	});

	stmt.get(function (err, row) {
		if (err || !row) {
			return cb(err || "Can't find signature: " + id);
		}

		var signature = relational.getSignature(row, false, true);
		cb(null, signature);
	});
}

//events
Signatures.prototype.onBind = function (scope) {
	modules = scope;
}

module.exports = Signatures;