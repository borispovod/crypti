var crypto = require('crypto'),
	bignum = require('bignum'),
	ed = require('ed25519'),
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

	router.put('/', function (req, res, next) {
		req.sanitize("body", {
			secret : "string!",
			publicKey : "string?",
			code : {
				required : true,
				string : true,
				maxByteLength : 4 * 1024
			},
			parameters : {
				required : true,
				object : true,
				maxByteLength : 4 * 1024
			},
			name : {
				required : true,
				string : true,
				minLength : 1,
				maxLength : 16
			},
			description : {
				string : true,
				maxLength : 140
			}
		}, function(err, report, body) {
			if (err) return next(err);
			if (! report.isValid) return res.json({success: false, error: report.issues});

			var secret = body.secret,
				publicKey = body.publicKey,
				secondSecret = body.secondSecret,
				code = body.code,
				parameters = body.parameters,
				name = body.name,
				description = body.description;

			var hash = crypto.createHash('sha256').update(secret, 'utf8').digest();
			var keypair = ed.MakeKeypair(hash);

			if (publicKey) {
				if (keypair.publicKey.toString('hex') != publicKey) {
					return res.json({success: false, error: "Please, provide valid secret key of your account"});
				}
			}

			try {
				parameters = JSON.stringify(parameters);
			} catch (e) {
				return res.json({success: false, error: "Please, provide correct parameters"});
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
			};

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