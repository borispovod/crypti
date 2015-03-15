var util = require('util');

module.exports = {
	int: function (val, nullable) {
		if (nullable === true && (val === null || val === undefined)) {
			return null;
		}

		var res = parseInt(val, 10);
		return isNaN(res) ? 0 : res;
	},
	string: function (val, nullable) {
		if (nullable === true && (val === null || val === undefined)) {
			return null;
		}
		return (val || '').toString();
	},
	bool: function (val, nullable) {
		if (nullable === true && (val === null || val === undefined)) {
			return null;
		}
		var res = ((val + '').toLowerCase() == "false" || (val + '').toLowerCase() == "f") ? false : val;
		return !!res;
	},
	float: function (val, nullable) {
		if (nullable === true && (val === null || val === undefined)) {
			return null;
		}
		var res = parseFloat(val);
		return isNaN(res) ? 0 : res;
	},
	buffer: function (val, mode, nullable) {
		if (nullable === true && (val === null || val === undefined)) {
			return null;
		}
		try {
			var res = new Buffer(val || '', mode)
		} catch (e) {
			var res = new Buffer('');
		}
		return res;
	},
	hex: function (val, nullable) {
		var res = this.string(val, nullable);
		if (nullable === true && res === null) {
			return null;
		}
		if (res && res.length && (res.length % 2 == 0) && (/^[a-f0-9]+$/i.exec(res))) {
			return res;
		} else {
			throw Error("can't valid hex " + val);
			return null; //not valid hex
		}
	},
	object: function (val, nullable) {
		if (nullable === true && (val === null || val === undefined)) {
			return null;
		}
		var res = Object.prototype.toString.call(val) == "[object Object]" ? val : {};
		return res;
	},

	array: function (val, nullable) {
		if (nullable === true && (val === null || val === undefined)) {
			return null;
		}
		return util.isArray(val) ? val : [];
	},

	variant: function (val, nullable) {
		if (nullable === true && (val === null || val === undefined)) {
			return null;
		}
		var res = val === undefined ? '' : val;
		return res;
	}
}