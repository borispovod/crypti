async = require('async');

var config = {
	"db": "./blockchain.db",
	"modules": {
        "server": "./modules/server.js",
        "accounts": "./modules/accounts.js",
        "transactions": "./modules/transactions.js",
        "blocks": "./modules/blocks.js",
        "transport": "./modules/transport.js"
    }
}

var d = require('domain').create();
d.on('error', function (er) {
	console.error('domain master', er.message, er.stack);
	process.exit(0);
});
d.run(function () {
	async.auto({
		config: function (cb) {
			var config = require("./config.json");
			cb(null, config);
		},

		logger: function (cb) {
			var logger = require('./logger.js');
			cb(null, logger);
		},

		express: ['config', 'logger', function (cb, scope) {
			var express = require('express');
			var app = express();

			app.listen(scope.config.port, scope.config.address, function (err) {
				scope.logger.info("Crypti started: " + scope.config.address + ":" + scope.config.port);
				cb(err, {
					express: express,
					app: app
				})
			});
		}],

		db: function (cb, scope) {
			var sqlite3 = require('./helpers/db.js');
			sqlite3.connect(config.db, cb);
		},

		modules: ['db', 'express', 'config', 'logger', function (cb, scope) {
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
		}],
        loadBlocks : ['modules', function (cb, scope) {
            scope.modules.blocks.loadBlocks(function (err) {
                cb(err);
            });
        }]
	}, function (err, scope) {
		if (err) {
			console.log(err)
		}
	});
});