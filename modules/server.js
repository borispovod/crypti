//require
var util = require('util');
var async = require('async');
var path = require('path');
var Router = require('../helpers/router.js');

//private
var modules, library;
var router = new Router();

//constructor
function Server(cb, scope) {
	library = scope;

	cb(null, this);
}

//public
Server.prototype.run = function (scope) {
	modules = scope;

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

	library.app.use("/", router);

	library.app.get("*", function (req, res) {
		return res.redirect('/');
	});
}

Server.prototype.onBlockchainReady = function () {
	for (var i = 0; i < library.app._router.stack.length; i++) {
		var route = library.app._router.stack[i];

		if (route.route && route.route.path == '*') {
			library.app._router.stack.splice(i, 1);
			break;
		}
	}
}


Server.prototype.onPeerReady = function () {
	library.app.get("*", function (req, res) {
		return res.redirect('/');
	});

	library.app.use(function errorHandler(err, req, res, next) {
		library.logger.error('Bad Request', {method: req.method, url: req.url, message: err});
		res.send(500, "Something bad happened. :(");
		if (err.domain) {
			//you should think about gracefully stopping & respawning your server
			//since an unhandled error might put your application into an unknown state
		}
	});
}

//export
module.exports = Server;