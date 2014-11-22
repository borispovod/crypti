async = require('async');

var config = {
	"db": "../blockchain.db",
	"models": ["blockchain"],
	"services": ["transport"]
}

async.auto({
	db: function (cb) {
		var db = new sqlite3.cached.Database(config.db);
		cb(null, db);
	},
	models: ['db', function (cb, scope) {
		var models = {};
		config.models.length && config.models.forEach(function (module) {
			models[module] = function (cb) {
				require('./' + module + '.js').create(scope, cb);
			}
		});
		async.parallel(models, cb);
	}],
	services: ['models', function (cb, scope) {
		var services = {};
		config.services.length && config.services.forEach(function (module) {
			services[module] = function (cb) {
				require('./' + module + '.js').create(scope, cb);
			}
		});
		async.parallel(services, cb);
	}]
}, function (err, scope) {
	if (err) {
		console.log(err)
	}
});