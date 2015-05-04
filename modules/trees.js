var ed = require('ed25519'),
	ByteBuffer = require("bytebuffer"),
	crypto = require('crypto'),
	constants = require("../helpers/constants.js"),
	slots = require('../helpers/slots.js'),
	RequestSanitizer = require('../helpers/request-sanitizer.js'),
	Router = require('../helpers/router.js'),
	async = require('async'),
	TransactionTypes = require('../helpers/transaction-types.js'),
	errorCode = require('../helpers/errorCodes.js').error;

// private fields
var modules, library, self, private = {};

function Tree() {
	this.create = function (data, trs) {

	}

	this.calculateFee = function (trs) {
	}

	this.verify = function (trs, sender, cb) {

	}

	this.getBytes = function (trs) {

	}

	this.apply = function (trs, sender) {
	}

	this.undo = function (trs, sender) {
	}

	this.applyUnconfirmed = function (trs, sender, cb) {
	}

	this.undoUnconfirmed = function (trs, sender) {
	}

	this.objectNormalize = function (trs) {
	}

	this.dbRead = function (raw) {

	}

	this.dbSave = function (dbLite, trs, cb) {

	}

	this.ready = function (trs) {
		return true;
	}
}

//constructor
function Trees(cb, scope) {
	library = scope;
	self = this;
	self.__private = private;
	attachApi();

	library.logic.transaction.attachAssetType(TransactionTypes.Tree, new Tree());

	setImmediate(cb, null, self);
}

//private methods
function attachApi() {
	var router = new Router();

	router.use(function (req, res, next) {
		if (modules) return next();
		res.status(500).send({success: false, error: errorCode('COMMON.LOADING')});
	});

	router.use(function (req, res, next) {
		res.status(500).send({success: false, error: errorCode('COMMON.INVALID_API')});
	});

	library.network.app.use('/api/signatures', router);
	library.network.app.use(function (err, req, res, next) {
		if (!err) return next();
		library.logger.error(req.url, err.toString());
		res.status(500).send({success: false, error: err.toString()});
	});
}

//public methods

//events
Trees.prototype.onBind = function (scope) {
	modules = scope;
}

module.exports = Trees;