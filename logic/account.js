var async = require('async');
var jsonSql = require('json-sql')();
RequestSanitizer = require('../helpers/request-sanitizer.js');

//constructor
function Accounts(dbLite, cb) {
	this.dbLite = dbLite;

	this.table = "mem_accounts";

	this.model = [
		{
			name: "username",
			type: "String",
			length: 20,
			filter: "string?"
		},
		{
			name: "address",
			type: "String",
			length: 21,
			not_null: true,
			unique: true,
			primary_key: true,
			filter: {
				required: true,
				string: true,
				minLength: 1
			}
		},
		{
			name: "publicKey",
			type: "Binary",
			length: 32,
			not_null: true,
			unique: true,
			filter: "hex!"
		},
		{
			name: "secondPublicKey",
			type: "Binary",
			length: 32,
			filter: "hex?"
		},
		{
			name: "balance",
			type: "BigInt",
			filter: "int"
		},
		{
			name: "delegates",
			type: "Text",
			filter: "string"
		},
		{
			name: "following",
			type: "Text",
			filter: "string"
		},
		{
			name: "followers",
			type: "Text",
			filter: "string"
		},
		{
			name: "multisignatures",
			type: "Text",
			filter: "string"
		}
	];

	this.fields = this.model.map(function (field) {
		return field.name;
	});

	this.filter = {};
	this.model.forEach(function (field) {
		this.filter[field.name] = field.filter;
	}.bind(this));

	var sqles = [];

	var sql = jsonSql.build({
		type: 'create',
		table: this.table,
		tableFields: this.model
	});
	sqles.push(sql.query);

	var sql = jsonSql.build({
		type: "index",
		table: this.table,
		name: this.table + "_username_unique",
		indexOn: "username",
		condition: {
			username: {
				$isnot: null
			}
		}
	});
	sqles.push(sql.query);

	async.eachSeries(sqles, function (command, cb) {
		console.log(command);
		dbLite.query(command, function (err, data) {
			cb(err, data);
		});
	}, function (err) {
		cb(err, null, this);
	}.bind(this));
}

Accounts.prototype.get = function (filter, cb) {
	var sql = jsonSql.build({
		type: 'select',
		table: this.table,
		condition: filter,
		fields: this.model.map(function (field) {
			return field.name;
		})
	});
	console.log(sql.query, sql.values);
	this.dbLite(sql.query, sql.values, cb);
}

Accounts.prototype.set = function (address, fields, cb) {
	var keys = Object.keys(fields);
	for (var i = 0; i < keys.length; i++) {
		if (this.fields.indexOf(keys[i]) == -1) {
			return;
		}
	}
	fields.address = address;
	var sql = jsonSql.build({
		type: 'insert',
		or: "replace",
		table: this.table,
		values: fields
	});
	console.log(sql.query, sql.values)
	this.dbLite(sql.query, sql.values, function (err, data) {
		cb(err, data);
	});
}

Accounts.prototype.remove = function (address, cb) {
	var sql = jsonSql.build({
		type: 'delete',
		table: this.table,
		condition: {
			address: address
		}
	});
	console.log(sql.query, sql.values)
	this.dbLite(sql.query, sql.values, function (err, data) {
		cb(err, data);
	});
}

//export
module.exports = Accounts;