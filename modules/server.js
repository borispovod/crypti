var util = require('util'),
	async = require('async'),
	path = require('path'),
	Router = require('../helpers/router.js');

//private fields
var modules, library, self, private;

var loaded = false

//constructor
function Server(cb, scope) {
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

	router.get('/', function (req, res) {
		if (loaded) {
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

	library.app.use('/', router);
}

//public methods

//events
Server.prototype.onBind = function (scope) {
	modules = scope;
}

Server.prototype.onBlockchainReady = function(){
	loaded = true;
}

//export
module.exports = Server;