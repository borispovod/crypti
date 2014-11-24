async = require('async');

var d = require('domain').create();
d.on('error', function (er) {
	console.error('domain master', er.message, er.stack);
	process.exit(0);
});
d.run(function () {
	async.auto({
        config: function (cb) {
            cb(null, {
                "db": "./blockchain.db",
                "modules": {
                    "blocks": "./modules/blocks.js",
                    "transport": "./modules/transport.js",
                    "accounts": "./modules/accounts.js"
                }
            });
        },

        configuration : function (cb) {
            var config = require("./config.json");
            cb(null, config);
        },

		logger: function (cb) {
			var logger = require('./logger.js');
			cb(null, logger);
		},

		db: ['config', function (cb, scope) {
			var sqlite3 = require('./helpers/db.js');
			sqlite3.connect(scope.config.db, cb);
		}],

		modules: ['db', 'config', function (cb, scope) {
			var tasks = {};
			Object.keys(scope.config.modules).forEach(function (name) {
				tasks[name] = function (cb) {
					var Klass = new require(scope.config.modules[name]);
					new Klass(cb, scope);
				}
			});
			async.parallel(tasks, function (err, results) {
				cb(err, results);
			});
		}],
		ready: ['modules', function (cb, scope) {
			Object.keys(scope.modules).forEach(function (name) {
				if (typeof(scope.modules[name].run) == 'function') {
					scope.modules[name].run(scope.modules);
				}
			})
		}]
	}, function (err, scope) {
		if (err) {
			console.log(err)
		}
	});
});