var Logger = require('./logger.js');
var appConfig = require("./config.json");
var logger = new Logger({echo: appConfig.consoleLogLevel, errorLevel: appConfig.fileLogLevel});
var async = require('async');
var compression = require('compression');

process.on('uncaughtException', function (err) {
	// handle the error safely
	logger.fatal('system error', {message: err.message, stack: err.stack});
});

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
		"system": "./modules/system.js",
		"peer": "./modules/peer.js"
	}
}

var d = require('domain').create();
d.on('error', function (err) {
	logger.fatal('domain master', {message: err.message, stack: err.stack});
	//process.exit(0);
});
d.run(function () {
	var modules = [];
	async.auto({
		config: function (cb) {
			cb(null, appConfig);
		},

		logger: function (cb) {
			cb(null, logger);
		},

		express: function (cb) {
			var express = require('express');
			cb(null, express);
		},

		sequence: function (cb) {
			var sequence = [];
			process.nextTick(function nextSequenceTick() {
				var task = sequence.shift();
				if (!task) {
					return setTimeout(nextSequenceTick, 100);
				}
				task(function () {
					setTimeout(nextSequenceTick, 100);
				});
			});
			cb(null, {
				add: function (worker, done) {
					sequence.push(function (cb) {
						if (worker && typeof(worker) == 'function') {
							worker(function (err, res) {
								setImmediate(cb);
								done && setImmediate(done, err, res);
							});
						} else {
							setImmediate(cb);
							done && setImmediate(done);
						}
					});
				}
			});
		},

		app: ['config', 'logger', 'express', 'sequence', function (cb, scope) {
			var app = scope.express();
			var path = require('path');
			var bodyParser = require('body-parser');
			var methodOverride = require('method-override');

			app.engine('html', require('ejs').renderFile);
			app.use(require('express-domain-middleware'));
			app.set('view engine', 'ejs');
			app.set('views', path.join(__dirname, 'public'));
			app.use(compression())
			app.use(scope.express.static(path.join(__dirname, 'public')));
			app.use(bodyParser.urlencoded({extended: true, parameterLimit: 5000}));
			app.use(bodyParser.json());
			app.use(methodOverride());

			app.use(function (req, res, next) {
				var parts = req.url.split('/');
				var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

				if (parts.length > 1) {
					if (parts[1] == 'api') {
						if (scope.config.api.access.whiteList.length > 0) {
							if (scope.config.api.access.whiteList.indexOf(ip) < 0) {
								res.sendStatus(403);
							} else {
								next();
							}
						} else {
							next();
						}
					} else if (parts[1] == 'peer') {
						if (scope.config.peers.blackList.length > 0) {
							if (scope.config.peers.blackList.indexOf(ip) >= 0) {
								res.sendStatus(403);
							} else {
								next();
							}
						} else {
							next();
						}
					} else if (parts[1] == 'forging' || parts[1] == 'panel') {
						if (scope.config.adminPanel.whiteList.length > 0) {
							if (scope.config.adminPanel.whiteList.indexOf(ip) < 0) {
								res.sendStatus(403);
							} else {
								next();
							}
						} else {
							next();
						}
					} else {
						next();
					}
				} else {
					next();
				}
			});

			app.listen(scope.config.port, scope.config.address, function (err) {
				scope.logger.log("Crypti started: " + scope.config.address + ":" + scope.config.port);

				cb(err, app);
			});
		}],

		bus: function (cb) {
			var changeCase = require('change-case');
			var bus = function () {
				this.message = function () {
					var args = [];
					Array.prototype.push.apply(args, arguments);
					var topic = args.shift();
					modules.forEach(function (module) {
						var eventName = 'on' + changeCase.pascalCase(topic);
						if (typeof(module[eventName]) == 'function') {
							module[eventName].apply(module[eventName], args);
						}
					})
				}
			}
			cb(null, new bus)
		},



		dbLite : function (cb) {
			var dbLite = require('./helpers/dbLite.js');
			dbLite.connect(config.db, cb);
		},

		modules: ['dbLite', 'express', 'app', 'config', 'logger', 'bus', function (cb, scope) {
			var tasks = {};
			Object.keys(config.modules).forEach(function (name) {
				tasks[name] = function (cb) {
					var d = require('domain').create();
					d.on('error', function (err) {
						scope.logger.fatal('domain ' + name, {message: err.message, stack: err.stack});
					});
					d.run(function () {
						logger.debug('loading module', name)
						var Klass = require(config.modules[name]);
						var obj = new Klass(cb, scope)
						modules.push(obj);
					});
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