var ed = require('ed25519'),
	bignum = require('bignum'),
	ByteBuffer = require("bytebuffer"),
	crypto = require('crypto'),
	genesisblock = require('../helpers/genesisblock.js'),
	constants = require("../helpers/constants.js"),
	blockHelper = require("../helpers/block.js");

var Router = require('../helpers/router.js');
var async = require('async');

// private
var modules, library, self;

function Signatures(cb, scope) {
	library = scope;
	self = this;

	var router = new Router();

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
		return res.json({});
	});

	library.app.use('/api/signatures', router);

	setImmediate(cb, null, self);
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