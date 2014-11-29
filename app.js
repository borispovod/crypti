async = require('async');
var Logger = require('./logger.js');
var logger = new Logger();

var config = {
	"db": "./blockchain.db",
	"modules": {
		"server": "./modules/server.js",
		"accounts": "./modules/accounts.js",
		"transactions": "./modules/transactions.js",
		"blocks": "./modules/blocks.js",
		"companies": "./modules/companies.js",
		"signatures": "./modules/signatures.js",
		"transport": "./modules/transport.js",
		"loader": "./modules/loader.js"
	}
}

var d = require('domain').create();
d.on('error', function (er) {
	logger.error('domain master', {message: er.message, stack: er.stack});
	process.exit(0);
});
d.run(function () {
	async.auto({
		config: function (cb) {
			var config = require("./config.json");
			cb(null, config);
		},

		logger: function (cb) {
			cb(null, logger);
		},

		express: function (cb) {
			var express = require('express');
			cb(null, express);
		},

		app: ['config', 'logger', 'express', function (cb, scope) {
			var app = scope.express();
			var path = require('path');
			var bodyParser = require('body-parser');
			var methodOverride = require('method-override');

			app.engine('html', require('ejs').renderFile);
			app.set('view engine', 'ejs');
			app.set('views', path.join(__dirname, 'public'));
			app.use(scope.express.static(path.join(__dirname, 'public')));
			app.use(bodyParser.urlencoded({extended: true, parameterLimit: 5000}));
			app.use(bodyParser.json());
			app.use(methodOverride());

			app.listen(scope.config.port, scope.config.address, function (err) {
				scope.logger.info("Crypti started: " + scope.config.address + ":" + scope.config.port);
				cb(err, app)
			});
		}],

		db: function (cb) {
			var sqlite3 = require('./helpers/db.js');
			sqlite3.connect(config.db, cb);
		},

		modules: ['db', 'express', 'app', 'config', 'logger', function (cb, scope) {
			var tasks = {};
			Object.keys(config.modules).forEach(function (name) {
				tasks[name] = function (cb) {
					var Klass = new require(config.modules[name]);
					new Klass(cb, scope);
				}
			});
			async.parallel(tasks, function (err, results) {
				cb(err, results);
			});
		}],
		ready: ['modules', function (cb, scope) {
			// need to load it as it written in config: server, accounts and etc.
			Object.keys(scope.modules).forEach(function (name) {
				if (typeof(scope.modules[name].run) == 'function') {
					scope.modules[name].run(scope.modules);
				}
			})
		}]
	}, function (err, scope) {
		if (err) {
			logger.fatal(err)
		}
	});
});