//require
var util = require('util');
var async = require('async');
var path = require('path');
var Router = require('../helpers/router.js');

//private
var modules, library;

//constructor
function Server(cb, scope) {
	library = scope;

	cb(null, this);
}

//public
Server.prototype.run = function (scope) {
	modules = scope;

	var router = new Router();

	if (library.config.api.access.auth.user || library.config.api.access.auth.password) {
		library.app.basicAuth = library.express.basicAuth(library.config.api.access.auth.user, library.config.api.access.auth.password);
	} else {
		library.app.basicAuth = function (req, res, next) {
			return next();
		}
	}

	router.get('/', function (req, res) {
		var ip = req.connection.remoteAddress;

		var showLinkToAdminPanel = library.config.adminPanel.whiteList.length && library.config.adminPanel.whiteList.indexOf(ip) >= 0;

		if (library.config.api.access.whiteList.length > 0) {
			if (library.config.api.access.whiteList.indexOf(ip) < 0) {
				return res.send(401);
			} else {
				if (modules.loader.loaded()) {
					res.render('wallet.html', {showAdmin: showLinkToAdminPanel, layout: false});
				} else {
					res.render('loading.html');
				}
			}
		} else {
			if (modules.loader.loaded()) {
				res.render('wallet.html', {showAdmin: showLinkToAdminPanel, layout: false});
			} else {
				res.render('loading.html');
			}
		}
	});

	router.get("/panel/forging", function (req, res) {
		res.render('forging.html');
	});

	library.app.use('/', router);
}

Server.prototype.onPeerReady = function () {
	var router = new Router();

	router.get("*", function (req, res) {
		return res.redirect('/');
	});

	library.app.use('/', router);
}

//export
module.exports = Server;