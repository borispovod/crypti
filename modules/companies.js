var transactionHelper = require('../helpers/transaction.js'),
	ed = require('ed25519'),
	bignum = require('bignum'),
	ByteBuffer = require("bytebuffer"),
	crypto = require('crypto'),
	genesisblock = require('../helpers/genesisblock.js'),
	blockHelper = require("../helpers/block.js");
var Router = require('../helpers/router.js');
var async = require('async');

// private
var modules, library, self;

function Companies(cb, scope) {
	library = scope;
	self = this;

	var router = new Router();

	router.use(function (req, res, next) {
		if (modules) return next();
		res.status(500).send({success: false, error: 'loading'});
	});

	router.get('/get', function (req, res) {
		if (!req.query.id && !req.query.address) {
			return res.json({success: false, error: "Provide id or address in url"});
		}
		self.find({id: req.query.id, address: req.query.address}, function (err, company) {
			if (!company || err) {
				return res.json({success: false, error: "Company not found"});
			}
			return res.json({success: true, company: company});
		});
	});

	router.use(function (req, res, next) {
		res.status(500).send({success: false, error: 'api not found'});
	});

	library.app.use('/api/companies', router);
	library.app.use(function (err, req, res, next) {
		library.logger.error('/api/companies', err)
		if (!err) return next();
		res.status(500).send({success: false, error: err});
	});

	setImmediate(cb, null, self);
}

Companies.prototype.find = function (filter, cb) {
	var params = {}, fields = [];
	if (filter.id) {
		fields.push('id = $id')
		params.$id = filter.id;
	}
	if (filter.address) {
		fields.push('address = $address')
		params.$address = filter.address;
	}

	var stmt = library.db.prepare("select c.id c_id, c.transactionId c_transactionId, c.name c_name, c.description c_description, c.domain c_domain, c.email c_email, c.timestamp c_timestamp, c.generatorPublicKey c_generatorPublicKey, c.signature c_signature " +
	"from companies as c " +
	(fields.length ? "where " + fields.join(' or ') : '') + " ");

	stmt.bind(params);

	stmt.get(function (err, row) {
		var company = row && blockHelper.getCompany(row);
		cb(err, company);
	});
}

Companies.prototype.run = function (scope) {
	modules = scope;
}

module.exports = Companies;