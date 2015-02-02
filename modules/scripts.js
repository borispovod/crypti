var crypto = require('crypto'),
	bignum = require('bignum'),
	ed = require('ed25519'),
	params = require('../helpers/params.js'),
	slots = require('../helpers/slots.js'),
	Router = require('../helpers/router.js');

//private fields
var modules, library, self;

var version, osName, port, sharePort;

//constructor
function Scripts(cb, scope) {
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

	router.put('/', function (req, res) {
		var secret = params.string(req.body.secret, true),
			publicKey = params.string(req.body.publicKey, true),
			secondSecret = params.string(req.body.secondSecret, true),
			code = params.string(req.body.code, true),
			parameters = params.object(req.body.parameters, true),
			name = params.string(req.body.name, true),
			description = params.string(req.body.description, true);

		if (!secret) {
			return res.json({success: false, error: "Please, provide secret passphrase of your account"});
		}

		var hash = crypto.createHash('sha256').update(secret, 'utf8').digest();
		var keypair = ed.MakeKeypair(hash);

		if (publicKey) {
			if (keypair.publicKey.toString('hex') != publicKey) {
				return res.json({success: false, error: "Please, provide valid secret key of your account"});
			}
		}

		if (!code) {
			return res.json({success: false, error: "Please, provide code"});
		}

		if (!parameters) {
			return res.json({success: false, error: "Please, provide parameters"});
		}

		if (!name || name.length == 0) {
			return res.json({success: false, error: "Please, provide name"});
		}

		if (name.length > 16) {
			return res.json({success: false, error: "Max length of name is 16 characters"});
		}

		if (description && description.length > 140)  {
			return res.json({success: false, error: "Max length of description is 140 characters"});
		}

		try {
			parameters = JSON.stringify(parameters);
		} catch (e) {
			return res.json({success: false, error: "Please, provide correct parameters"});
		}

		if (Buffer.byteLength(code, 'utf8') > 1024 * 4) {
			return res.json({success: false, error: "Script must be less 4kb"});
		}

		if (Buffer.byteLength(parameters, 'utf8') > 1024 * 4) {
			return res.json({success: false, error: "Params must be less 4kb"});
		}

		var account = modules.accounts.getAccountByPublicKey(keypair.publicKey.toString('hex'));

		if (!account) {
			return res.json({success: false, error: "Account doesn't has balance"});
		}

		if (!account.publicKey) {
			return res.json({success: false, error: "Open account to make transaction"});
		}

		var script = {
			code: new Buffer(code, 'utf8').toString('hex'),
			parameters: new Buffer(parameters, 'utf8').toString('hex'),
			name : name,
			description : description
		}

		var transaction = {
			type: 4,
			amount: 0,
			recipientId: null,
			senderPublicKey: account.publicKey,
			timestamp: slots.getTime(),
			asset: {
				script: script
			}
		};

		modules.transactions.sign(secret, transaction);

		if (account.secondSignature) {
			if (!secondSecret || secondSecret.length == 0) {
				return res.json({success: false, error: "Provide second secret key"});
			}

			modules.transactions.secondSign(secondSecret, transaction);
		}

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

	library.app.use('/api/scripts', router);
	library.app.use(function (err, req, res, next) {
		if (!err) return next();
		library.logger.error('/api/scripts', err)
		res.status(500).send({success: false, error: err});
	});
}

//public methods
Scripts.prototype.evaluate = function (scriptId) {
	return false;
}

//events
Scripts.prototype.onBind = function (scope) {
	modules = scope;
}

Scripts.prototype.getScript = function (transactionId, cb) {
	var fields = ['name', 'description', 'transactionId', 'code', 'parameters'];
	library.dbLite.query("SELECT name, description, transactionId, lower(hex(code)), lower(hex(parameters)) FROM scripts WHERE transactionId=$transactionId", {transactionId: transactionId}, fields, function (err, rows) {
		setImmediate(cb, err, rows.length > 0? rows[0] : null);
	});
}

Scripts.prototype.onNewBlock = function (block, broadcast) {
	/*block.transactions.forEach(function(transaction){
		if (transaction.type == 4){
			var js = new Buffer(transaction.asset.script.code, 'hex').toString();
			eval(js);
		}
	})*/
}

//export
module.exports = Scripts;