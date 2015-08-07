var async = require('async');
var jsonSql = require('json-sql')();
var extend = require('extend');
var sandboxHelper = require('../helpers/sandbox.js')

// private fields
var modules, library, self, private = {}, shared = {};

private.loaded = false;

//constructor
function Sql(cb, scope) {
	library = scope;
	self = this;
	self.__private = private;

	setImmediate(cb, null, self);
}

//private methods
private.query = function (action, config, cb) {
	config.table = "dapp_" + config.dappid + "_" + config.table;

	var defaultConfig = {
		type: action
	};

	var sql = jsonSql.build(extend(config, defaultConfig));

	library.dbLite.query(sql.query, sql.values, function (err, data) {
		cb(err, data);
	});
}

//public methods
Sql.prototype.createTables = function (dappid, config, cb) {
	var sqles = [];
	for (var i = 0; i < config.length; i++) {
		config[i].table = "dapp_" + dappid + "_" + config[i].table;
		if (config[i].type == "table") {
			config[i].type = "create";
		} else if (config[i].type == "index") {
			config[i].type = "index";
		} else {
			return setImmediate(cb, "Unknown table type: " + config[i].type);
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

/*
 Drop tables functional
 */
Sql.prototype.dropTables = function (dappid, config, cb) {
	var tables = [];
	for (var i = 0; i < config.length; i++) {
		config[i].table = "dapp_" + dappid + "_" + config[i].table;
		tables.push({name: config[i].table.replace(/[^\w_]/gi, ''), type: config[i].type});
	}

	async.eachSeries(tables, function (table, cb) {
		if (table.type == "table") {
			library.dbLite.query("DROP TABLE " + table.name, function (err, rows) {
				setImmediate(cb, err);
			});
		} else if (table.type == "index") {
			library.dbLite.query("DROP INDEX " + table.name, function (err, rows) {
				setImmediate(cb, err);
			})
		}
	}, cb);
}

Sql.prototype.sandboxApi = function (call, args, cb) {
	sandboxHelper.callMethod(shared, call, args, cb);
}

//events
Sql.prototype.onBind = function (scope) {
	modules = scope;
}

Sql.prototype.onBlockchainReady = function () {
	private.loaded = true;
}

//shared
shared.select = function (req, cb) {
	var config = extend({}, req.body, {dappid: req.dappid});
	private.query.call(this, "select", config, cb);
}

shared.insert = function (req, cb) {
	var config = extend({}, req.body, {dappid: req.dappid});
	private.query.call(this, "insert", config, cb);
}

shared.update = function (req, cb) {
	var config = extend({}, req.body, {dappid: req.dappid});
	private.query.call(this, "update", config, cb);
}

shared.remove = function (req, cb) {
	var config = extend({}, req.body, {dappid: req.dappid});
	private.query.call(this, "remove", config, cb);
}

module.exports = Sql;