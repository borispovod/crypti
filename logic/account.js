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
			not_null: true,
			unique: true,
			filter: "hex!",
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
			conv: Number
		},
		{
			name: "delegates",
			type: "Text",
			filter: "string",
			conv: String,
			expression: "(select GROUP_CONCAT(dependentId) from " + this.table + "2delegates where accountId = a.address)"
		},
		{
			name: "contacts",
			type: "Text",
			filter: "string",
			conv: String,
			expression: "(select GROUP_CONCAT(dependentId) from " + this.table + "2contacts where accountId = a.address)"
		},
		{
			name: "followers",
			type: "Text",
			filter: "string",
			conv: String,
			expression: "(select GROUP_CONCAT(accountId) from " + this.table + "2contacts where dependentId = a.address)",
			readonly: true
		},
		{
			name: "multisignatures",
			type: "Text",
			filter: "string",
			conv: String,
			expression: "(select GROUP_CONCAT(dependentId) from " + this.table + "2multisignatures where accountId = a.address)"
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

	async.eachSeries(sqles, function (command, cb) {
		scope.dbLite.query(command, function (err, data) {
			cb(err, data);
		});
	}.bind(this), function (err) {
		setImmediate(cb, err, this);
	}.bind(this));
}

private.reverseDiff = function (diff) {
	var copyDiff = diff.slice();
	for (var i = 0; i < copyDiff.length; i++) {
		var math = copyDiff[i][0] == '-' ? '+' : '-';
		copyDiff[i] = math + copyDiff[i].slice(1);
	}
	return copyDiff;
}

private.applyDiff = function (source, diff) {
	var res = source ? source.slice() : [];

	for (var i = 0; i < diff.length; i++) {
		var math = diff[i][0];
		var publicKey = diff[i].slice(1);

		if (math == "+") {
			res = res || [];

			var index = -1;
			if (res) {
				index = res.indexOf(publicKey);
			}
			if (index != -1) {
				return false;
			}

			res.push(publicKey);
		}
		if (math == "-") {
			var index = -1;
			if (res) {
				index = res.indexOf(publicKey);
			}
			if (index == -1) {
				return false;
			}
			res.splice(index, 1);
			if (!res.length) {
				res = null;
			}
		}
	}
	return res;
}

Account.prototype.dbRead = function (raw) {
	if (!raw.t_id) {
		return null
	} else {
		var account = {
			id: raw.t_id,
			height: raw.b_height,
			blockId: raw.b_id,
			type: parseInt(raw.t_type),
			timestamp: parseInt(raw.t_timestamp),
			senderPublicKey: raw.t_senderPublicKey,
			senderId: raw.t_senderId,
			recipientId: raw.t_recipientId,
			senderUsername: raw.t_senderUsername,
			recipientUsername: raw.t_recipientUsername,
			amount: parseInt(raw.t_amount),
			fee: parseInt(raw.t_fee),
			signature: raw.t_signature,
			signSignature: raw.t_signSignature,
			confirmations: raw.t_confirmations,
			asset: {}
		}

		return account;
	}
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

Account.prototype.get = function (filter, cb) {
	var sql = jsonSql.build({
		type: 'select',
		table: this.table,
		alias: 'a',
		condition: filter,
		fields: this.fields
		//join: [
		//	{
		//		type: 'inner',
		//		table: this.table + "2delegates",
		//		alias: 'd',
		//		on: {'a.address': 'd.accountId'}
		//	}, {
		//		type: 'inner',
		//		table: this.table + "2contacts",
		//		alias: 'c',
		//		on: {'a.address': 'c.accountId'}
		//	}
		//]
	});

	this.scope.dbLite.query(sql.query, sql.values, this.conv, function (err, data) {
		if (err) {
			return cb(err);
		}
		try {
			data = data && data.length ? data[0] : null;
		} catch (e) {
			return cb(e.toString());
		}
		cb(null, data);
	}.bind(this));
}

Account.prototype.getAll = function (filter, cb) {
	var sql = jsonSql.build({
		type: 'select',
		table: this.table,
		condition: filter,
		fields: this.fields
	});
	this.scope.dbLite.query(sql.query, sql.values, this.conv, function (err, data) {
		if (err) {
			return cb(err);
		}

		cb(null, data);
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
			switch (typeof trueValue) {
				case "number":
					if (Math.abs(trueValue) === trueValue) {
						update.$inc = update.$inc || {};
						update.$inc[value] = trueValue;
					}
					else if (trueValue < 0) {
						update.$dec = update.$dec || {};
						update.$dec[value] = Math.abs(trueValue);
					}
					break;
				case "string":
					var diffarr = trueValue.split(",");
					for (var i = 0; i < diffarr.length; i++) {
						var math = diffarr[i][0];
						var val = diffarr[i].slice(1);
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
			cb(err);
			//self.scope.dbLite.query('ROLLBACK;', function (rollbackErr) {
			//	console.log("ROLLBACK")
			//	cb(rollbackErr || err);
			//});
		} else {
			if (sqles.length > 1) {
				self.scope.dbLite.query('COMMIT;', function (err) {
					self.get({address: address}, cb);
				});
			}
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