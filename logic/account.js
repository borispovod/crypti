var async = require('async');
var jsonSql = require('json-sql')();
RequestSanitizer = require('../helpers/request-sanitizer.js');

//constructor
function Account(dbLite, cb) {
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
		dbLite.query(command, function (err, data) {
			cb(err, data);
		});
	}, function (err) {
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

	console.log(account, this.filter, report.isValid)

	return report.value;
}

Account.prototype.adapter = function (raw) {
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
		fields: this.model.map(function (field) {
			return field.name;
		})
	});
	this.dbLite.query(sql.query, sql.values, function (err, data) {
		if (err) {
			return cb(err);
		}
		try {
			data = data && data.length ? this.objectNormalize(data[0]) : null;
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
		fields: this.model.map(function (field) {
			return field.name;
		})
	});
	this.dbLite.query(sql.query, sql.values, function (err, data) {
		if (err) {
			return cb(err);
		}

		var accounts = [];
		try {
			for (var i = 0; i < data.length; i++) {
				accounts.push(this.objectNormalize(data[i]));
			}
		} catch (e) {
			return cb(e.toString());
		}

		cb(null, accounts);
	}.bind(this));
}

Account.prototype.set = function (address, fields, cb) {
	fields.address = address;
	var account = this.adapter(fields);

	try {
		account = this.objectNormalize(account)
	} catch (e) {
		return cb(e.toString());
	}

	console.log(account)

	var sql = jsonSql.build({
		type: 'insert',
		or: "replace",
		table: this.table,
		values: account
	});
	this.dbLite.query(sql.query, sql.values, function (err, data) {
		if (err) {
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
	this.dbLite.query(sql.query, sql.values, function (err, data) {
		cb(err, address);
	});
}

//export
module.exports = Account;