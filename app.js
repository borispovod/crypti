var Logger = require('./logger.js');
var logger = new Logger({echo: true, errorLevel: "log"});
var async = require('async');

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
		"loader": "./modules/loader.js",
		"forger": "./modules/forger.js",
		"system": "./modules/system.js"
	}
}

var d = require('domain').create();
d.on('error', function (err) {
	console.log(err);
	logger.error('domain master', {message: err.message, stack: err.stack});
	process.exit(0);
});
d.run(function () {
	var modules = [];
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

		bus: function(cb){
			var changeCase = require('change-case');
			var bus = function(){
				this.message = function(topic, body){
					modules.forEach(function(module){
						if (typeof(module['on' + changeCase.pascalCase(topic)]) == 'function') {
							module['on' + changeCase.pascalCase(topic)](body);
						}
					})
				}
			}
			cb(null, new bus)
		},

		db: function (cb) {
			var sqlite3 = require('./helpers/db.js');
			sqlite3.connect(config.db, cb);
		},

		modules: ['db', 'express', 'app', 'config', 'logger', 'bus', function (cb, scope) {
			var tasks = {};
			Object.keys(config.modules).forEach(function (name) {
				tasks[name] = function (cb) {
					var Klass = new require(config.modules[name]);
					modules.push(new Klass(cb, scope));
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
			});
			cb();
		}]
	}, function (err, scope) {
		if (err) {
			logger.fatal(err)
		}
	});
});