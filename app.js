var program = require('commander');
var packageJson = require('./package.json');
var Logger = require('./logger.js');
var appConfig = require("./config.json");
var async = require('async');
var extend = require('extend');
var path = require('path');
var https = require('https');
var fs = require('fs');

program
	.version(packageJson.version)
	.option('-c, --config <path>', 'Config file path')
	.option('-p, --port <port>', 'Listening port number')
	.option('-a, --address <ip>', 'Listening host name or ip')
	.option('-b, --blockchain <path>', 'Blockchain db path')
	.option('-x, --peers [peers...]', 'Peers list')
	.option('-l, --log <level>', 'Log level')
	.parse(process.argv);

if (program.config) {
	extend(appConfig, require(path.resolve(process.cwd(), program.config)));
}

if (program.port) {
	appConfig.port = program.port;
}

if (program.address) {
	appConfig.address = program.address;
}

if (program.peers) {

	if (typeof program.peers === 'string') {
		appConfig.peers.list = program.peers.split(',').map(function (peer) {
			peer = peer.split(":");
			return {
				ip: peer.shift(),
				port: peer.shift() || appConfig.port
			};
		});
	} else {
		appConfig.peers.list = [];
	}
}

if (program.log) {
	appConfig.consoleLogLevel = program.log;
}

process.on('uncaughtException', function (err) {
	// handle the error safely
	logger.fatal('system error', {message: err.message, stack: err.stack});
});

var config = {
	"db": program.blockchain || "./blockchain.db",
	"modules": {
		"server": "./modules/server.js",
		"accounts": "./modules/accounts.js",
		"transactions": "./modules/transactions.js",
		"blocks": "./modules/blocks.js",
		"signatures": "./modules/signatures.js",
		"transport": "./modules/transport.js",
		"loader": "./modules/loader.js",
		"system": "./modules/system.js",
		"peer": "./modules/peer.js",
		"delegates": "./modules/delegates.js",
		"round": "./modules/round.js",
		"contacts": "./modules/contacts.js",
		"multisignatures": "./modules/multisignatures.js"
	}
}

var logger = new Logger({echo: appConfig.consoleLogLevel, errorLevel: appConfig.fileLogLevel});

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

		build: function (cb) {
			cb(null, fs.readFileSync('./build', 'utf8').trim());
		},

		network: ['config', function (cb, scope) {
			var express = require('express');
			var app = express();
			var server = require('http').createServer(app);
			var io = require('socket.io')(server);

			if (scope.config.ssl.enabled) {
				var privateKey = fs.readFileSync(scope.config.ssl.options.key);
				var certificate = fs.readFileSync(scope.config.ssl.options.cert);

				var https = require('https').createServer({
					key: privateKey,
					cert: certificate
				}, app);

				var https_io = require('socket.io')(https);
			}

			cb(null, {
				express: express,
				app: app,
				server: server,
				io: io,
				https: https,
				https_io: https_io
			});
		}],

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

		connect: ['config', 'logger',  'build', 'network', function (cb, scope) {
			var path = require('path');
			var bodyParser = require('body-parser');
			var methodOverride = require('method-override');
			var requestSanitizer = require('./helpers/request-sanitizer');

			scope.network.app.engine('html', require('ejs').renderFile);
			scope.network.app.use(require('express-domain-middleware'));
			scope.network.app.set('view engine', 'ejs');
			scope.network.app.set('views', path.join(__dirname, 'public'));
			scope.network.app.use(scope.network.express.static(path.join(__dirname, 'public')));
			scope.network.app.use(bodyParser.urlencoded({extended: true, parameterLimit: 5000}));
			scope.network.app.use(bodyParser.json());
			scope.network.app.use(methodOverride());
			scope.network.app.use(requestSanitizer.express());

			scope.network.app.use(function (req, res, next) {
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
					} else {
						next();
					}
				} else {
					next();
				}
			});

			scope.network.server.listen(scope.config.port, scope.config.address, function (err) {
				scope.logger.log("Crypti started: " + scope.config.address + ":" + scope.config.port);

				if (!err) {
					if (scope.config.ssl.enabled) {
						scope.network.https.listen(scope.config.ssl.options.port, scope.config.ssl.options.address, function (err) {
							scope.logger.log("Crypti https started: " + scope.config.ssl.options.address + ":" + scope.config.ssl.options.port);

							cb(err, scope.network);
						});
					} else {
						cb(null, scope.network);
					}
				} else {
					cb(err, scope.network);
				}
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

		dbLite: function (cb) {
			var dbLite = require('./helpers/dbLite.js');
			dbLite.connect(config.db, cb);
		},

		logic: ['dbLite', function (cb, scope) {
			var Transaction = require('./logic/transaction.js');
			var Block = require('./logic/block.js');
			var Account = require('./logic/account.js');

			async.auto({
				transaction: function (cb) {
					new Transaction(scope.dbLite, cb);
				},
				block: ["transaction", function (cb, lscope) {
					new Block(scope.dbLite, function (err, block) {
						block.logic = {
							transaction: lscope.transaction
						}
						cb(null, block);
					});
				}],
				account: function (cb) {
					new Account(scope.dbLite, cb);
				}
			}, cb);
		}],

		modules: ['network', 'connect', 'config', 'logger', 'bus', 'sequence', 'dbLite', 'logic', function (cb, scope) {
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
				if (typeof(scope.modules[name].onBind) == 'function') {
					scope.modules[name].onBind(scope.modules);
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
