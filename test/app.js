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
				"db": "../blockchain.db",
				"modules": {
					"blocks": "./blocks.js",
					"transport": "./transport.js",
                    "accounts" : "./accounts.js"
				}
			});
		},

		db: ['config', function (cb, scope) {
			var sqlite3 = require('sqlite3');

			var db = new sqlite3.Database(scope.config.db);

			cb(null, db);
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