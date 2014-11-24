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

	if (process.env.NODE_ENV == "development") {
		app.set('onlyToFile', false);
	} else {
		app.set('onlyToFile', true);
	}

	app.configure(function () {
		app.set("version", library.config.version);
		app.set("address", library.config.address);
		app.set('port', library.config.port);
		app.set("config", library.config);

		app.use(express.compress());
		app.use(express.bodyParser({limit: '300mb'}));

		app.set('views', path.join(__dirname, 'public'));
		app.set('view engine', 'html');
		app.engine('html', doT.__express);

		app.writePassphrase = function (passphrase) {
			try {
				var jsonString = configFunctions.readConfig();

				var json = JSON.parse(jsonString);

				json.forging.secretPhrase = passphrase;
				jsonString = JSON.stringify(json, null, 4);

				configFunctions.writeConfig(jsonString);

				return true;
			} catch (e) {
				library.logger.error("Can't write/read config: " + e);
				return false;
			}
		}

		app.api = {
			whiteList: config.get('api').access.whiteList,
			auth: config.get('api').access.auth
		};

		if (config.get("serveHttpWallet")) {
			app.use(express.static(path.join(__dirname, "public")));
		}

		app.use(express.json());
		app.use(express.urlencoded());

		app.use(function (req, res, next) {
			var version = req.headers['version'],
				sharePort = req.headers['shareport']

			var url = req.path.split('/');

			var ip = req.connection.remoteAddress;
			var port = config.get('port');

			if (url[1] == 'peer' && app.synchronizedBlocks) {
				if (sharePort != "true" || version != app.get("config").get('version')) {
					if (app.peerprocessor.peers[ip]) {
						app.peerprocessor.peers[ip] = null;
						delete app.peerprocessor.peers[ip];
					}

					return next();
				} else {
					sharePort = true;
				}

				var newPeer = new peer(ip, port, version, sharePort);
				newPeer.setApp(app);
				app.peerprocessor.addPeer(newPeer);
			} else if (url[1] == 'api' || req.path == '' || req.path == '/') {
				if (app.api.whiteList.length > 0) {
					if (app.api.whiteList.indexOf(ip) < 0) {
						return res.send(401);
					}
				}
			}

			return next();
		});


		if (app.api.auth.user || app.api.auth.password) {
			app.basicAuth = express.basicAuth(app.api.auth.user, app.api.auth.password);
		} else {
			app.basicAuth = function (req, res, next) {
				return next();
			}
		}

		app.use(app.router);
	});

	app.listen(app.get('port'), app.get('address'), function () {
		logger.getInstance().info("Crypti started: " + app.get("address") + ":" + app.get("port"));
		console.log("Crypti started: " + app.get("address") + ":" + app.get("port"));

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