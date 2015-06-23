var async = require('async');
var jsonSql = require('json-sql')();
RequestSanitizer = require('../helpers/request-sanitizer.js');

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
			conv: String
		},
		{
			name: "following",
			type: "Text",
			filter: "string",
			conv: String
		},
		{
			name: "followers",
			type: "Text",
			filter: "string",
			conv: String
		},
		{
			name: "multisignatures",
			type: "Text",
			filter: "string",
			conv: String
		}
	];

	this.fields = this.model.map(function (field) {
		var _tmp = {};
		if (field.type == "Binary") {
			_tmp.expression = ['lower', 'hex'];
		}

		if (field.expression) {
			_tmp.expression = field.mod;
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
		if (!field.constante) {
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

	async.eachSeries(sqles, function (command, cb) {
		scope.dbLite.query(command, function (err, data) {
			cb(err, data);
		});
	}.bind(this), function (err) {
		setImmediate(cb, err, this);
	}.bind(this));
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
	account.delegates = raw.delegates || null;
	account.followers = raw.followers || null;
	account.following = raw.following || null;
	account.multisignatures = raw.multisignature || null;

	return account;
}

Account.prototype.get = function (filter, cb) {
	var sql = jsonSql.build({
		type: 'select',
		table: this.table,
		condition: filter,
		fields: this.fields
	});

	console.log(sql.query, sql.values)

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

	console.log(sql.query, sql.values)

	this.scope.dbLite.query(sql.query, sql.values, function (err, data) {
		cb(err, data);
	});
}

Account.prototype.merge = function (address, diff, cb) {
	var modifier = {};

	this.editable.forEach(function (value) {
		if (diff[value]) {
			var trueValue = diff[value];
			if (Math.abs(trueValue) === trueValue) {
				modifier.$inc = modifier.$inc || {};
				modifier.$inc[value] = trueValue;
			}
			else if (trueValue < 0) {
				modifier.$dec = modifier.$dec || {};
				modifier.$dec[value] = trueValue;
			}
		}
	});

	var sql = jsonSql.build({
		type: 'update',
		table: this.table,
		modifier: modifier,
		condition: {
			address: address
		}
	});

	console.log(sql.query, sql.values)

	this.scope.dbLite.query(sql.query, sql.values, function (err, data) {
		if (err){
			return cb(err);
		}
		this.get({address: address}, cb);
	}.bind(this));
}

Account.prototype.remove = function (address, cb) {
	var sql = jsonSql.build({
		type: 'delete',
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