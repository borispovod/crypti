var async = require('async');
var jsonSql = require('json-sql')();
var extend = require('extend');

var modules, library, self, private = {};

private.loaded = false;

function Sql(cb, scope) {
	library = scope;
	self = this;
	self.__private = private;

	setImmediate(cb, null, sql);
}

Sql.prototype.createTables = function (dappid, config, cb) {
	var sqles = [];
	for (var i = 0; i < config.length; i++) {
		config[i].table = "dapp_" + dappid + "_" + config[i].table;
		if (config[i].type == "table") {
			config[i].type = "create";
		} else if (config[i].type == "index") {
			config[i].type = "index";
		}

		var sql = jsonSql.build(config[i]);
		sqles.push(sql.query);
	}

	async.eachSeries(sqles, function (command, cb) {
		library.dbLite.query(command, function (err, data) {
			cb(err, data);
		});
	}, function (err) {
		setImmediate(cb, err, self);
	});
}


private.query = function (action, config, cb) {
	config.table = "dapp_" + config.dappid + "_" + config.table;

	var defaultConfig = {
		type: action
	};

	var sql = jsonSql.build(extend(config, defaultConfig));

	private.dbLite.query(sql.query, sql.values, function (err, data) {
		cb(err, data);
	});
}

Sql.prototype.select = function (config, cb) {
	private.query.call(this, "select", config, cb);
}

Sql.prototype.insert = function (config, cb) {
	private.query.call(this, "insert", config, cb);
}

Sql.prototype.update = function (config, cb) {
	private.query.call(this, "update", config, cb);
}

Sql.prototype.remove = function (config, cb) {
	private.query.call(this, "remove", config, cb);
}

Sql.prototype.onBind = function (scope) {
	modules = scope;
}

Sql.prototype.onBlockchainReady = function () {
	private.loaded = true;
}

Sql.prototype.sandboxApi = function (call, data, cb) {

}

module.exports = Sql;