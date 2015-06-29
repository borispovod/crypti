var async = require('async');
var jsonSql = require('json-sql')();
RequestSanitizer = require('../helpers/request-sanitizer.js');

var private = {};

//constructor
function Account(scope, cb) {
	this.scope = scope;

	this.table = "mem_accounts";

	this.model = [
		{
			name: "username",
			type: "String",
			length: 20,
			filter: "string?",
			conv: String,
			constante: true
		},
		{
			name: "isDelegate",
			type: "BigInt",
			filter: "string?",
			conv: Boolean,
			default: 0
		},
		{
			name: "u_isDelegate",
			type: "BigInt",
			filter: "string?",
			conv: Boolean,
			default: 0
		},
		{
			name: "u_username",
			type: "String",
			length: 20,
			filter: "string?",
			conv: String,
			constante: true
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
			},
			conv: String,
			constante: true
		},
		{
			name: "publicKey",
			type: "Binary",
			length: 32,
			filter: "hex?",
			conv: String,
			constante: true
		},
		{
			name: "secondPublicKey",
			type: "Binary",
			length: 32,
			filter: "hex?",
			conv: String,
			constante: true
		},
		{
			name: "balance",
			type: "BigInt",
			filter: "int",
			conv: Number,
			default: 0
		},
		{
			name: "u_balance",
			type: "BigInt",
			filter: "int",
			conv: Number,
			default: 0
		},
		{
			name: "delegates",
			type: "Text",
			filter: "string",
			conv: Array,
			expression: "(select GROUP_CONCAT(dependentId) from " + this.table + "2delegates where accountId = a.address)"
		},
		{
			name: "contacts",
			type: "Text",
			filter: "string",
			conv: Array,
			expression: "(select GROUP_CONCAT(dependentId) from " + this.table + "2contacts where accountId = a.address)"
		},
		{
			name: "followers",
			type: "Text",
			filter: "string",
			conv: Array,
			expression: "(select GROUP_CONCAT(accountId) from " + this.table + "2contacts where dependentId = a.address)",
			readonly: true
		},
		{
			name: "u_delegates",
			type: "Text",
			filter: "string",
			conv: Array,
			expression: "(select GROUP_CONCAT(dependentId) from " + this.table + "2u_delegates where accountId = a.address)"
		},
		{
			name: "u_contacts",
			type: "Text",
			filter: "string",
			conv: Array,
			expression: "(select GROUP_CONCAT(dependentId) from " + this.table + "2u_contacts where accountId = a.address)"
		},
		{
			name: "u_followers",
			type: "Text",
			filter: "string",
			conv: Array,
			expression: "(select GROUP_CONCAT(accountId) from " + this.table + "2u_contacts where dependentId = a.address)",
			readonly: true
		},
		{
			name: "multisignatures",
			type: "Text",
			filter: "string",
			conv: Array,
			expression: "(select GROUP_CONCAT(dependentId) from " + this.table + "2multisignatures where accountId = a.address)"
		},
		{
			name: "u_multisignatures",
			type: "Text",
			filter: "string",
			conv: Array,
			expression: "(select GROUP_CONCAT(dependentId) from " + this.table + "2u_multisignatures where accountId = a.address)"
		}, {
			name: "multimin",
			type: "BigInt",
			filter: "int",
			conv: Number,
			default: 0
		}, {
			name: "u_multimin",
			type: "BigInt",
			filter: "int",
			conv: Number,
			default: 0
		}, {
			name: "multilifetime",
			type: "BigInt",
			filter: "int",
			conv: Number,
			default: 0
		}, {
			name: "u_multilifetime",
			type: "BigInt",
			filter: "int",
			conv: Number,
			default: 0
		}
	];

	this.fields = this.model.map(function (field) {
		var _tmp = {};
		if (field.type == "Binary") {
			_tmp.expression = ['lower', 'hex'];
		}

		if (field.expression) {
			_tmp.expression = field.expression;
		} else {
			if (field.mod) {
				_tmp.expression = field.mod;
			}
			_tmp.field = field.name;
		}
		if (_tmp.expression || field.alias) {
			_tmp.alias = field.alias || field.name;
		}

		return _tmp;
	});

	this.filter = {};
	this.model.forEach(function (field) {
		this.filter[field.name] = field.filter;
	}.bind(this));

	this.conv = {};
	this.model.forEach(function (field) {
		this.conv[field.name] = field.conv;
	}.bind(this));

	this.editable = [];
	this.model.forEach(function (field) {
		if (!field.constante && !field.readonly) {
			this.editable.push(field.name);
		}
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

	var sql = jsonSql.build({
		type: "index",
		table: this.table,
		name: this.table + "_publicKey_unique",
		indexOn: "publicKey",
		condition: {
			publicKey: {
				$isnot: null
			}
		}
	});
	sqles.push(sql.query);

	var sql = jsonSql.build({
		type: 'create',
		table: this.table + "2delegates",
		tableFields: [
			{
				name: "accountId",
				type: "String",
				length: 21,
				not_null: true
			}, {
				name: "dependentId",
				type: "String",
				length: 21,
				not_null: true
			}
		]
	});
	sqles.push(sql.query);

	var sql = jsonSql.build({
		type: 'create',
		table: this.table + "2contacts",
		tableFields: [
			{
				name: "accountId",
				type: "String",
				length: 21,
				not_null: true
			}, {
				name: "dependentId",
				type: "String",
				length: 21,
				not_null: true
			}
		]
	});
	sqles.push(sql.query);

	var sql = jsonSql.build({
		type: 'create',
		table: this.table + "2u_delegates",
		tableFields: [
			{
				name: "accountId",
				type: "String",
				length: 21,
				not_null: true
			}, {
				name: "dependentId",
				type: "String",
				length: 21,
				not_null: true
			}
		]
	});
	sqles.push(sql.query);

	var sql = jsonSql.build({
		type: 'create',
		table: this.table + "2u_contacts",
		tableFields: [
			{
				name: "accountId",
				type: "String",
				length: 21,
				not_null: true
			}, {
				name: "dependentId",
				type: "String",
				length: 21,
				not_null: true
			}
		]
	});
	sqles.push(sql.query);

	var sql = jsonSql.build({
		type: 'create',
		table: this.table + "2multisignatures",
		tableFields: [
			{
				name: "accountId",
				type: "String",
				length: 21,
				not_null: true
			}, {
				name: "dependentId",
				type: "String",
				length: 21,
				not_null: true
			}
		]
	});
	sqles.push(sql.query);

	var sql = jsonSql.build({
		type: 'create',
		table: this.table + "2u_multisignatures",
		tableFields: [
			{
				name: "accountId",
				type: "String",
				length: 21,
				not_null: true
			}, {
				name: "dependentId",
				type: "String",
				length: 21,
				not_null: true
			}
		]
	});
	sqles.push(sql.query);

	async.eachSeries(sqles, function (command, cb) {
		scope.dbLite.query(command, function (err, data) {
			cb(err, data);
		});
	}.bind(this), function (err) {
		setImmediate(cb, err, this);
	}.bind(this));
}

Account.prototype.objectNormalize = function (account) {
	var report = RequestSanitizer.validate(account, {
		object: true,
		properties: this.filter
	});

	if (!report.isValid) {
		throw Error(report.issues);
	}

	return report.value;
}

Account.prototype.toDB = function (raw) {
	var account = {};
	account.address = raw.address;
	account.balance = raw.balance || 0;
	account.publicKey = raw.publicKey ? new Buffer(raw.publicKey, "hex") : null;
	account.secondPublicKey = raw.secondPublicKey ? new Buffer(raw.secondPublicKey, "hex") : null;
	account.username = raw.username || null;

	return account;
}

Account.prototype.get = function (filter, fields, cb) {
	if (arguments.length == 2) {
		cb = fields;
		fields = this.fields.map(function (field) {
			return field.alias || field.field;
		});
	}
	this.getAll(filter, fields, function (err, data) {
		cb(err, data && data.length ? data[0] : null)
	})
}

Account.prototype.getAll = function (filter, fields, cb) {
	if (arguments.length == 2) {
		cb = fields;
		fields = this.fields.map(function (field) {
			return field.alias || field.field;
		});
	}

	var realFields = this.fields.filter(function (field) {
		return fields.indexOf(field.alias || field.field) != -1;
	});

	var sql = jsonSql.build({
		type: 'select',
		table: this.table,
		alias: 'a',
		condition: filter,
		fields: realFields
	});

	this.scope.dbLite.query(sql.query, sql.values, this.conv, function (err, data) {
		if (err) {
			return cb(err);
		}

		cb(null, data || []);
	}.bind(this));
}

Account.prototype.set = function (address, fields, cb) {
	fields.address = address;

	try {
		var account = this.objectNormalize(fields);
	} catch (e) {
		return cb(e.toString());
	}

	var sql = jsonSql.build({
		type: 'insert',
		or: "replace",
		table: this.table,
		values: this.toDB(account)
	});

	this.scope.dbLite.query(sql.query, sql.values, function (err, data) {
		cb(err, data);
	});
}

Account.prototype.merge = function (address, diff, cb) {
	var update = {}, remove = {}, insert = {};

	var self = this;

	this.editable.forEach(function (value) {
		if (diff[value]) {
			var trueValue = diff[value];
			switch (self.conv[value]) {
				case Number:
					if (Math.abs(trueValue) === trueValue) {
						update.$inc = update.$inc || {};
						update.$inc[value] = trueValue;
					}
					else if (trueValue < 0) {
						update.$dec = update.$dec || {};
						update.$dec[value] = Math.abs(trueValue);
					}
					break;
				case Array:
					for (var i = 0; i < trueValue.length; i++) {
						var math = trueValue[i][0];
						var val = trueValue[i].slice(1);
						if (math == "-") {
							remove[value] = remove[value] || [];
							remove[value].push(val);
						} else if (math == "+") {
							insert[value] = insert[value] || [];
							insert[value].push(val)
						}
					}
					break;
			}
		}
	});

	var sqles = [];

	if (Object.keys(remove).length) {
		Object.keys(remove).forEach(function (el) {
			var sql = jsonSql.build({
				type: 'remove',
				table: self.table + "2" + el,
				condition: {
					dependentId: {$in: remove[el]}
				}
			});
			sqles.push(sql);
		});
	}

	if (Object.keys(insert).length) {
		Object.keys(insert).forEach(function (el) {
			for (var i = 0; i < insert[el].length; i++) {
				var sql = jsonSql.build({
					type: 'insert',
					table: self.table + "2" + el,
					values: {
						accountId: address,
						dependentId: insert[el][i]
					}
				});
				sqles.push(sql);
			}
		});
	}

	if (Object.keys(update).length) {
		var sql = jsonSql.build({
			type: 'update',
			table: this.table,
			modifier: update,
			condition: {
				address: address
			}
		});
		sqles.push(sql);
	}

	if (sqles.length > 1) {
		self.scope.dbLite.query('BEGIN TRANSACTION;');
	}
	async.eachSeries(sqles, function (sql, cb) {
		self.scope.dbLite.query(sql.query, sql.values, function (err, data) {
			cb(err, data);
		});
	}, function (err) {
		if (err) {
			return cb(err);
		}
		if (sqles.length > 1) {
			self.scope.dbLite.query('COMMIT;', function (err) {
				self.get({address: address}, cb);
			});
		} else {
			self.get({address: address}, cb);
		}
	});
}

Account.prototype.remove = function (address, cb) {
	var sql = jsonSql.build({
		type: 'remove',
		table: this.table,
		condition: {
			address: address
		}
	});
	this.scope.dbLite.query(sql.query, sql.values, function (err, data) {
		cb(err, address);
	});
}

//export
module.exports = Account;