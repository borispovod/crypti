//require
var util = require('util');
var async = require('async');
var path = require('path');
var doT = require('express-dot');

//private
var modules, library;

//constructor
function Server(cb, scope) {
	library = scope;

	library.express.app.configure(function () {
		library.express.app.use(library.express.express.compress());
		library.express.app.set('views', path.join(__dirname, '/../', 'public'));
		library.express.app.set('view engine', 'html');
		library.express.app.engine('html', doT.__express);

		library.express.app.use(library.express.express.json());
		library.express.app.use(library.express.express.urlencoded());

		library.express.app.api = {
			whiteList: library.config.api.access.whiteList,
			auth: library.config.api.access.auth
		};

		if (library.config.serveHttpWallet) {
			library.express.app.use(library.express.express.static(path.join(__dirname, '/../', 'public')));
		}


		if (library.express.app.api.auth.user || library.express.app.api.auth.password) {
			library.express.app.basicAuth = library.express.express.basicAuth(library.express.app.api.auth.user, library.express.app.api.auth.password);
		} else {
			library.express.app.basicAuth = function (req, res, next) {
				return next();
			}
		}

		library.express.app.use(library.express.app.router);
	});


	library.express.app.get('/', function (req, res) {
		var ip = req.connection.remoteAddress;

		var showLinkToAdminPanel = false;

		if (library.config.adminPanel.whiteList.length > 0 && library.config.adminPanel.whiteList.indexOf(ip) >= 0) {
			showLinkToAdminPanel = true;
		}

		if (library.express.app.api.whiteList.length > 0) {
			if (library.express.app.api.whiteList.indexOf(ip) < 0) {
				return res.send(401);
			} else {
				res.render('wallet', {showAdmin: showLinkToAdminPanel, layout: false});
				//res.sendfile(path.join(__dirname, "public", "loading.html"));
			}
		} else {
			res.render('wallet', {showAdmin: showLinkToAdminPanel, layout: false});
			//res.sendfile(path.join(__dirname, "public", "loading.html"));
		}
	});

	library.express.app.get("/api/getLoading", function (req, res) {
		if (modules.blocks.getLastBlock()) {
			return res.json({
				success: true,
				height: modules.blocks.getLastBlock().height,
				blocksCount: modules.blocks.getAll().length,
				loaded: true
			});
		} else {
			return res.json({success: false});
		}
	});

	library.express.app.get("*", function (req, res) {
		return res.redirect('/');
	});
	cb(null, this);
}

//public
Server.prototype.run = function (scope) {
	modules = scope;
}

//export
module.exports = Server;