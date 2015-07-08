var async = require('async');
var jsonSql = require('json-sql')();
var extend = require('extend');

var private = {};

//constructor
function Dapp(dappid, config, cb) {
	var self = this;
	this.dappid = dappid;

	var sqles = [];
	for (var i = 0; i < config.length; i++) {
		config[i].table = "dapp_" + this.dappid + "_" + config[i].table;
		if (config[i].type == "table") {
			config[i].type = "create";
		} else if (config[i].type == "index") {
			config[i].type = "index";
		}
		var sql = jsonSql.build(config);
		sqles.push(sql.query);
	}

	async.eachSeries(sqles, function (command, cb) {
		private.dbLite.query(command, function (err, data) {
			cb(err, data);
		});
	}, function (err) {
		setImmediate(cb, err, self);
	});
}

private.query = function (action, config, cb) {
	config.table = "dapp_" + this.dappid + "_" + config.table;

	var defaultConfig = {
		type: action
	};

	var sql = jsonSql.build(extend(config, defaultConfig));

	private.dbLite.query(sql.query, sql.values, function (err, data) {
		cb(err, data);
	});
}

Dapp.prototype.select = function (config, cb) {
	private.query.call(this, "select", config, cb);
}

Dapp.prototype.insert = function (config, cb) {
	private.query.call(this, "insert", config, cb);
}

Dapp.prototype.update = function (config, cb) {
	private.query.call(this, "update", config, cb);
}

Dapp.prototype.remove = function (config, cb) {
	private.query.call(this, "remove", config, cb);
}

//export
module.exports = function(dbLite){
	private.dbLite = dbLite;
	return Dapp;
};