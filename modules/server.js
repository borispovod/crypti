//require
var util = require('util');
var async = require('async');
var path = require('path');
var Router = require('../helpers/router.js');

//private
var modules, library, self;

//constructor
function Server(cb, scope) {
	library = scope;
	self = this;

	var router = new Router();

	router.use(function (req, res, next) {
		if (modules) return next();
		res.status(500).send({success: false, error: 'loading'});
	});

	router.get('/', function (req, res) {
		var ip = req.connection.remoteAddress;

		var showLinkToAdminPanel = library.config.adminPanel.whiteList.length && library.config.adminPanel.whiteList.indexOf(ip) >= 0;

		if (modules.loader.loaded()) {
			res.render('wallet.html', {showAdmin: showLinkToAdminPanel, layout: false});
		} else {
			res.render('loading.html');
		}
	});

	router.get("/panel/forging", function (req, res) {
		res.render('forging.html');
	});

	router.use(function (req, res, next) {
		if (req.url.indexOf('/api/') == -1 && req.url.indexOf('/peer/') == -1) {
			return res.redirect('/');
		}
		next();
		//res.status(500).send({success: false, error: 'api not found'});
	});

	library.app.use('/', router);

	setImmediate(cb, null, self);
}

//public
Server.prototype.run = function (scope) {
	modules = scope;

	//library.app.get("*", function (req, res) {
	//	return res.redirect('/');
	//});
}

Server.prototype.onBlockchainReady = function () {
	//for (var i = 0; i < library.app._router.stack.length; i++) {
	//	var route = library.app._router.stack[i];
	//
	//	if (route.route && route.route.path == '*') {
	//		library.app._router.stack.splice(i, 1);
	//		break;
	//	}
	//}
}


Server.prototype.onPeerReady = function () {
	//library.app.get("*", function (req, res) {
	//	return res.redirect('/');
	//});
}

//export
module.exports = Server;