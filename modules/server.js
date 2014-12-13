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

	library.app.use('/', router);
}

Server.prototype.onPeerReady = function () {
	var router = new Router();

	router.get("*", function (req, res) {
		return res.redirect('/');
	});

	library.app.use('/', router);

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