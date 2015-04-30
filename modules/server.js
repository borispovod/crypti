var util = require('util'),
	async = require('async'),
	path = require('path'),
	Router = require('../helpers/router.js'),
	errorCode = require('../helpers/errorCodes.js').error;

//private fields
var modules, library, self, private = {};

private.loaded = false

//constructor
function Server(cb, scope) {
	library = scope;
	self = this;
	self.__private = private;
	attachApi();

	setImmediate(cb, null, self);
}

//private methods
function attachApi() {
	var router = new Router();

	router.use(function (req, res, next) {
		if (modules) return next();
		res.status(500).send({success: false, error: errorCode('COMMON.LOADING')});
	});

	router.get('/', function (req, res) {
		if (private.loaded) {
			res.render('wallet.html', {layout: false});
		} else {
			res.render('loading.html');
		}
	});

	router.use(function (req, res, next) {
		if (req.url.indexOf('/api/') == -1 && req.url.indexOf('/peer/') == -1) {
			return res.redirect('/');
		}
		next();
		//res.status(500).send({success: false, error: 'api not found'});
	});

	library.network.app.use('/', router);
}

//public methods

//events
Server.prototype.onBind = function (scope) {
	modules = scope;
}

Server.prototype.onBlockchainReady = function () {
	private.loaded = true;
}

//export
module.exports = Server;