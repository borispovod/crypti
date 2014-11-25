//require
var util = require('util');
var async = require('async');
var express = require('express');
var path = require('path');
var app = express();
var doT = require('express-dot');
var configFunctions = {
	readConfig: require("../../config").readConfig,
	writeConfig: require("../../config").writeConfig
}

//private
var modules, library;

//constructor
function Server(cb, scope) {
	library = scope;

	app.configure(function () {
		app.use(express.compress());
		app.set('views', path.join(__dirname, 'public'));
		app.set('view engine', 'html');
		app.engine('html', doT.__express);

        app.use(express.json());
        app.use(express.urlencoded());

        app.api = {
			whiteList: library.config.api.access.whiteList,
			auth: library.config.api.access.auth
		};

		if (library.config.serveHttpWallet) {
			app.use(express.static(path.join(__dirname, "public")));
		}


		if (app.api.auth.user || app.api.auth.password) {
			app.basicAuth = express.basicAuth(app.api.auth.user, app.api.auth.password);
		} else {
			app.basicAuth = function (req, res, next) {
				return next();
			}
		}

		app.use(app.router);
	});

	app.listen(library.config.port, library.config.address, function () {
		library.logger.info("Crypti started: " + library.config.address + ":" + library.config.port);

		app.get('/', function (req, res) {
			var ip = req.connection.remoteAddress;

			var showLinkToAdminPanel = false;

			if (app.forgingConfig.whiteList.length > 0 && app.forgingConfig.whiteList.indexOf(ip) >= 0) {
				showLinkToAdminPanel = true;
			}

			if (app.api.whiteList.length > 0) {
				if (app.api.whiteList.indexOf(ip) < 0) {
					return res.send(401);
				} else {
					if (app.dbLoaded) {
						res.render('wallet', {showAdmin: showLinkToAdminPanel, layout: false});
					} else {
						res.sendfile(path.join(__dirname, "public", "loading.html"));
					}
				}
			} else {
				if (app.dbLoaded) {
					res.render('wallet', {showAdmin: showLinkToAdminPanel, layout: false});
				} else {
					res.sendfile(path.join(__dirname, "public", "loading.html"));
				}
			}
		});

		app.get("/api/getLoading", function (req, res) {
			if (app.blockchain.getLastBlock() && app.blocksCount) {
				return res.json({
					success: true,
					height: app.blockchain.getLastBlock().height,
					blocksCount: app.blocksCount,
					loaded: app.dbLoaded
				});
			} else {
				return res.json({success: false});
			}
		});

		app.get("*", function (req, res) {
			return res.redirect('/');
		});

		cb();
	});

	cb(null, this);
}

//public
Server.prototype.run = function (scope) {
	modules = scope;
}

//export
module.exports = Server;